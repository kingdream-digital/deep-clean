import cron from "node-cron";
import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./db/prisma";
import { runPhotoRetentionJob } from "./jobs/photoRetention";
import { runMessagesMigration } from "./db/migrateMessagesToConversations";
import { COMPANY_TIME_ZONE } from "./utils/companyTime";
import { runMonthlyAccrualJob } from "./modules/leave/leave.service";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(`Deep Clean API démarrée sur le port ${env.PORT} (${env.NODE_ENV})`);
});

// Rappel + purge automatique des photos de signalement (voir jobs/photoRetention.ts).
// Tous les jours à 3h du matin (heure serveur, période creuse), PLUS une
// exécution au démarrage pour rattraper une échéance manquée pendant que le
// serveur était endormi (hébergement gratuit qui se met en veille en cas
// d'inactivité — sans effet sur un serveur qui tourne en continu).
if (!env.isTest) {
  // Reprise des fils de messagerie d'avant les groupes : idempotente, sous
  // verrou PostgreSQL, et sans effet une fois faite — elle peut donc rester
  // au démarrage sans coût. Volontairement automatique plutôt que manuelle :
  // oubliée après un redéploiement, les conversations existantes
  // disparaîtraient de l'écran de leurs utilisateurs.
  void runMessagesMigration(prisma);
  void runPhotoRetentionJob().catch((err) => logger.error({ err }, "Échec de la tâche de rétention des photos (démarrage)"));
  // 3 h du matin, heure de Paris (pas celle du serveur).
  cron.schedule(
    "0 3 * * *",
    () => {
      void runPhotoRetentionJob().catch((err) => logger.error({ err }, "Échec de la tâche de rétention des photos (planifiée)"));
    },
    { timezone: COMPANY_TIME_ZONE }
  );

  // Congés acquis : relevés du mois écoulé calculés le 1er à 2 h (heure de
  // Paris), à valider par la RH. Aussi au démarrage, pour rattraper un mois
  // manqué pendant que le serveur était arrêté (idempotent).
  void runMonthlyAccrualJob().catch((err) => logger.error({ err }, "Échec du calcul des congés acquis (démarrage)"));
  cron.schedule(
    "0 2 1 * *",
    () => {
      void runMonthlyAccrualJob().catch((err) => logger.error({ err }, "Échec du calcul des congés acquis (planifié)"));
    },
    { timezone: COMPANY_TIME_ZONE }
  );
}

async function shutdown(signal: string) {
  logger.info(`Signal ${signal} reçu, arrêt propre du serveur...`);
  server.close(async () => {
    await prisma.$disconnect();
    logger.info("Serveur arrêté proprement.");
    process.exit(0);
  });

  // Filet de sécurité si la fermeture propre bloque trop longtemps.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Promesse rejetée non gérée");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Exception non interceptée");
  process.exit(1);
});
