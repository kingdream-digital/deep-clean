import { Role } from "@prisma/client";
import { NextFunction, Request, Response } from "express";
import { ApiError } from "../utils/ApiError";

/**
 * Contrôle des rôles côté serveur — jamais uniquement côté mobile.
 * `authenticate()` doit être appliqué avant ce middleware sur la route.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(ApiError.unauthorized());
    }
    if (!allowedRoles.includes(req.auth.role)) {
      return next(ApiError.forbidden());
    }
    next();
  };
}

/**
 * Vérifie que l'utilisateur agit sur ses propres données, sauf s'il possède
 * un rôle autorisé à agir pour autrui (ex: RH). Empêche l'accès aux données
 * d'un autre utilisateur par simple modification d'un ID dans l'URL.
 */
export function requireSelfOrRole(paramName: string, ...overrideRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      return next(ApiError.unauthorized());
    }
    const targetId = req.params[paramName];
    if (req.auth.userId === targetId || overrideRoles.includes(req.auth.role)) {
      return next();
    }
    next(ApiError.forbidden());
  };
}
