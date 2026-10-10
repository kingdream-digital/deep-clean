import { env } from "../../config/env.ts";
import { withTenant } from "../../lib/db.ts";
import { logger } from "../../lib/logger.ts";
import type { PushJob } from "../../lib/queue.ts";

/**
 * Notifications push via le service Expo (iOS et Android), exécutées par le
 * worker. Les jetons d'appareils désinscrits sont supprimés automatiquement.
 */
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoTicket {
  status: "ok" | "error";
  details?: { error?: string };
}

export async function sendPush(job: PushJob): Promise<void> {
  const tokens = await withTenant(job.orgId, (tx) =>
    tx.pushToken.findMany({ where: { userId: { in: job.userIds }, platform: { in: ["ios", "android"] } }, select: { token: true } }),
  );
  if (tokens.length === 0) return;

  const dead: string[] = [];
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(
        chunk.map((t) => ({ to: t.token, title: job.title, body: job.body, sound: "default", data: { link: job.link } })),
      ),
    });
    if (!response.ok) throw new Error(`Service push indisponible (${response.status})`);
    const { data } = (await response.json()) as { data: ExpoTicket[] };
    data.forEach((ticket, index) => {
      if (ticket.status === "error" && ticket.details?.error === "DeviceNotRegistered") dead.push(chunk[index]!.token);
    });
  }
  if (dead.length) {
    await withTenant(job.orgId, (tx) => tx.pushToken.deleteMany({ where: { token: { in: dead } } }));
    logger.info({ count: dead.length }, "Jetons push désinscrits supprimés");
  }
}
