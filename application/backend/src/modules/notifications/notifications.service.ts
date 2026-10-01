import { NotificationType } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logger } from "../../config/logger";
import { sendExpoPushNotifications } from "../../utils/pushSender";

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

/**
 * Crée la notification interne (persistée, visible dans le centre de notifications)
 * et envoie une notification push réelle (via le relais Expo) à chaque appareil
 * que l'utilisateur a enregistré. L'échec de l'envoi push (réseau, token expiré...)
 * n'affecte jamais la création de la notification interne, déjà persistée.
 */
export async function createNotification(input: CreateNotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body,
      relatedEntityType: input.relatedEntityType,
      relatedEntityId: input.relatedEntityId,
    },
  });

  const pushTokens = await prisma.pushToken.findMany({ where: { userId: input.userId } });
  if (pushTokens.length > 0) {
    logger.info({ userId: input.userId, notificationId: notification.id, devices: pushTokens.length }, "Envoi push");
    const { invalidTokens } = await sendExpoPushNotifications(
      pushTokens.map((t) => ({
        to: t.token,
        title: input.title,
        body: input.body,
        data: { type: input.type, relatedEntityType: input.relatedEntityType, relatedEntityId: input.relatedEntityId },
      }))
    );
    if (invalidTokens.length > 0) {
      await prisma.pushToken.deleteMany({ where: { token: { in: invalidTokens } } });
    }
  }

  return notification;
}

export async function listNotifications(
  userId: string,
  page: number,
  pageSize: number,
  options: { excludeMessages?: boolean } = {}
) {
  // Le filtre ne porte que sur la LISTE renvoyée : les compteurs ci-dessous
  // restent ceux de tout le centre de notifications, sans quoi le badge de
  // l'onglet dépendrait de l'écran qui l'interroge.
  const listWhere = options.excludeMessages
    ? { userId, type: { not: NotificationType.MESSAGE_RECEIVED } }
    : { userId };

  const [items, total, unreadCount, unreadCountExcludingMessages] = await Promise.all([
    prisma.notification.findMany({
      where: listWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notification.count({ where: listWhere }),
    prisma.notification.count({ where: { userId, isRead: false } }),
    // Un nouveau message crée à la fois une notification (la cloche, demandée
    // explicitement par le client) ET un message non lu dans son fil. Le badge
    // de l'onglet Messagerie, qui additionne les deux compteurs, comptait donc
    // chaque message deux fois — 10 affiché pour 5 messages réellement reçus.
    // Ce second total permet de n'en compter qu'un.
    prisma.notification.count({
      where: { userId, isRead: false, type: { not: NotificationType.MESSAGE_RECEIVED } },
    }),
  ]);

  return { items, total, page, pageSize, unreadCount, unreadCountExcludingMessages };
}

export async function markAsRead(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    // 404 plutôt que 403 : ne révèle pas l'existence d'une notification d'autrui.
    throw ApiError.notFound("Notification introuvable.");
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function deleteNotification(userId: string, notificationId: string) {
  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification || notification.userId !== userId) {
    // 404 plutôt que 403 : même principe que markAsRead ci-dessus.
    throw ApiError.notFound("Notification introuvable.");
  }

  await prisma.notification.delete({ where: { id: notificationId } });
}

export async function markAllAsRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
}

export async function registerPushToken(userId: string, token: string, platform: "ios" | "android") {
  await prisma.pushToken.upsert({
    where: { token },
    create: { userId, token, platform },
    update: { userId, platform, lastUsedAt: new Date() },
  });
}

export async function unregisterPushToken(userId: string, token: string) {
  await prisma.pushToken.deleteMany({ where: { userId, token } });
}
