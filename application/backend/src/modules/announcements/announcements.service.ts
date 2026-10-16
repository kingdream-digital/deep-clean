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

// Retour explicite du client : la suppression d'une actualité (contrairement
// à sa publication, ouverte au superviseur) est réservée à la RH et à la
// direction — l'admin technique la conserve aussi, comme pour les autres
// actions de nettoyage/maintenance de l'application.
export const ANNOUNCEMENT_DELETE_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN];

// Retour explicite du client (octobre 2026) : la Direction ou la RH alimente
// l'accueil public de l'application (sans compte) depuis son espace. Mettre
// une actualité à la une de l'accueil public — ou l'en retirer — leur est
// réservé (et à l'admin technique) ; le superviseur publie en interne.
export const ANNOUNCEMENT_PUBLIC_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN];

const authorSelect = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  avatarKey: true,
} as const;

const announcementSelect = {
  id: true,
  title: true,
  body: true,
  coverPhotoKey: true,
  isPublic: true,
  createdAt: true,
  author: { select: authorSelect },
} as const;

// Enlève la clé de stockage brute de la réponse API (même principe que
// TimeEntry.clockInPhotoKey, jamais exposée telle quelle) au profit d'un
// simple booléen : le client récupère la photo via la route authentifiée
// dédiée (GET /:id/cover-photo), jamais par la clé elle-même.
//
// Même principe pour la photo de profil de l'auteur : `hasAvatar`, jamais la
// clé de stockage — la liste des actualités montre ainsi sa photo.
function presentAnnouncement<
  T extends { coverPhotoKey: string | null; author: { avatarKey: string | null } }
>(announcement: T) {
  const { coverPhotoKey, author, ...rest } = announcement;
  const { avatarKey, ...authorRest } = author;
  return { ...rest, author: { ...authorRest, hasAvatar: Boolean(avatarKey) }, hasCoverPhoto: Boolean(coverPhotoKey) };
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
  input: { title: string; body: string; isPublic?: boolean },
  photoBuffer?: Buffer
) {
  if (!ANNOUNCEMENT_AUTHOR_ROLES.includes(actor.role)) {
    throw ApiError.forbidden("Vous n'êtes pas autorisé à publier une actualité.");
  }
  if (input.isPublic && !ANNOUNCEMENT_PUBLIC_ROLES.includes(actor.role)) {
    throw ApiError.forbidden("Seules la RH et la direction publient sur l'accueil public de l'application.");
  }

  // Photo de couverture facultative (retour explicite du client : "un vrai
  // blog/journal d'entreprise") — stockée HORS transaction comme toute autre
  // photo de l'app ; un fichier orphelin est nettoyé si la création échoue.
  const stored = photoBuffer ? await storeImage(photoBuffer) : null;

  let announcement;
  try {
    announcement = await prisma.announcement.create({
      data: {
        authorId: actor.userId,
        title: input.title,
        body: input.body,
        coverPhotoKey: stored?.storageKey,
        isPublic: input.isPublic ?? false,
      },
      select: announcementSelect,
    });
  } catch (err) {
    if (stored) await deleteStoredImage(stored.storageKey);
    throw err;
  }

  const recipients = await prisma.user.findMany({
    // Le comptable n'a pas accès aux actualités internes.
    where: { isActive: true, id: { not: actor.userId }, role: { not: Role.ACCOUNTANT } },
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
    metadata: { title: announcement.title, recipients: recipients.length, isPublic: announcement.isPublic },
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

export async function deleteAnnouncement(actor: Actor, id: string) {
  if (!ANNOUNCEMENT_DELETE_ROLES.includes(actor.role)) {
    throw ApiError.forbidden("Vous n'êtes pas autorisé à supprimer une actualité.");
  }

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, title: true, coverPhotoKey: true },
  });
  if (!announcement) throw ApiError.notFound("Actualité introuvable.");

  await prisma.announcement.delete({ where: { id } });
  if (announcement.coverPhotoKey) await deleteStoredImage(announcement.coverPhotoKey);

  await logActivity({
    userId: actor.userId,
    action: "ANNOUNCEMENT_DELETED",
    entityType: "Announcement",
    entityId: announcement.id,
    metadata: { title: announcement.title },
  });
}

/** Met une actualité sur l'accueil public de l'application, ou l'en retire. */
export async function setAnnouncementVisibility(actor: Actor, id: string, isPublic: boolean) {
  if (!ANNOUNCEMENT_PUBLIC_ROLES.includes(actor.role)) {
    throw ApiError.forbidden("Seules la RH et la direction gèrent l'accueil public de l'application.");
  }
  const existing = await prisma.announcement.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw ApiError.notFound("Actualité introuvable.");

  const announcement = await prisma.announcement.update({ where: { id }, data: { isPublic }, select: announcementSelect });
  await logActivity({
    userId: actor.userId,
    action: isPublic ? "ANNOUNCEMENT_MADE_PUBLIC" : "ANNOUNCEMENT_MADE_INTERNAL",
    entityType: "Announcement",
    entityId: id,
    metadata: { title: announcement.title },
  });
  return presentAnnouncement(announcement);
}

// Accueil public (sans compte) : seules les actualités marquées publiques,
// sans rien sur leur auteur (ni nom, ni rôle, ni photo) — elles sont signées
// « DEEP CLEAN ».
const publicNewsSelect = { id: true, title: true, body: true, coverPhotoKey: true, createdAt: true } as const;

function presentPublicNews(news: { id: string; title: string; body: string; coverPhotoKey: string | null; createdAt: Date }) {
  const { coverPhotoKey, createdAt, ...rest } = news;
  return { ...rest, publishedAt: createdAt, hasCoverPhoto: Boolean(coverPhotoKey) };
}

export async function listPublicNews(page: number, pageSize: number) {
  const where = { isPublic: true };
  const [items, total] = await Promise.all([
    prisma.announcement.findMany({ where, select: publicNewsSelect, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.announcement.count({ where }),
  ]);
  return { items: items.map(presentPublicNews), total, page, pageSize };
}

export async function getPublicNews(id: string) {
  const news = await prisma.announcement.findFirst({ where: { id, isPublic: true }, select: publicNewsSelect });
  if (!news) throw ApiError.notFound("Actualité introuvable.");
  return presentPublicNews(news);
}

export async function getPublicNewsCoverPhoto(id: string) {
  const news = await prisma.announcement.findFirst({ where: { id, isPublic: true }, select: { coverPhotoKey: true } });
  if (!news?.coverPhotoKey) throw ApiError.notFound("Aucune photo pour cette actualité.");
  return { storageKey: news.coverPhotoKey };
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
