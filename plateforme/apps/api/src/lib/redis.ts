import { Redis, type RedisOptions } from "ioredis";
import { env } from "../config/env.ts";
import { logger } from "./logger.ts";

/**
 * Redis est l'état partagé entre les instances de l'API (qui, elles, sont sans
 * état et peuvent être multipliées derrière un répartiteur de charge) :
 * limitation de débit, cache des sessions, verrous, diffusion temps réel
 * (pub/sub) et files de tâches (BullMQ).
 */
export function createRedis(name: string, options: RedisOptions = {}): Redis {
  const client = new Redis(env.REDIS_URL, {
    connectionName: `aussitot-${name}`,
    enableReadyCheck: true,
    maxRetriesPerRequest: 2,
    ...options,
  });
  client.on("error", (err) => logger.warn({ err: err.message, connection: name }, "Redis indisponible"));
  return client;
}

/** Commandes courantes (cache, verrous, compteurs). */
export const redis = createRedis("main");

/** Connexion dédiée aux files de tâches (BullMQ exige maxRetriesPerRequest = null). */
export function createQueueConnection(name: string): Redis {
  return createRedis(name, { maxRetriesPerRequest: null });
}

export async function pingRedis(): Promise<boolean> {
  try {
    return (await redis.ping()) === "PONG";
  } catch {
    return false;
  }
}

/**
 * Verrou distribué simple (SET NX PX) : empêche par exemple deux réponses de
 * l'assistant de s'exécuter en même temps sur la même conversation, même
 * réparties sur deux instances.
 */
export async function acquireLock(key: string, ttlMs: number): Promise<(() => Promise<void>) | null> {
  const token = crypto.randomUUID();
  const ok = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX");
  if (ok !== "OK") return null;
  return async () => {
    // Ne libère que son propre verrou (script atomique).
    await redis.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      1,
      `lock:${key}`,
      token,
    );
  };
}
