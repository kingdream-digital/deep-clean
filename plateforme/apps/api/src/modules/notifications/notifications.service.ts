import { z } from "zod";
import type { NotificationDto, Page } from "@aussitot/shared";
import { iso, withTenant, type Db } from "../../lib/db.ts";
import type { AfterCommit } from "../../lib/afterCommit.ts";
import { publishToUsers } from "../../lib/realtime.ts";
import { enqueuePush } from "../../lib/queue.ts";
import type { Ctx } from "../../lib/context.ts";
import { parse } from "../../lib/validate.ts";
import type { Notification } from "../../generated/prisma/client.ts";

export interface NotificationInput {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

/**
 * Notifie les personnes CONCERNÉES (et elles seules) : notification interne
 * enregistrée dans la transaction, puis, une fois celle-ci validée, diffusion
 * temps réel et notification push sur le téléphone.
 *
 * La liste des destinataires est toujours calculée par l'appelant à partir
 * du lien réel avec l'élément (affecté à la mission, responsable…), jamais
 * selon qui a déclenché l'action — et aucun réglage ne permet de couper une
 * notification à quelqu'un qu'elle concerne (règle Deep Clean conservée).
 */
export async function notifyUsers(tx: Db, after: AfterCommit, orgId: string, userIds: string[], input: NotificationInput): Promise<void> {
  const recipients = [...new Set(userIds)];
  if (recipients.length === 0) return;
  const link = input.link ?? null;
  await tx.notification.createMany({
    data: recipients.map((userId) => ({ userId, type: input.type, title: input.title, body: input.body, link })),
  });
  after.add(() =>
    publishToUsers(recipients, {
      type: "notification",
      payload: { title: input.title, body: input.body, link, notificationType: input.type },
    }),
  );
  after.add(() => enqueuePush({ orgId, userIds: recipients, title: input.title, body: input.body, link }));
}

export function toNotificationDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    readAt: iso(n.readAt),
    createdAt: n.createdAt.toISOString(),
  };
}

export async function listNotifications(
  ctx: Ctx,
  query: { cursor?: string; limit: number; unreadOnly?: boolean },
): Promise<Page<NotificationDto>> {
  return withTenant(ctx.orgId, async (tx) => {
    const items = await tx.notification.findMany({
      where: { userId: ctx.userId, readAt: query.unreadOnly ? null : undefined },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > query.limit;
    const page = items.slice(0, query.limit);
    return { items: page.map(toNotificationDto), nextCursor: hasMore ? page.at(-1)!.id : null };
  });
}

export async function unreadCount(ctx: Ctx): Promise<number> {
  return withTenant(ctx.orgId, (tx) => tx.notification.count({ where: { userId: ctx.userId, readAt: null } }));
}

/** Une personne ne peut marquer comme lues que SES notifications. */
export async function markRead(ctx: Ctx, ids: string[] | "all"): Promise<{ updated: number }> {
  return withTenant(ctx.orgId, async (tx) => {
    const result = await tx.notification.updateMany({
      where: { userId: ctx.userId, readAt: null, id: ids === "all" ? undefined : { in: ids } },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  });
}

const pushTokenSchema = z.object({
  token: z.string().regex(/^(ExponentPushToken|ExpoPushToken)\[[\w-]+\]$/, "Jeton de notification invalide."),
  platform: z.enum(["ios", "android", "web"]),
});

export async function registerPushToken(ctx: Ctx, raw: unknown): Promise<void> {
  const input = parse(pushTokenSchema, raw);
  await withTenant(ctx.orgId, async (tx) => {
    await tx.pushToken.upsert({
      where: { organizationId_token: { organizationId: ctx.orgId, token: input.token } },
      update: { userId: ctx.userId, platform: input.platform, lastSeenAt: new Date() },
      create: { userId: ctx.userId, token: input.token, platform: input.platform },
    });
  });
}

/** À la déconnexion : ce téléphone ne reçoit plus les notifications de ce compte. */
export async function unregisterPushToken(ctx: Ctx, token: string): Promise<void> {
  await withTenant(ctx.orgId, (tx) => tx.pushToken.deleteMany({ where: { token, userId: ctx.userId } }));
}
