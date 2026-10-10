import { Queue, Worker } from "bullmq";
import { logger } from "./lib/logger.ts";
import { createQueueConnection, redis } from "./lib/redis.ts";
import { prisma, staleQueuedEmails } from "./lib/db.ts";
import { enqueueEmail, QUEUES, type EmailJob, type PushJob, closeQueues } from "./lib/queue.ts";
import { deliverQueuedEmail } from "./modules/email/email.service.ts";
import { sendPush } from "./modules/notifications/push.ts";

/**
 * Processus de fond (séparé de l'API, se met à l'échelle indépendamment) :
 * envoi des emails avec PDF, notifications push, reprise des tâches
 * interrompues. BullMQ garantit qu'une tâche n'est traitée que par un seul
 * worker, même s'il y en a plusieurs.
 */
const EMAIL_ATTEMPTS = 6;

const emailWorker = new Worker<EmailJob>(
  QUEUES.emails,
  async (job) => {
    const outcome = await deliverQueuedEmail(job.data.orgId, job.data.emailId, job.attemptsMade + 1, job.opts.attempts ?? EMAIL_ATTEMPTS);
    if (outcome === "retry") throw new Error("Nouvel essai d'envoi programmé");
    return outcome;
  },
  { connection: createQueueConnection("worker-emails"), concurrency: 10 },
);

const pushWorker = new Worker<PushJob>(QUEUES.push, async (job) => sendPush(job.data), {
  connection: createQueueConnection("worker-push"),
  concurrency: 20,
});

// Reprise : un email resté « en file » plus de 10 minutes (serveur arrêté
// entre l'enregistrement et la mise en file) est remis en file.
const maintenanceQueue = new Queue(QUEUES.maintenance, { connection: createQueueConnection("worker-maintenance-producer") });
await maintenanceQueue.upsertJobScheduler("sweep-emails", { every: 5 * 60_000 }, { name: "sweep-emails" });

const maintenanceWorker = new Worker(
  QUEUES.maintenance,
  async (job) => {
    if (job.name === "sweep-emails") {
      const stale = await staleQueuedEmails(new Date(Date.now() - 10 * 60_000), 200);
      for (const email of stale) await enqueueEmail({ orgId: email.organizationId, emailId: email.id });
      if (stale.length) logger.info({ count: stale.length }, "Emails remis en file");
    }
  },
  { connection: createQueueConnection("worker-maintenance") },
);

for (const worker of [emailWorker, pushWorker, maintenanceWorker]) {
  worker.on("failed", (job, err) => logger.warn({ queue: worker.name, jobId: job?.id, err: err.message }, "Tâche en échec"));
}

logger.info("Worker démarré (emails, push, maintenance)");

const shutdown = async (signal: string) => {
  logger.info({ signal }, "Arrêt du worker…");
  await Promise.allSettled([emailWorker.close(), pushWorker.close(), maintenanceWorker.close(), maintenanceQueue.close()]);
  await closeQueues();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
