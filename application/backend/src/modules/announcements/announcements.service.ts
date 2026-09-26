import { NotificationType, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";

interface Actor {
  userId: string;
  role: Role;
}

// Retour explicite du client : seuls RH, superviseur, direction et l'admin
// technique peuvent publier une actualité — jamais un employé ni un chef
// d'équipe.
export const ANNOUNCEMENT_AUTHOR_ROLES: Role[] = [Role.HR, Role.SUPERVISOR, Role.DIRECTOR, Role.ADMIN];

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
} as const;

const announcementSelect = {
  id: true,
  title: true,
  body: true,
  createdAt: true,
  author: { select: authorSelect },
} as const;

/**
 * Publie une actualité et notifie IMMÉDIATEMENT tous les comptes actifs de
 * l'entreprise (hors l'auteur lui-même) — retour explicite du client : "ça
 * notifie tout le monde". Les échecs d'envoi individuels (push, etc.) sont
 * déjà gérés en best-effort par createNotification ; ils n'empêchent jamais
 * la publication elle-même.
 */
export async function createAnnouncement(actor: Actor, input: { title: string; body: string }) {
  if (!ANNOUNCEMENT_AUTHOR_ROLES.includes(actor.role)) {
    throw ApiError.forbidden("Vous n'êtes pas autorisé à publier une actualité.");
  }

  const announcement = await prisma.announcement.create({
    data: { authorId: actor.userId, title: input.title, body: input.body },
    select: announcementSelect,
  });

  const recipients = await prisma.user.findMany({
    where: { isActive: true, id: { not: actor.userId } },
    select: { id: true },
  });

  await Promise.all(
    recipients.map((recipient) =>
      createNotification({
        userId: recipient.id,
        type: NotificationType.ANNOUNCEMENT_POSTED,
        title: "Nouvelle actualité",
        body: announcement.title,
        relatedEntityType: "Announcement",
        relatedEntityId: announcement.id,
      })
    )
  );

  await logActivity({
    userId: actor.userId,
    action: "ANNOUNCEMENT_POSTED",
    entityType: "Announcement",
    entityId: announcement.id,
    metadata: { title: announcement.title, recipients: recipients.length },
  });

  return announcement;
}

export async function listAnnouncements(page: number, pageSize: number) {
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({
      select: announcementSelect,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.announcement.count(),
  ]);

  return { items, total, page, pageSize };
}

export async function getAnnouncementById(id: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id }, select: announcementSelect });
  if (!announcement) throw ApiError.notFound("Actualité introuvable.");
  return announcement;
}
