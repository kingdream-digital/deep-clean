import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";
import { verifyAccessToken } from "../utils/tokens";
import { prisma } from "../db/prisma";

interface AuthenticateOptions {
  /**
   * Tant qu'un utilisateur n'a pas défini son propre mot de passe (première
   * connexion avec le mot de passe temporaire fourni par la RH, ou après une
   * réinitialisation d'accès), il ne doit pouvoir faire qu'une chose : le
   * changer (cahier des charges §5) — bloqué par défaut sur toute route.
   * Seules les 3 routes de `/auth` qui doivent rester utilisables dans cet
   * état (`/me`, `/change-password`, `/logout`) passent `true` ici. Un seul
   * point de contrôle dans `authenticate()` lui-même, plutôt qu'un middleware
   * séparé à recoller sur chaque routeur : un futur module ne peut plus
   * oublier ce blocage, il est appliqué par construction.
   */
  allowPasswordChangePending?: boolean;
}

/**
 * Vérifie le token d'accès JWT, s'assure que la session correspondante est toujours
 * valide (non révoquée) et que le compte est toujours actif, puis attache `req.auth`.
 * Ne fait jamais confiance au contenu du token seul : un compte désactivé après
 * l'émission du token perd immédiatement l'accès.
 */
export function authenticate(options: AuthenticateOptions = {}) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const header = req.headers.authorization;
      if (!header?.startsWith("Bearer ")) {
        throw ApiError.unauthorized();
      }

      const token = header.slice("Bearer ".length);
      let payload;
      try {
        payload = verifyAccessToken(token);
      } catch {
        throw ApiError.unauthorized("Session invalide ou expirée.");
      }

      const session = await prisma.session.findUnique({
        where: { id: payload.sessionId },
        include: { user: true },
      });

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        throw ApiError.unauthorized("Session invalide ou expirée.");
      }
      if (!session.user.isActive) {
        throw ApiError.forbidden(
          "Ce compte a été désactivé. Contactez la RH pour tout problème de connexion ou de compte."
        );
      }
      if (session.user.mustChangePassword && !options.allowPasswordChangePending) {
        throw ApiError.forbidden("Vous devez d'abord définir votre propre mot de passe.");
      }

      req.auth = {
        userId: session.user.id,
        role: session.user.role,
        sessionId: session.id,
        mustChangePassword: session.user.mustChangePassword,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
