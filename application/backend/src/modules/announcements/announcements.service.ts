import { NotificationType, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { deleteStoredImage, storeImage } from "../../utils/storage";

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
  coverPhotoKey: true,
  createdAt: true,
  author: { select: authorSelect },
} as const;

// Enlève la clé de stockage brute de la réponse API (même principe que
// TimeEntry.clockInPhotoKey, jamais exposée telle quelle) au profit d'un
// simple booléen : le client récupère la photo via la route authentifiée
// dédiée (GET /:id/cover-photo), jamais par la clé elle-même.
function presentAnnouncement<T extends { coverPhotoKey: string | null }>(
  announcement: T
): Omit<T, "coverPhotoKey"> & { hasCoverPhoto: boolean } {
  const { coverPhotoKey, ...rest } = announcement;
  return { ...rest, hasCoverPhoto: Boolean(coverPhotoKey) };
}

/**
 * Publie une actualité et notifie IMMÉDIATEMENT tous les comptes actifs de
 * l'entreprise (hors l'auteur lui-même) — retour explicite du client : "ça
 * notifie tout le monde". Les échecs d'envoi individuels (push, etc.) sont
 * déjà gérés en best-effort par createNotification ; ils n'empêchent jamais
 * la publication elle-même.
 */
export async function createAnnouncement(
  actor: Actor,
  input: { title: string; body: string },
  photoBuffer?: Buffer
) {
  if (!ANNOUNCEMENT_AUTHOR_ROLES.includes(actor.role)) {
    throw ApiError.forbidden("Vous n'êtes pas autorisé à publier une actualité.");
  }

  // Photo de couverture facultative (retour explicite du client : "un vrai
  // blog/journal d'entreprise") — stockée HORS transaction comme toute autre
  // photo de l'app ; un fichier orphelin est nettoyé si la création échoue.
  const stored = photoBuffer ? await storeImage(photoBuffer) : null;

  let announcement;
  try {
    announcement = await prisma.announcement.create({
      data: { authorId: actor.userId, title: input.title, body: input.body, coverPhotoKey: stored?.storageKey },
      select: announcementSelect,
    });
  } catch (err) {
    if (stored) await deleteStoredImage(stored.storageKey);
    throw err;
  }

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

  return presentAnnouncement(announcement);
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

  return { items: items.map(presentAnnouncement), total, page, pageSize };
}

export async function getAnnouncementById(id: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id }, select: announcementSelect });
  if (!announcement) throw ApiError.notFound("Actualité introuvable.");
  return presentAnnouncement(announcement);
}

// Sert la photo de couverture d'une actualité — jamais d'URL publique, même
// principe que les autres photos de l'app : la lecture d'une actualité est
// déjà ouverte à tout compte authentifié (voir announcements.routes.ts),
// donc pas de vérification de portée supplémentaire ici au-delà de l'auth.
export async function getAnnouncementCoverPhoto(id: string) {
  const announcement = await prisma.announcement.findUnique({ where: { id }, select: { coverPhotoKey: true } });
  if (!announcement?.coverPhotoKey) throw ApiError.notFound("Aucune photo pour cette actualité.");
  return { storageKey: announcement.coverPhotoKey };
}
