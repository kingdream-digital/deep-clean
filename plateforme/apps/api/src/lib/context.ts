import { can, type Permission, type Role } from "@aussitot/shared";
import { AppError } from "./errors.ts";

/**
 * Contexte d'une action : QUI agit, pour QUELLE entreprise. Construit par le
 * plugin d'authentification à partir du jeton vérifié — jamais à partir de
 * données envoyées par l'app. Les services métier ne reçoivent que lui.
 */
export interface Ctx {
  orgId: string;
  userId: string;
  role: Role;
  sessionId: string;
  timezone: string;
  ip?: string;
  /** Vrai quand l'action est déclenchée par l'assistant (journal d'activité). */
  viaAssistant?: boolean;
}

export function requirePermission(ctx: Ctx, permission: Permission): void {
  if (!can(ctx.role, permission)) throw AppError.forbidden();
}

export function hasPermission(ctx: Ctx, permission: Permission): boolean {
  return can(ctx.role, permission);
}
