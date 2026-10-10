import { Queue } from "bullmq";
import { createQueueConnection } from "./redis.ts";
import { logger } from "./logger.ts";

/**
 * Files de tâches (BullMQ sur Redis) : le travail lent ou externe (emails avec
 * PDF, notifications push) est confié au worker (src/worker.ts), jamais fait
 * pendant la requête de l'utilisateur. Les tâches survivent à un redémarrage
 * et sont réessayées automatiquement.
 */
export const QUEUES = { emails: "emails", push: "push", maintenance: "maintenance" } as const;

export interface EmailJob {
  orgId: string;
  emailId: string;
}

export interface PushJob {
  orgId: string;
  userIds: string[];
  title: string;
  body: string;
  link: string | null;
}

let connection: ReturnType<typeof createQueueConnection> | null = null;
let emailQueue: Queue<EmailJob> | null = null;
let pushQueue: Queue<PushJob> | null = null;

function conn() {
  connection ??= createQueueConnection("queue-producer");
  return connection;
}

export function getEmailQueue(): Queue<EmailJob> {
  emailQueue ??= new Queue<EmailJob>(QUEUES.emails, {
    connection: conn(),
    defaultJobOptions: { attempts: 6, backoff: { type: "exponential", delay: 20_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return emailQueue;
}

export function getPushQueue(): Queue<PushJob> {
  pushQueue ??= new Queue<PushJob>(QUEUES.push, {
    connection: conn(),
    defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 2000 },
  });
  return pushQueue;
}

/** Met un email en file. En cas d'échec, la tâche de reprise du worker le retrouvera dans la table outbox. */
export async function enqueueEmail(job: EmailJob): Promise<void> {
  try {
    await getEmailQueue().add("send", job, { jobId: job.emailId });
  } catch (err) {
    logger.warn({ err, emailId: job.emailId }, "Mise en file de l'email impossible — reprise automatique prévue");
  }
}

export async function enqueuePush(job: PushJob): Promise<void> {
  if (job.userIds.length === 0) return;
  try {
    await getPushQueue().add("send", job);
  } catch (err) {
    logger.warn({ err }, "Mise en file de la notification push impossible");
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([emailQueue?.close(), pushQueue?.close()]);
  await connection?.quit().catch(() => undefined);
  emailQueue = null;
  pushQueue = null;
  connection = null;
}
