import { AbsenceStatus, AbsenceType, MissionStatus, NotificationType, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { countBusinessDays, recordLeaveCancelled, recordLeaveTaken } from "../leave/leave.service";

interface Actor {
  userId: string;
  role: Role;
}

// La RH gère les absences (cahier des charges §2 RH : "gérer les
// disponibilités, gérer les absences") — direction et admin technique
// peuvent aussi décider, cohérent avec les autres rôles de gestion du
// personnel déjà en place. Le superviseur aussi (retour explicite du
// client) : il suit déjà l'équipe au quotidien (planning, pointages), il
// doit être notifié d'une demande d'absence et pouvoir la décider comme la
// RH ou la direction.
const MANAGE_ABSENCES_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN, Role.SUPERVISOR];

function canManageAbsences(actor: Actor): boolean {
  return MANAGE_ABSENCES_ROLES.includes(actor.role);
}

// Retour explicite du client, correction : un chef d'équipe ne décide jamais
// des congés — il reste un simple référent de chantier auprès des employés
// (consultation de son équipe, planning, terrain...), jamais une autorité de
// validation. Un précédent réglage lui avait par erreur donné ce droit sur
// sa propre équipe ; annulé ici. Seuls canManageAbsences (RH/direction/
// superviseur/admin) décident — la fonction ne prend que `actor` pour
// autant, gardée async/avec le même nom pour ne pas toucher ses appelants.
async function canDecideAbsence(actor: Actor, _absenceUserId: string): Promise<boolean> {
  return canManageAbsences(actor);
}

const absenceSelect = {
  id: true,
  userId: true,
  user: { select: { id: true, firstName: true, lastName: true, role: true } },
  type: true,
  startDate: true,
  endDate: true,
  reason: true,
  status: true,
  decidedById: true,
  decidedBy: { select: { id: true, firstName: true, lastName: true } },
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Ajoute le nombre de jours OUVRÉS de la période (retour explicite du
// client : "DeepClean calcule automatiquement le nombre de jours") — jamais
// stocké, toujours recalculé à partir de startDate/endDate via la même
// fonction que la déduction réelle (voir leave.service.ts), pour qu'un
// affichage "3 jours" corresponde toujours exactement à ce qui sera déduit.
function presentAbsence<T extends { startDate: Date; endDate: Date }>(absence: T): T & { daysCount: number } {
  return { ...absence, daysCount: countBusinessDays(absence.startDate, absence.endDate) };
}

function toDayStart(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}
function toDayEnd(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999`);
}

async function resolveManagedTeamIds(managerId: string): Promise<string[]> {
  const team = await prisma.siteMember.findMany({ where: { site: { managerId } }, select: { userId: true } });
  return Array.from(new Set([managerId, ...team.map((m) => m.userId)]));
}

interface CreateAbsenceInput {
  userId?: string;
  type: "PAID_LEAVE" | "SICK_LEAVE" | "UNPAID_LEAVE" | "OTHER";
  startDate: string;
  endDate: string;
  reason?: string;
}

export async function createAbsence(actor: Actor, input: CreateAbsenceInput) {
  const targetUserId = input.userId ?? actor.userId;
  if (targetUserId !== actor.userId && !canManageAbsences(actor)) {
    throw ApiError.forbidden("Vous ne pouvez déclarer une absence que pour vous-même.");
  }

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw ApiError.badRequest("Utilisateur introuvable.");
  if (!target.isActive) throw ApiError.badRequest("Ce compte est désactivé.");

  const startDate = toDayStart(input.startDate);
  const endDate = toDayEnd(input.endDate);

  // Chevauchement avec une absence DÉJÀ APPROUVÉE du même utilisateur : refusé
  // d'emblée (incohérence réelle) — deux demandes PENDING qui se chevauchent
  // restent possibles, c'est à la RH de trancher laquelle retenir.
  const overlapping = await prisma.absence.findFirst({
    where: {
      userId: targetUserId,
      status: AbsenceStatus.APPROVED,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlapping) {
    throw ApiError.conflict("Une absence déjà approuvée chevauche cette période.");
  }

  // La RH (et direction/admin) fait autorité : une absence qu'elle déclare
  // elle-même est directement approuvée, jamais soumise à sa propre
  // validation. Un employé qui déclare la sienne reste en attente.
  const isSelfAuthoritative = canManageAbsences(actor);

  const absence = await prisma.absence.create({
    data: {
      userId: targetUserId,
      type: input.type,
      startDate,
      endDate,
      reason: input.reason,
      status: isSelfAuthoritative ? AbsenceStatus.APPROVED : AbsenceStatus.PENDING,
      decidedById: isSelfAuthoritative ? actor.userId : null,
      decidedAt: isSelfAuthoritative ? new Date() : null,
    },
    select: absenceSelect,
  });

  await logActivity({
    userId: actor.userId,
    action: "ABSENCE_CREATED",
    entityType: "Absence",
    entityId: absence.id,
    metadata: { targetUserId, status: absence.status },
  });

  if (isSelfAuthoritative) {
    await notifyMissionConflicts(absence.id, targetUserId, startDate, endDate);
  } else {
    await notifyAbsenceManagers(absence.id, target);
  }

  return presentAbsence(absence);
}

// Notifie uniquement la RH/direction/superviseur/admin — seuls décisionnaires
// des congés (retour explicite du client, correction : le chef d'équipe n'en
// décide jamais, un précédent réglage l'avait par erreur ajouté ici aussi).
async function notifyAbsenceManagers(
  absenceId: string,
  target: { firstName: string; lastName: string }
): Promise<void> {
  const managers = await prisma.user.findMany({ where: { role: { in: MANAGE_ABSENCES_ROLES }, isActive: true }, select: { id: true } });
  await Promise.all(
    managers.map((m) =>
      createNotification({
        userId: m.id,
        type: NotificationType.ABSENCE_REQUESTED,
        title: "Demande d'absence",
        body: `${target.firstName} ${target.lastName} a demandé une absence à valider.`,
        relatedEntityType: "Absence",
        relatedEntityId: absenceId,
      })
    )
  );
}

// Détection AUTOMATIQUE des missions déjà planifiées sur la période d'une
// absence désormais approuvée : notifie le créateur de la mission et le chef
// d'équipe du site concerné, pour qu'ils réaffectent quelqu'un d'autre —
// jamais de blocage/annulation automatique de la mission elle-même, la
// décision humaine reste nécessaire.
async function notifyMissionConflicts(absenceId: string, userId: string, startDate: Date, endDate: Date): Promise<void> {
  const conflictingMissions = await prisma.mission.findMany({
    where: {
      status: { in: [MissionStatus.SCHEDULED, MissionStatus.IN_PROGRESS] },
      date: { gte: startDate, lte: endDate },
      assignments: { some: { userId } },
    },
    select: {
      id: true,
      title: true,
      date: true,
      createdById: true,
      site: { select: { managerId: true } },
    },
  });
  if (conflictingMissions.length === 0) return;

  for (const mission of conflictingMissions) {
    const recipientIds = new Set<string>([mission.createdById, ...(mission.site.managerId ? [mission.site.managerId] : [])]);
    await Promise.all(
      [...recipientIds].map((recipientId) =>
        createNotification({
          userId: recipientId,
          type: NotificationType.ABSENCE_CONFLICT,
          title: "Conflit planning / absence",
          body: `Une absence approuvée chevauche la mission « ${mission.title} » — un remplacement est à prévoir.`,
          relatedEntityType: "Mission",
          relatedEntityId: mission.id,
        })
      )
    );
  }

  await logActivity({
    userId,
    action: "ABSENCE_MISSION_CONFLICT_DETECTED",
    entityType: "Absence",
    entityId: absenceId,
    metadata: { missionIds: conflictingMissions.map((m) => m.id) },
  });
}

interface ListAbsencesFilters {
  userId?: string;
  status?: "PENDING" | "APPROVED" | "REJECTED";
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listAbsences(actor: Actor, filters: ListAbsencesFilters) {
  let allowedUserIds: string[] | null = null;
  if (actor.role === Role.EMPLOYEE || actor.role === Role.SUPERVISOR) {
    allowedUserIds = [actor.userId];
  } else if (actor.role === Role.SITE_MANAGER) {
    allowedUserIds = await resolveManagedTeamIds(actor.userId);
  }
  // HR / DIRECTOR / ADMIN : vue globale.

  let userIdFilter: Record<string, unknown> = {};
  if (filters.userId) {
    if (allowedUserIds && !allowedUserIds.includes(filters.userId)) {
      userIdFilter = { userId: "__forbidden__" };
    } else {
      userIdFilter = { userId: filters.userId };
    }
  } else if (allowedUserIds) {
    userIdFilter = { userId: { in: allowedUserIds } };
  }

  const where = {
    ...userIdFilter,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.from ? { endDate: { gte: toDayStart(filters.from) } } : {}),
    ...(filters.to ? { startDate: { lte: toDayEnd(filters.to) } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.absence.findMany({
      where,
      select: absenceSelect,
      orderBy: { startDate: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.absence.count({ where }),
  ]);

  return { items: items.map(presentAbsence), total, page: filters.page, pageSize: filters.pageSize };
}

async function findAbsenceOrThrow(id: string) {
  const absence = await prisma.absence.findUnique({ where: { id }, select: absenceSelect });
  if (!absence) throw ApiError.notFound("Absence introuvable.");
  return absence;
}

export async function getAbsenceById(actor: Actor, id: string) {
  const absence = await findAbsenceOrThrow(id);
  if (absence.userId === actor.userId) return presentAbsence(absence);
  if (canManageAbsences(actor)) return presentAbsence(absence);
  if (actor.role === Role.SITE_MANAGER) {
    const team = await resolveManagedTeamIds(actor.userId);
    if (team.includes(absence.userId)) return presentAbsence(absence);
  }
  throw ApiError.notFound("Absence introuvable.");
}

export async function decideAbsence(
  actor: Actor,
  id: string,
  input: { status: "APPROVED" | "REJECTED"; decisionNote?: string }
) {
  const absence = await findAbsenceOrThrow(id);
  if (!(await canDecideAbsence(actor, absence.userId))) throw ApiError.forbidden();

  if (absence.status !== AbsenceStatus.PENDING) {
    throw ApiError.conflict("Cette demande a déjà été traitée.");
  }

  if (input.status === AbsenceStatus.APPROVED) {
    const overlapping = await prisma.absence.findFirst({
      where: {
        id: { not: id },
        userId: absence.userId,
        status: AbsenceStatus.APPROVED,
        startDate: { lte: absence.endDate },
        endDate: { gte: absence.startDate },
      },
    });
    if (overlapping) {
      throw ApiError.conflict("Une autre absence déjà approuvée chevauche cette période.");
    }
  }

  const updated = await prisma.absence.update({
    where: { id },
    data: {
      status: input.status,
      decidedById: actor.userId,
      decidedAt: new Date(),
      decisionNote: input.decisionNote,
    },
    select: absenceSelect,
  });

  await logActivity({
    userId: actor.userId,
    action: input.status === AbsenceStatus.APPROVED ? "ABSENCE_APPROVED" : "ABSENCE_REJECTED",
    entityType: "Absence",
    entityId: id,
  });

  await createNotification({
    userId: absence.userId,
    type: NotificationType.ABSENCE_DECIDED,
    title: input.status === AbsenceStatus.APPROVED ? "Absence approuvée" : "Absence refusée",
    body:
      input.status === AbsenceStatus.APPROVED
        ? "Votre demande d'absence a été approuvée."
        : `Votre demande d'absence a été refusée${input.decisionNote ? " : " + input.decisionNote : "."}`,
    relatedEntityType: "Absence",
    relatedEntityId: id,
  });

  if (input.status === AbsenceStatus.APPROVED) {
    await notifyMissionConflicts(id, absence.userId, absence.startDate, absence.endDate);
    // Déduction du solde de congés (retour explicite du client, moteur de
    // congés) — uniquement pour un congé payé : les arrêts maladie, congés
    // sans solde ou "autres" ne touchent jamais au compteur de congés payés,
    // chaque type garde sa propre logique.
    if (absence.type === AbsenceType.PAID_LEAVE) {
      await recordLeaveTaken(absence, actor.userId);
    }
  }

  return presentAbsence(updated);
}

// Annulation d'un congé déjà décidé (retour explicite du client, section
// "Modification et annulation") — recrédite le solde si un congé payé
// approuvé est annulé, et rouvre la disponibilité dans le planning (aucune
// indisponibilité stockée séparément : le statut CANCELLED suffit, les
// mêmes requêtes qui filtrent APPROVED l'excluent déjà naturellement).
export async function cancelAbsence(actor: Actor, id: string) {
  const absence = await findAbsenceOrThrow(id);

  const isOwnRequest = absence.userId === actor.userId;
  const isAuthorizedManager = await canDecideAbsence(actor, absence.userId);
  if (!isOwnRequest && !isAuthorizedManager) throw ApiError.forbidden();

  if (absence.status !== AbsenceStatus.PENDING && absence.status !== AbsenceStatus.APPROVED) {
    throw ApiError.conflict("Seule une demande en attente ou approuvée peut être annulée.");
  }
  // Un employé ne peut annuler lui-même qu'un congé qui n'a pas encore
  // commencé — une fois entamé, seul un responsable habilité tranche
  // (retour explicite du client : "une personne autorisée peut modifier ou
  // annuler un congé").
  if (isOwnRequest && !isAuthorizedManager && absence.startDate <= new Date()) {
    throw ApiError.forbidden("Ce congé a déjà commencé : seul un responsable peut l'annuler.");
  }

  const wasApprovedPaidLeave = absence.status === AbsenceStatus.APPROVED && absence.type === AbsenceType.PAID_LEAVE;

  const updated = await prisma.absence.update({
    where: { id },
    data: { status: AbsenceStatus.CANCELLED, decidedById: actor.userId, decidedAt: new Date() },
    select: absenceSelect,
  });

  let recreditedDays = 0;
  if (wasApprovedPaidLeave) {
    recreditedDays = await recordLeaveCancelled(absence, actor.userId);
  }

  await logActivity({
    userId: actor.userId,
    action: "ABSENCE_CANCELLED",
    entityType: "Absence",
    entityId: id,
    metadata: { recreditedDays },
  });

  if (!isOwnRequest) {
    await createNotification({
      userId: absence.userId,
      type: NotificationType.ABSENCE_CANCELLED,
      title: "Congé annulé",
      body: recreditedDays > 0 ? `Votre congé a été annulé — ${recreditedDays} jour(s) recrédité(s).` : "Votre congé a été annulé.",
      relatedEntityType: "Absence",
      relatedEntityId: id,
    });
  }

  return presentAbsence(updated);
}

// Réutilisé par missions.service.ts (`getAssignmentConflicts`) pour avertir,
// à la création/modification d'une mission, qu'un employé pressenti a une
// absence approuvée sur la période — même esprit que les chevauchements de
// planning déjà détectés là-bas : un AVERTISSEMENT, jamais un blocage.
export async function findApprovedAbsencesInRange(
  userIds: string[],
  startDate: Date,
  endDate: Date
): Promise<{ userId: string; type: string; startDate: Date; endDate: Date }[]> {
  if (userIds.length === 0) return [];
  return prisma.absence.findMany({
    where: {
      userId: { in: userIds },
      status: AbsenceStatus.APPROVED,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
    select: { userId: true, type: true, startDate: true, endDate: true },
  });
}
