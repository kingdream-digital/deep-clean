import { NotificationType, ProblemStatus, ProblemType, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { deleteStoredImage, storeImage } from "../../utils/storage";

interface Actor {
  userId: string;
  role: Role;
}

// Politique de rétention des photos de signalement (décision explicite du
// client) : le serveur applicatif n'est pas l'endroit où la RH archive
// durablement — au-delà de PHOTO_RETENTION_DAYS, une photo est supprimée
// automatiquement, avec un rappel PHOTO_WARNING_DAYS_BEFORE jours avant pour
// que la RH ait le temps de la télécharger si elle veut la garder (voir
// jobs/photoRetention.ts, qui applique ces deux constantes).
export const PHOTO_RETENTION_DAYS = 14;
export const PHOTO_WARNING_DAYS_BEFORE = 3;

// Plafond serveur, indépendant de la limite d'upload initial côté mobile
// (5 photos à la création) : couvre aussi les photos ajoutées plus tard en
// suivi. Sans lui, rien ne bornait le nombre d'appels à `addPhoto` sur un
// même signalement — un client mal intentionné pouvait saturer le stockage.
const MAX_PHOTOS_PER_PROBLEM = 20;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysUntilPhotoDeletion(createdAt: Date): number {
  const deadline = new Date(createdAt.getTime() + PHOTO_RETENTION_DAYS * MS_PER_DAY);
  return Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / MS_PER_DAY));
}

// La clé de stockage d'une photo de profil ne quitte jamais le serveur :
// l'app reçoit seulement `hasAvatar` et passe par la route protégée de la
// photo (même règle que pour les comptes, chantiers et pointages).
function withAvatarFlag<U extends { avatarKey?: string | null }>({ avatarKey, ...user }: U) {
  return { ...user, hasAvatar: Boolean(avatarKey) };
}

function withPhotoRetention<
  T extends {
    photos: { createdAt: Date }[];
    reportedBy: { avatarKey?: string | null };
    comments: { author: { avatarKey?: string | null } }[];
  },
>(problem: T) {
  return {
    ...problem,
    reportedBy: withAvatarFlag(problem.reportedBy),
    comments: problem.comments.map((c) => ({ ...c, author: withAvatarFlag(c.author) })),
    photos: problem.photos.map((photo) => ({ ...photo, daysUntilDeletion: daysUntilPhotoDeletion(photo.createdAt) })),
  };
}

const STATUS_ORDER: ProblemStatus[] = [
  ProblemStatus.NEW,
  ProblemStatus.IN_PROGRESS,
  ProblemStatus.RESOLVED,
  ProblemStatus.VALIDATED,
];

const problemSelect = {
  id: true,
  type: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  site: { select: { id: true, name: true, managerId: true } },
  mission: { select: { id: true, title: true, date: true } },
  reportedBy: { select: { id: true, firstName: true, lastName: true, role: true, avatarKey: true } },
  photos: {
    where: { isDeleted: false },
    select: { id: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedById: true },
    orderBy: { createdAt: "asc" as const },
  },
  comments: {
    select: {
      id: true,
      comment: true,
      createdAt: true,
      author: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

async function findMissionWithSiteOrThrow(missionId: string) {
  const mission = await prisma.mission.findUnique({
    where: { id: missionId },
    include: { site: true, assignments: true },
  });
  if (!mission) throw ApiError.badRequest("Mission introuvable.");
  return mission;
}

function isAssignedToMission(userId: string, mission: { assignments: { userId: string }[] }): boolean {
  return mission.assignments.some((a) => a.userId === userId);
}

// Retour explicite du client : signaler un problème (avec photo) est ouvert à
// TOUT LE MONDE — la RH et le superviseur, jusqu'ici seuls exclus (ni l'un ni
// l'autre n'est rattaché à un chantier précis), rejoignent la direction et
// l'admin avec un droit de signalement global. Le chef d'équipe voit sa
// portée alignée sur celle d'un employé : son propre chantier OU toute
// mission où il est affecté (pas seulement celles de "son" chantier).
async function canReportOnMission(
  actor: Actor,
  mission: { site: { managerId: string | null }; assignments: { userId: string }[] }
): Promise<boolean> {
  if (
    actor.role === Role.DIRECTOR ||
    actor.role === Role.ADMIN ||
    actor.role === Role.HR ||
    actor.role === Role.SUPERVISOR
  )
    return true;
  if (actor.role === Role.SITE_MANAGER) {
    return mission.site.managerId === actor.userId || isAssignedToMission(actor.userId, mission);
  }
  if (actor.role === Role.EMPLOYEE) return isAssignedToMission(actor.userId, mission);
  return false;
}

async function findProblemOrThrow(id: string) {
  const problem = await prisma.problem.findUnique({ where: { id }, select: problemSelect });
  if (!problem) throw ApiError.notFound("Signalement introuvable.");
  return problem;
}

/**
 * Personnes qui suivent un signalement : son auteur, le chef d'équipe du
 * chantier et les superviseurs (ceux prévenus à sa création) — chacun est
 * informé de chaque évolution faite par un autre (retour d'audit).
 */
async function notifyProblemFollowers(
  problem: Awaited<ReturnType<typeof findProblemOrThrow>>,
  actorId: string,
  title: string,
  body: (isReporter: boolean) => string
): Promise<void> {
  const supervisors = await prisma.user.findMany({ where: { role: Role.SUPERVISOR, isActive: true }, select: { id: true } });
  const ids = new Set<string>([problem.reportedBy.id, ...(problem.site.managerId ? [problem.site.managerId] : []), ...supervisors.map((s) => s.id)]);
  ids.delete(actorId);
  await Promise.all(
    [...ids].map((userId) =>
      createNotification({
        userId,
        type: NotificationType.PROBLEM_UPDATE,
        title,
        body: body(userId === problem.reportedBy.id),
        relatedEntityType: "Problem",
        relatedEntityId: problem.id,
      })
    )
  );
}

async function actorName(actorId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: actorId }, select: { firstName: true, lastName: true } });
  return u ? `${u.firstName} ${u.lastName}` : "Un responsable";
}

async function canViewProblem(actor: Actor, problem: Awaited<ReturnType<typeof findProblemOrThrow>>): Promise<boolean> {
  // La RH et le superviseur ont une visibilité globale en lecture sur les
  // signalements (retour explicite du client : le superviseur doit être
  // informé des signalements, il doit donc pouvoir les ouvrir — avant ce
  // correctif, `listProblems` le laissait déjà tout voir en liste, mais
  // l'ouverture d'un signalement précis échouait ici avec un 404).
  if (actor.role === Role.DIRECTOR || actor.role === Role.ADMIN || actor.role === Role.HR || actor.role === Role.SUPERVISOR)
    return true;
  if (actor.role === Role.SITE_MANAGER) return problem.site.managerId === actor.userId;
  if (actor.role === Role.EMPLOYEE) {
    if (problem.reportedBy.id === actor.userId) return true;
    if (problem.mission) {
      const assignment = await prisma.missionAssignment.findUnique({
        where: { missionId_userId: { missionId: problem.mission.id, userId: actor.userId } },
      });
      if (assignment) return true;
    }
  }
  return false;
}

function canManageProblem(actor: Actor, problem: { site: { managerId: string | null } }): boolean {
  return (
    actor.role === Role.DIRECTOR ||
    actor.role === Role.ADMIN ||
    actor.role === Role.SUPERVISOR ||
    (actor.role === Role.SITE_MANAGER && problem.site.managerId === actor.userId)
  );
}

async function assertCanView(actor: Actor, problem: Awaited<ReturnType<typeof findProblemOrThrow>>): Promise<void> {
  const allowed = await canViewProblem(actor, problem);
  if (!allowed) throw ApiError.notFound("Signalement introuvable.");
}

interface CreateProblemInput {
  missionId: string;
  type: ProblemType;
  description: string;
}

export async function createProblem(actor: Actor, input: CreateProblemInput) {
  const mission = await findMissionWithSiteOrThrow(input.missionId);
  const allowed = await canReportOnMission(actor, mission);
  if (!allowed) throw ApiError.forbidden();

  const problem = await prisma.problem.create({
    data: {
      siteId: mission.siteId,
      missionId: mission.id,
      reportedById: actor.userId,
      type: input.type,
      description: input.description,
    },
    select: problemSelect,
  });

  await logActivity({
    userId: actor.userId,
    action: "PROBLEM_CREATED",
    entityType: "Problem",
    entityId: problem.id,
    metadata: { missionId: mission.id, type: input.type },
  });

  const label = input.type === ProblemType.MISSING_MATERIAL ? "matériel manquant" : "problème";
  const recipientIds = new Set<string>();
  if (mission.site.managerId && mission.site.managerId !== actor.userId) {
    recipientIds.add(mission.site.managerId);
  }
  // Retour explicite du client : un signalement doit aussi remonter au
  // superviseur, pas seulement au chef d'équipe du chantier — il a
  // maintenant la même visibilité et les mêmes droits de suivi
  // (canViewProblem/canManageProblem ci-dessus) sur tous les signalements.
  const supervisors = await prisma.user.findMany({
    where: { role: Role.SUPERVISOR, isActive: true, id: { not: actor.userId } },
    select: { id: true },
  });
  for (const s of supervisors) recipientIds.add(s.id);

  await Promise.all(
    [...recipientIds].map((userId) =>
      createNotification({
        userId,
        type: NotificationType.PROBLEM_UPDATE,
        title: "Nouveau signalement",
        body: `Un ${label} a été signalé sur la mission « ${mission.title} ».`,
        relatedEntityType: "Problem",
        relatedEntityId: problem.id,
      })
    )
  );

  return withPhotoRetention(problem);
}

interface ListProblemsFilters {
  missionId?: string;
  siteId?: string;
  status?: ProblemStatus;
  page: number;
  pageSize: number;
}

export async function listProblems(actor: Actor, filters: ListProblemsFilters) {
  // HR/DIRECTOR/ADMIN : visibilité globale en lecture (voir canViewProblem).
  const scope =
    actor.role === Role.SITE_MANAGER
      ? { site: { managerId: actor.userId } }
      : actor.role === Role.EMPLOYEE
        ? {
            OR: [
              { reportedById: actor.userId },
              { mission: { assignments: { some: { userId: actor.userId } } } },
            ],
          }
        : {};

  const where = {
    ...scope,
    ...(filters.missionId ? { missionId: filters.missionId } : {}),
    ...(filters.siteId ? { siteId: filters.siteId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.problem.findMany({
      where,
      select: problemSelect,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.problem.count({ where }),
  ]);

  return { items: items.map(withPhotoRetention), total, page: filters.page, pageSize: filters.pageSize };
}

export async function getProblemById(actor: Actor, id: string) {
  const problem = await findProblemOrThrow(id);
  await assertCanView(actor, problem);
  return withPhotoRetention(problem);
}

export async function setProblemStatus(actor: Actor, id: string, status: ProblemStatus) {
  const problem = await findProblemOrThrow(id);
  // Comme pour deletePhoto : cette fonction sautait le contrôle "404 jamais
  // 403" (testé en conditions réelles — un employé totalement étranger à la
  // mission recevait 403 sur un signalement existant contre 404 sur un id
  // inexistant, ce qui confirme l'existence d'un signalement auquel il n'a
  // même pas le droit d'accéder). On vérifie d'abord le droit de VOIR
  // (404 sinon), puis seulement le droit de gérer (403 sinon).
  await assertCanView(actor, problem);
  if (!canManageProblem(actor, problem)) throw ApiError.forbidden();

  const currentIndex = STATUS_ORDER.indexOf(problem.status);
  const nextIndex = STATUS_ORDER.indexOf(status);
  if (nextIndex <= currentIndex) {
    // Deux responsables ont pu agir en même temps : message clair, en français.
    throw ApiError.conflict(
      `Ce signalement est déjà « ${STATUS_LABELS[problem.status]} » : le suivi ne peut qu'avancer. L'écran va se mettre à jour.`
    );
  }

  const updated = await prisma.problem.update({ where: { id }, data: { status }, select: problemSelect });

  await logActivity({
    userId: actor.userId,
    action: "PROBLEM_STATUS_CHANGED",
    entityType: "Problem",
    entityId: id,
    metadata: { from: problem.status, to: status },
  });

  const who = await actorName(actor.userId);
  await notifyProblemFollowers(problem, actor.userId, "Signalement mis à jour", (isReporter) =>
    `${who} a passé ${isReporter ? "votre signalement" : "le signalement"} sur « ${problem.mission?.title ?? problem.site.name} » (${problem.site.name}) à : ${STATUS_LABELS[status]}.`
  );

  return withPhotoRetention(updated);
}

const STATUS_LABELS: Record<ProblemStatus, string> = {
  NEW: "nouveau",
  IN_PROGRESS: "en cours de traitement",
  RESOLVED: "traité",
  VALIDATED: "validé",
};

export async function addComment(actor: Actor, problemId: string, comment: string) {
  const problem = await findProblemOrThrow(problemId);
  await assertCanView(actor, problem);

  const created = await prisma.problemComment.create({
    data: { problemId, authorId: actor.userId, comment },
    select: {
      id: true,
      comment: true,
      createdAt: true,
      author: { select: { id: true, firstName: true, lastName: true, avatarKey: true } },
    },
  });

  await logActivity({ userId: actor.userId, action: "PROBLEM_COMMENT_ADDED", entityType: "Problem", entityId: problemId });

  // Manque constaté lors d'une simulation de terrain réelle : l'auteur original
  // du signalement n'était jamais informé qu'on lui avait répondu (seuls les
  // changements de statut déclenchaient une notification, pas les commentaires).
  // On réutilise PROBLEM_UPDATE (pas de type dédié dans NotificationType) pour
  // rester cohérent avec `setProblemStatus`, qui notifie déjà `reportedById`
  // avec ce même type pour les mises à jour de son signalement.
  const author = await actorName(actor.userId);
  const preview = comment.length > 80 ? `${comment.slice(0, 80)}…` : comment;
  await notifyProblemFollowers(problem, actor.userId, "Nouveau commentaire", (isReporter) =>
    `${author} sur ${isReporter ? "votre signalement" : "le signalement"} « ${problem.mission?.title ?? problem.site.name} » : ${preview}`
  );

  return { ...created, author: withAvatarFlag(created.author) };
}

export async function addPhoto(actor: Actor, problemId: string, fileBuffer: Buffer) {
  const problem = await findProblemOrThrow(problemId);
  await assertCanView(actor, problem);

  const stored = await storeImage(fileBuffer);

  try {
    // Le contrôle "compter puis créer" n'était pas atomique : constaté en
    // conditions réelles, 25 uploads envoyés en parallèle sur un signalement
    // vide ont tous lu un compte < 20 avant qu'aucun n'ait encore inséré sa
    // ligne, et ont donc tous été acceptés — 25 photos stockées pour une
    // limite de 20. Le verrou consultatif Postgres, tenu pour la durée de la
    // transaction, sérialise les uploads concurrents sur un même
    // signalement (les autres attendent leur tour au lieu de courir contre
    // une lecture périmée), ce qui rend le compte réellement infranchissable.
    const photo = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${problemId})::bigint)`;

      const existingCount = await tx.photo.count({ where: { problemId, isDeleted: false } });
      if (existingCount >= MAX_PHOTOS_PER_PROBLEM) {
        throw ApiError.badRequest(`Ce signalement a déjà atteint la limite de ${MAX_PHOTOS_PER_PROBLEM} photos.`);
      }

      return tx.photo.create({
        data: {
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes,
          uploadedById: actor.userId,
          problemId,
        },
        select: { id: true, mimeType: true, sizeBytes: true, createdAt: true, uploadedById: true },
      });
    });

    await logActivity({ userId: actor.userId, action: "PROBLEM_PHOTO_ADDED", entityType: "Problem", entityId: problemId });

    return { ...photo, daysUntilDeletion: PHOTO_RETENTION_DAYS };
  } catch (err) {
    // La transaction a échoué (plafond atteint ou autre) : le fichier déjà
    // écrit sur disque par storeImage() n'a plus aucune ligne en base pour le
    // référencer — le supprimer pour ne pas laisser de fichier orphelin.
    await deleteStoredImage(stored.storageKey);
    throw err;
  }
}

export async function getPhotoFile(actor: Actor, problemId: string, photoId: string) {
  const problem = await findProblemOrThrow(problemId);
  await assertCanView(actor, problem);

  const photo = await prisma.photo.findFirst({ where: { id: photoId, problemId, isDeleted: false } });
  if (!photo) throw ApiError.notFound("Photo introuvable.");

  return photo;
}

export async function deletePhoto(actor: Actor, problemId: string, photoId: string) {
  const problem = await findProblemOrThrow(problemId);
  // Comme partout ailleurs dans ce module : ne jamais révéler l'existence
  // d'un signalement (ni de ses photos) à quelqu'un qui n'a même pas le
  // droit de le voir — 404, jamais 403 (incohérence corrigée : cette
  // fonction était la seule du module à sauter ce contrôle).
  await assertCanView(actor, problem);
  const photo = await prisma.photo.findFirst({ where: { id: photoId, problemId, isDeleted: false } });
  if (!photo) throw ApiError.notFound("Photo introuvable.");

  const canDelete = photo.uploadedById === actor.userId || canManageProblem(actor, problem);
  if (!canDelete) throw ApiError.forbidden();

  await prisma.photo.update({ where: { id: photoId }, data: { isDeleted: true } });
  await deleteStoredImage(photo.storageKey);

  await logActivity({ userId: actor.userId, action: "PROBLEM_PHOTO_DELETED", entityType: "Problem", entityId: problemId });
}
