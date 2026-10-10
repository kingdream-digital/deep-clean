import type { FastifyReply, FastifyRequest } from "fastify";
import type { Permission } from "@aussitot/shared";
import { verifyAccessToken } from "../lib/auth/tokens.ts";
import { isSessionActive } from "../lib/sessionCache.ts";
import { getOrgBasics } from "../lib/orgCache.ts";
import { AppError } from "../lib/errors.ts";
import { requirePermission, type Ctx } from "../lib/context.ts";

declare module "fastify" {
  interface FastifyRequest {
    ctx: Ctx;
  }
}

/**
 * Vérifie, à CHAQUE requête protégée : jeton signé et non expiré, session non
 * révoquée, compte actif, entreprise active. Construit le contexte (`ctx`)
 * que reçoivent les services : l'entreprise et l'utilisateur viennent du
 * jeton, jamais du corps de la requête.
 */
export async function authenticate(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw AppError.unauthorized();
  const claims = await verifyAccessToken(header.slice(7).trim());

  if (!(await isSessionActive(claims))) {
    throw AppError.unauthorized("Votre session n'est plus valide. Merci de vous reconnecter.", "SESSION_INVALID");
  }

  const org = await getOrgBasics(claims.orgId);
  if (org.status !== "ACTIVE") {
    throw AppError.forbidden("L'accès de votre entreprise est suspendu. Contactez le support.");
  }

  request.ctx = {
    orgId: claims.orgId,
    userId: claims.userId,
    role: claims.role,
    sessionId: claims.sessionId,
    timezone: org.timezone,
    ip: request.ip,
  };
}

/** Garde de route : la permission est vérifiée côté serveur, quelle que soit l'app. */
export function permission(perm: Permission) {
  return async (request: FastifyRequest): Promise<void> => {
    requirePermission(request.ctx, perm);
  };
}
