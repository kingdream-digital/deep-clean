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

export type SessionState =
  | { status: "active"; mustChangePassword: boolean }
  /** Rôle modifié depuis l'émission du jeton : l'app doit en obtenir un nouveau. */
  | { status: "stale" }
  | { status: "revoked" };

function encode(state: SessionState, role: string): string {
  return state.status === "active" ? `1:${role}:${state.mustChangePassword ? 1 : 0}` : "0";
}

function decode(value: string | null, role: string): SessionState | null {
  if (value === null) return null;
  if (value === "0") return { status: "revoked" };
  const [flag, cachedRole, mustChange] = value.split(":");
  if (flag !== "1") return null;
  if (cachedRole !== role) return { status: "stale" };
  return { status: "active", mustChangePassword: mustChange === "1" };
}

export async function sessionState(claims: AccessClaims): Promise<SessionState> {
  try {
    const cached = decode(await redis.get(PREFIX + claims.sessionId), claims.role);
    if (cached) return cached;
  } catch (err) {
    logger.warn({ err }, "Cache de session indisponible — vérification en base");
  }

  const state = await withTenant(claims.orgId, async (tx): Promise<SessionState> => {
    const session = await tx.session.findUnique({
      where: { id: claims.sessionId },
      select: {
        userId: true,
        revokedAt: true,
        expiresAt: true,
        user: { select: { isActive: true, role: true, mustChangePassword: true } },
      },
    });
    if (!session || session.userId !== claims.userId || session.revokedAt || session.expiresAt <= new Date()) return { status: "revoked" };
    if (!session.user.isActive) return { status: "revoked" };
    if (session.user.role !== claims.role) return { status: "stale" };
    return { status: "active", mustChangePassword: session.user.mustChangePassword };
  });

  if (state.status !== "stale") {
    try {
      await redis.set(PREFIX + claims.sessionId, encode(state, claims.role), "EX", TTL_SECONDS);
    } catch {
      /* le cache est une optimisation : la base reste la référence */
    }
  }
  return state;
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

/** Oublie le cache de ces sessions (changement de rôle ou de mot de passe : simple revérification). */
export async function forgetCachedSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  try {
    await redis.del(...sessionIds.map((id) => PREFIX + id));
  } catch {
    /* sans effet : le cache expire de lui-même en une minute */
  }
}
