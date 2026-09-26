import { NextFunction, Request, Response } from "express";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";
import { logger } from "../config/logger";
import { env } from "../config/env";

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route introuvable : ${req.method} ${req.originalUrl}`));
}

/**
 * Gestionnaire d'erreurs central. Les erreurs métier (ApiError) renvoient leur
 * message tel quel. Toute autre erreur (bug, exception non prévue, erreur Prisma...)
 * est journalisée en détail côté serveur mais renvoyée au client sous une forme
 * générique, afin de ne jamais divulguer de détails techniques sensibles.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Corps JSON malformé (ex: JSON.parse échoue dans express.json()) : body-parser
  // lève une SyntaxError avec status 400 — sans ce cas explicite elle tombait
  // dans le handler générique ci-dessous et renvoyait un 500 "Erreur non gérée"
  // pour ce qui est en réalité une erreur client (input invalide, pas un bug
  // serveur), trouvé lors d'un audit de sécurité offensif (payload JSON invalide
  // envoyé volontairement).
  if (err instanceof SyntaxError && (err as { status?: number; type?: string }).status === 400 && "body" in err) {
    logger.warn({ path: req.originalUrl }, "Corps de requête JSON invalide");
    return res.status(400).json({
      error: { code: "BAD_REQUEST", message: "Corps de requête JSON invalide." },
    });
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Le fichier dépasse la taille maximale autorisée (${env.MAX_UPLOAD_SIZE_MB} Mo).`
        : "Fichier invalide.";
    return res.status(400).json({ error: { code: "BAD_REQUEST", message } });
  }

  if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
    return res.status(400).json({
      error: { code: "BAD_REQUEST", message: "Format d'image non supporté (JPEG, PNG, WebP ou HEIC attendus)." },
    });
  }

  // Contrainte unique violée côté base (ex : deux requêtes concurrentes qui
  // passent toutes deux le contrôle applicatif "pas de doublon" avant que
  // l'une des deux insertions n'ait été validée) — traduit en 409 propre
  // plutôt que de laisser fuiter un 500 générique avec la structure de la
  // table concernée.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    logger.warn({ code: "P2002", path: req.originalUrl }, "Contrainte d'unicité violée");
    return res.status(409).json({
      error: { code: "CONFLICT", message: "Cette action a déjà été effectuée ou entre en conflit avec une donnée existante." },
    });
  }

  if (err instanceof ApiError) {
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.originalUrl }, "Erreur serveur");
    } else {
      logger.warn({ code: err.code, path: req.originalUrl }, err.message);
    }
    return res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  logger.error({ err, path: req.originalUrl }, "Erreur non gérée");

  return res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Une erreur interne est survenue. Réessayez plus tard.",
      ...(env.isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  });
}
