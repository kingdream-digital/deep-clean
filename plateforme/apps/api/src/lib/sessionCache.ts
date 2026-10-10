import { redis } from "./redis.ts";
import { withTenant } from "./db.ts";
import type { AccessClaims } from "./auth/tokens.ts";
import { logger } from "./logger.ts";

/**
 * Validité des sessions, mise en cache dans Redis pour ne pas interroger la
 * base à chaque requête (10 000 utilisateurs simultanés = des milliers de
 * requêtes par seconde). Une déconnexion, une désactivation de compte ou un
 * changement de mot de passe invalide immédiatement le cache : l'accès est
 * coupé sur toutes les instances à la requête suivante.
 */
const PREFIX = "sess:";
const TTL_SECONDS = 60;

export async function isSessionActive(claims: AccessClaims): Promise<boolean> {
  try {
    const cached = await redis.get(PREFIX + claims.sessionId);
    if (cached === "1:" + claims.role) return true;
    if (cached === "0") return false;
  } catch (err) {
    logger.warn({ err }, "Cache de session indisponible — vérification en base");
  }

  const active = await withTenant(claims.orgId, async (tx) => {
    const session = await tx.session.findUnique({
      where: { id: claims.sessionId },
      select: { userId: true, revokedAt: true, expiresAt: true, user: { select: { isActive: true, role: true } } },
    });
    if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt <= new Date()) return "revoked" as const;
    if (!session.user.isActive) return "revoked" as const;
    // Rôle modifié depuis l'émission du jeton : l'app doit renouveler son jeton.
    if (session.user.role !== claims.role) return "stale" as const;
    return "active" as const;
  });

  try {
    if (active === "active") await redis.set(PREFIX + claims.sessionId, "1:" + claims.role, "EX", TTL_SECONDS);
    if (active === "revoked") await redis.set(PREFIX + claims.sessionId, "0", "EX", TTL_SECONDS);
  } catch {
    /* le cache est une optimisation : la base reste la référence */
  }
  return active === "active";
}

/** Coupe immédiatement ces sessions (déconnexion, désactivation, mot de passe changé). */
export async function revokeCachedSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  try {
    const pipeline = redis.pipeline();
    for (const id of sessionIds) pipeline.set(PREFIX + id, "0", "EX", 3600);
    await pipeline.exec();
  } catch (err) {
    logger.warn({ err }, "Invalidation du cache de session impossible — la base reste la référence");
  }
}

/** Oublie le cache de ces sessions (changement de rôle : simple revérification). */
export async function forgetCachedSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  try {
    await redis.del(...sessionIds.map((id) => PREFIX + id));
  } catch {
    /* sans effet : le cache expire de lui-même en une minute */
  }
}
