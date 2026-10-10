import cluster from "node:cluster";
import { env } from "./config/env.ts";

/**
 * Point d'entrée de l'API.
 *
 * WEB_CONCURRENCY = 1 (défaut, recommandé en conteneurs) : un processus ; on
 * multiplie les conteneurs derrière le répartiteur de charge.
 * WEB_CONCURRENCY = N (serveur unique) : N processus se partagent le port,
 * un par cœur ; un processus qui s'arrête anormalement est relancé.
 * Chaque processus ouvre son propre pool de connexions (DB_POOL_SIZE).
 */
if (env.WEB_CONCURRENCY > 1 && cluster.isPrimary) {
  let stopping = false;
  for (let i = 0; i < env.WEB_CONCURRENCY; i += 1) cluster.fork();
  cluster.on("exit", (worker, code, signal) => {
    if (stopping) return;
    console.error(`Processus HTTP ${worker.process.pid} arrêté (${signal ?? code}) : relance.`);
    setTimeout(() => cluster.fork(), 1000);
  });
  const stop = (signal: NodeJS.Signals) => {
    stopping = true;
    for (const worker of Object.values(cluster.workers ?? {})) worker?.process.kill(signal);
    setTimeout(() => process.exit(0), 16_000).unref();
    cluster.on("exit", () => {
      if (Object.keys(cluster.workers ?? {}).length === 0) process.exit(0);
    });
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
} else {
  await import("./http.ts");
}
