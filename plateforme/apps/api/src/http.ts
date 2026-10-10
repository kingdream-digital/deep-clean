import { env } from "./config/env.ts";
import { buildApp } from "./app.ts";
import { logger } from "./lib/logger.ts";
import { prisma } from "./lib/db.ts";
import { redis } from "./lib/redis.ts";
import { startOrgCacheSync, stopOrgCacheSync } from "./lib/orgCache.ts";

/**
 * Processus HTTP de l'API. Sans état : on en lance autant que nécessaire
 * derrière un répartiteur de charge (voir docs/SCALABILITE.md). Les tâches de
 * fond (emails, rappels, notifications push) tournent dans un processus
 * séparé : src/worker.ts. Démarré par src/server.ts.
 */
const app = await buildApp();
await startOrgCacheSync();

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Arrêt en cours…");
  const force = setTimeout(() => process.exit(1), 15_000);
  force.unref();
  try {
    await app.close();
    await stopOrgCacheSync();
    await prisma.$disconnect();
    await redis.quit();
  } finally {
    process.exit(0);
  }
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

await app.listen({ port: env.PORT, host: env.HOST });
