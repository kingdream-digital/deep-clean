import crypto from "node:crypto";
import { calendarDay, calendarDayEnd, calendarDayKey, companyDateTime, companyLongDayLabel, companyTimeKey } from "../../utils/companyTime";
import { MissionStatus, NotificationType, Prisma, Role, ValidationType } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { findApprovedAbsencesInRange } from "../absences/absences.service";
import { deleteStoredFile, storePdfDocument } from "../../utils/storage";

interface Actor {
  userId: string;
  role: Role;
}

// Revirement métier assumé (retour explicite du client) : la création, la
// modification et l'annulation d'une mission sont désormais réservées au
// superviseur, à la RH, à la direction et à l'admin technique — le chef
// d'équipe n'a plus la main sur le planning lui-même. Il garde uniquement,
// sur ses propres chantiers ET sur les missions où il est spécifiquement
// désigné chef d'équipe ailleurs (voir isMissionLead) : ajouter/modifier la
// consigne d'une mission (voir `updateMission`, restriction de champ) et
// valider une mission terminée (avec la RH et le superviseur désormais —
// voir `validateMission`). Le suivi terrain (démarrer/terminer, voir
// `canOperateMission` plus bas) n'est plus réservé au chef d'équipe : il est
// désormais ouvert à tout le monde SAUF l'employé.
const MISSION_MANAGE_ROLES: Role[] = [Role.SUPERVISOR, Role.HR, Role.DIRECTOR, Role.ADMIN];

// Rôles autorisés à valider une mission terminée, EN PLUS du chef
// d'équipe propriétaire du chantier concerné (retour explicite du client :
// la RH et le superviseur doivent aussi pouvoir valider ; la direction
// également, retour explicite du client — elle n'est plus exclue).
const VALIDATE_MISSION_ROLES: Role[] = [Role.HR, Role.SUPERVISOR, Role.DIRECTOR];

const missionSelect = {
  id: true,
  title: true,
  date: true,
  startTime: true,
  endTime: true,
  instructions: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  // manager/supervisor exposés ici (pas juste leur id) — retour explicite du
  // client : pouvoir identifier directement, depuis une mission, le chef
  // d'équipe responsable du chantier et son superviseur fixe (utile pour
  // diagnostiquer un écart pointage/mission sans naviguer vers la fiche
  // chantier séparément).
  site: {
    select: {
      id: true,
      name: true,
      address: true,
      isActive: true,
      managerId: true,
      manager: { select: { id: true, firstName: true, lastName: true } },
      supervisorId: true,
      supervisor: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  recurrenceGroupId: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  assignments: {
    select: {
      userId: true,
      isLead: true,
      // `isActive` exposé (audit cas limites, incohérence de données après
      // cascade) : désactiver un chef d'équipe/employé ne le retire PAS de
      // ses missions déjà planifiées (assignment conservé tel quel, y compris
      // `isLead`) — confirmé en conditions réelles avec un chef d'équipe
      // désactivé resté "lead" d'une mission IN_PROGRESS. Sans ce champ, rien
      // ne permettait de distinguer ce cas d'un assigné parfaitement actif,
      // aussi bien côté mobile que pour quiconque consomme cette réponse.
      // `avatarKey` n'est jamais exposé tel quel (même principe que
      // users.service.ts::presentUser) : transformé en `hasAvatar` par
      // `presentMission` avant de quitter le service, pour permettre au
      // planning mobile d'afficher la vraie photo de chaque assigné.
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true, avatarKey: true },
      },
    },
  },
  validations: {
    select: {
      id: true,
      type: true,
      comment: true,
      createdAt: true,
      validatedBy: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
  jobSheet: {
    select: {
      id: true,
      tasks: true,
      equipment: true,
      safetyInstructions: true,
      notes: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      createdAt: true,
      updatedAt: true,
    },
  },
  standard: { select: { id: true, name: true } },
  // Métadonnées du document PDF exposées au client — jamais `standardDocumentKey`
  // (clé de stockage opaque, même règle que `Photo.storageKey`, voir
  // getStandardDocumentFile ci-dessous pour la route dédiée qui la résout).
  standardDocumentFileName: true,
  standardDocumentSizeBytes: true,
  standardDocumentUploadedAt: true,
  standardDocumentUploadedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

type MissionResult = Prisma.MissionGetPayload<{ select: typeof missionSelect }>;

// Retire `avatarKey` (jamais exposé tel quel) de chaque assigné et le
// remplace par `hasAvatar` — même principe que users.service.ts::presentUser,
// appliqué ici au niveau de `assignments[].user` pour que le planning mobile
// puisse afficher la vraie photo de chaque personne sur une mission.
function presentMission(mission: MissionResult) {
  return {
    ...mission,
    assignments: mission.assignments.map((a) => {
      const { avatarKey, ...restUser } = a.user;
      return { ...a, user: { ...restUser, hasAvatar: Boolean(avatarKey) } };
    }),
  };
}

function canManagePlanning(actor: Actor): boolean {
  return MISSION_MANAGE_ROLES.includes(actor.role);
}

function isOwningSiteManager(actor: Actor, site: { managerId: string | null }): boolean {
  return actor.role === Role.SITE_MANAGER && site.managerId === actor.userId;
}

type VisibleMission = { site: { managerId: string | null }; assignments: { userId: string; isLead: boolean }[] };

// Chef d'équipe DÉSIGNÉ SUR CETTE MISSION (leadId/isLead), qu'il gère ou non
// le chantier par ailleurs — retour explicite du client : c'est lui qui
// encadre l'équipe et gère l'intervention sur cette mission précise, il doit
// donc pouvoir agir dessus (suivi terrain, consigne, validation) comme le
// ferait le chef d'équipe propriétaire du chantier. Restreint au rôle Chef
// d'équipe : un employé qui se trouverait marqué `isLead` n'hérite jamais de
// ces droits, réservés au rôle.
function isMissionLead(actor: Actor, mission: { assignments: { userId: string; isLead: boolean }[] }): boolean {
  return actor.role === Role.SITE_MANAGER && mission.assignments.some((a) => a.userId === actor.userId && a.isLead);
}

function canSeeMission(actor: Actor, mission: VisibleMission): boolean {
  if (MISSION_MANAGE_ROLES.includes(actor.role)) return true;
  if (isOwningSiteManager(actor, mission.site)) return true;
  // Concerne aussi bien l'employé affecté que le chef d'équipe désigné pour
  // CETTE mission (leadId) sur un chantier qu'il ne gère pas par ailleurs —
  // retour explicite du client : un chef d'équipe n'est pas toujours le même
  // sur toutes les missions d'un chantier, il doit pouvoir voir celles où il
  // est spécifiquement désigné, pas seulement celles de "son" chantier.
  if (mission.assignments.some((a) => a.userId === actor.userId)) return true;
  return false;
}

// À appeler en tout premier dans chaque endpoint d'écriture, avant tout
// contrôle de permission d'action : un acteur qui n'a même pas le droit de
// VOIR la mission doit recevoir 404 (mission introuvable), jamais 403, sous
// peine de révéler par le code de statut HTTP l'existence d'une mission à
// laquelle il n'a aucun droit d'accès.
function assertCanSeeMission(actor: Actor, mission: VisibleMission): void {
  if (!canSeeMission(actor, mission)) throw ApiError.notFound("Mission introuvable.");
}

// Retour explicite du client : le suivi terrain (démarrer/terminer une
// mission) est ouvert à TOUT LE MONDE SAUF L'EMPLOYÉ — plus seulement au chef
// d'équipe propriétaire du chantier ou désigné sur la mission (isOwningSiteManager/
// isMissionLead, conservées ci-dessus car encore utilisées par `validateMission`).
// La portée réelle reste bornée par `assertCanSeeMission`, appelé avant : un
// chef d'équipe ne peut de toute façon opérer que sur une mission qu'il peut
// déjà voir (son chantier, ou une mission où il est affecté).
function canOperateMission(actor: Actor, _mission: VisibleMission): boolean {
  return actor.role !== Role.EMPLOYEE;
}

async function findSiteOrThrow(siteId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw ApiError.badRequest("Chantier introuvable.");
  return site;
}

// Combine une date calendaire et une heure "HH:mm" en un instant précis, en
// heure de Paris quel que soit le fuseau du serveur (voir utils/companyTime.ts :
// sur un serveur en heure universelle, une mission de 8 h s'affichait à 10 h).
function combineDateTime(date: string, time: string): Date {
  return companyDateTime(date, time);
}

// Extraction inverse (Date -> "AAAA-MM-JJ" / "HH:mm") à partir des composants
// LOCAUX — jamais toISOString(), qui convertit en UTC et décale le jour/l'heure
// affichés de la valeur de l'offset du fuseau horaire local (bug constaté lors
// de la relecture : une modification ne touchant pas la date/l'heure recalculait
// par erreur ces champs via toISOString, corrompant silencieusement la mission).
// `Mission.date` est un jour calendaire stocké à minuit UTC ; les heures sont
// relues en heure de Paris.
function toLocalDateString(d: Date): string {
  return calendarDayKey(d);
}

function toLocalTimeString(d: Date): string {
  return companyTimeKey(d);
}

// Nombre maximum d'occurrences (mission "source" incluse) pour une mission
// récurrente en une seule création — garde-fou contre une erreur de saisie
// sur la date de fin de récurrence (ex. mauvaise année) qui génèrerait des
// centaines de missions d'un coup.
export const MAX_RECURRING_OCCURRENCES = 60;

// Génère les dates (AAAA-MM-JJ) des occurrences SUIVANTES d'une mission
// récurrente — la mission du jour J (startDateStr) est déjà créée par
// l'appelant normalement, qu'elle tombe ou non sur un jour sélectionné :
// retour explicite du client, "tout les jours de la semaine ... pas besoin de
// le recréer à chaque fois", donc seules les occurrences AU-DELÀ de la date
// de départ sont générées ici, jusqu'à `untilStr` inclus.
function generateRecurringDates(startDateStr: string, daysOfWeek: number[], untilStr: string): string[] {
  const daysSet = new Set(daysOfWeek);
  const dates: string[] = [];
  const cursor = calendarDay(startDateStr);
  const until = calendarDay(untilStr);
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= until) {
    if (daysSet.has(cursor.getUTCDay())) {
      dates.push(calendarDayKey(cursor));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

async function assertAssigneesValid(assigneeIds: string[]): Promise<void> {
  const users = await prisma.user.findMany({ where: { id: { in: assigneeIds } } });
  if (users.length !== assigneeIds.length) {
    throw ApiError.badRequest("Un ou plusieurs employés affectés sont introuvables.");
  }
  const inactive = users.find((u) => !u.isActive);
  if (inactive) {
    throw ApiError.badRequest("Impossible d'affecter un employé dont le compte est désactivé.");
  }
}

// « « Remise en état salle de réunion », mercredi 7 octobre de 08:00 à 10:30 » :
// une notification doit dire DE QUELLE mission il s'agit et quand, sans avoir
// à l'ouvrir (retour terrain : « Une nouvelle mission vous a été attribuée »
// seul ne permettait pas de savoir laquelle, ni pour quand).
function describeMission(m: { title: string; startTime: Date; endTime: Date }): string {
  return `« ${m.title} », ${companyLongDayLabel(m.startTime)} de ${companyTimeKey(m.startTime)} à ${companyTimeKey(m.endTime)}`;
}

async function notifyAssignees(
  userIds: string[],
  type: NotificationType,
  title: string,
  body: string,
  missionId: string
): Promise<void> {
  await Promise.all(
    userIds.map((userId) =>
      createNotification({ userId, type, title, body, relatedEntityType: "Mission", relatedEntityId: missionId })
    )
  );
}

interface ConflictCheckInput {
  assigneeIds: string[];
  date: string;
  startTime: string;
  endTime: string;
  excludeMissionId?: string;
}

// Détecte, pour chaque employé pressenti, un chevauchement avec une autre
// mission (non annulée) déjà planifiée le même jour — pour que le
// superviseur/la RH voie tout de suite "qui est déjà pris" à l'écran de
// création, plutôt que de le découvrir après coup sur le terrain. Volontairement
// un AVERTISSEMENT, pas un blocage : certains recoupements (relève, supervision
// de deux équipes) peuvent être légitimes, la décision finale reste humaine.
export async function getAssignmentConflicts(actor: Actor, input: ConflictCheckInput) {
  if (!canManagePlanning(actor)) throw ApiError.forbidden();
  if (input.assigneeIds.length === 0) return [];

  const startTime = combineDateTime(input.date, input.startTime);
  const endTime = combineDateTime(input.date, input.endTime);
  const dayStart = calendarDay(input.date);

  const overlapping = await prisma.missionAssignment.findMany({
    where: {
      userId: { in: input.assigneeIds },
      mission: {
        status: { not: MissionStatus.CANCELLED },
        ...(input.excludeMissionId ? { id: { not: input.excludeMissionId } } : {}),
        date: dayStart,
        startTime: { lt: endTime },
        endTime: { gt: startTime },
      },
    },
    select: {
      userId: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      mission: {
        select: { id: true, title: true, startTime: true, endTime: true, site: { select: { name: true } } },
      },
    },
  });

  const missionConflicts = overlapping.map((a) => ({
    kind: "MISSION_OVERLAP" as const,
    user: a.user,
    conflictingMission: a.mission,
  }));

  // Même esprit d'avertissement : un employé pressenti dont l'absence est
  // déjà approuvée sur cette date doit apparaître ici aussi, pas seulement
  // découvert le jour J (§25 congés/absences croisé avec le planning).
  const assignees = await prisma.user.findMany({
    where: { id: { in: input.assigneeIds } },
    select: { id: true, firstName: true, lastName: true },
  });
  const absences = await findApprovedAbsencesInRange(input.assigneeIds, dayStart, calendarDayEnd(input.date));
  const absenceConflicts = absences.map((a) => {
    const user = assignees.find((u) => u.id === a.userId)!;
    return { kind: "ABSENCE" as const, user, absence: { type: a.type, startDate: a.startDate, endDate: a.endDate } };
  });

  return [...missionConflicts, ...absenceConflicts];
}

interface RecurrenceInput {
  // 0 = dimanche ... 6 = samedi (JS Date#getDay), envoyé tel quel par le mobile.
  daysOfWeek: number[];
  until: string;
}

interface CreateMissionInput {
  siteId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  instructions?: string;
  assigneeIds: string[];
  leadId?: string;
  standardId?: string;
  recurrence?: RecurrenceInput;
}

export async function createMission(actor: Actor, input: CreateMissionInput) {
  const site = await findSiteOrThrow(input.siteId);
  if (!canManagePlanning(actor)) throw ApiError.forbidden();
  if (!site.isActive) throw ApiError.badRequest("Ce chantier est inactif.");

  const startTime = combineDateTime(input.date, input.startTime);
  const endTime = combineDateTime(input.date, input.endTime);
  if (endTime <= startTime) {
    throw ApiError.badRequest("L'heure de fin doit être postérieure à l'heure de début.");
  }

  await assertAssigneesValid(input.assigneeIds);

  // Le standard appliqué doit appartenir au MÊME chantier que la mission —
  // un standard décrit les exigences d'un client précis, pas génériques.
  let standard: { tasks: string[]; equipment: string[]; safetyInstructions: string | null; notes: string | null } | null = null;
  if (input.standardId) {
    const found = await prisma.cleaningStandard.findUnique({ where: { id: input.standardId } });
    if (!found) throw ApiError.badRequest("Standard introuvable.");
    if (found.siteId !== input.siteId) {
      throw ApiError.badRequest("Ce standard appartient à un autre chantier.");
    }
    standard = found;
  }

  let recurringDates: string[] = [];
  let recurrenceGroupId: string | undefined;
  if (input.recurrence) {
    if (input.recurrence.until < input.date) {
      throw ApiError.badRequest("La date de fin de récurrence doit être postérieure à la date de la mission.");
    }
    recurringDates = generateRecurringDates(input.date, input.recurrence.daysOfWeek, input.recurrence.until);
    if (recurringDates.length + 1 > MAX_RECURRING_OCCURRENCES) {
      throw ApiError.badRequest(
        `Cette récurrence dépasse ${MAX_RECURRING_OCCURRENCES} missions au total : réduisez la période ou le nombre de jours sélectionnés.`
      );
    }
    if (recurringDates.length > 0) recurrenceGroupId = crypto.randomUUID();
  }

  const mission = await prisma.mission.create({
    data: {
      siteId: input.siteId,
      title: input.title,
      date: calendarDay(input.date),
      startTime,
      endTime,
      instructions: input.instructions,
      createdById: actor.userId,
      standardId: input.standardId,
      recurrenceGroupId,
      assignments: {
        create: input.assigneeIds.map((userId) => ({ userId, isLead: userId === input.leadId })),
      },
      ...(standard
        ? {
            jobSheet: {
              create: {
                tasks: standard.tasks,
                equipment: standard.equipment,
                safetyInstructions: standard.safetyInstructions,
                notes: standard.notes,
                createdById: actor.userId,
              },
            },
          }
        : {}),
    },
    select: missionSelect,
  });

  // Occurrences suivantes de la série (retour explicite du client : créer une
  // mission récurrente ne doit pas obliger à la recréer manuellement chaque
  // jour) — mêmes chantier/horaire/équipe/consigne/standard que la mission
  // source, chacune avec sa propre fiche de poste (JobSheet est 1:1 par
  // mission, ne peut pas être partagée). `createMany` ne supporte pas les
  // relations imbriquées : affectations et fiches de poste sont créées à part
  // une fois les missions elles-mêmes en base.
  if (recurringDates.length > 0 && recurrenceGroupId) {
    await prisma.mission.createMany({
      data: recurringDates.map((d) => ({
        siteId: input.siteId,
        title: input.title,
        date: calendarDay(d),
        startTime: combineDateTime(d, input.startTime),
        endTime: combineDateTime(d, input.endTime),
        instructions: input.instructions,
        createdById: actor.userId,
        standardId: input.standardId,
        recurrenceGroupId,
      })),
    });

    const occurrences = await prisma.mission.findMany({
      where: { recurrenceGroupId, id: { not: mission.id } },
      select: { id: true },
    });

    await prisma.missionAssignment.createMany({
      data: occurrences.flatMap((occ) =>
        input.assigneeIds.map((userId) => ({ missionId: occ.id, userId, isLead: userId === input.leadId }))
      ),
    });

    if (standard) {
      await prisma.jobSheet.createMany({
        data: occurrences.map((occ) => ({
          missionId: occ.id,
          tasks: standard!.tasks,
          equipment: standard!.equipment,
          safetyInstructions: standard!.safetyInstructions,
          notes: standard!.notes,
          createdById: actor.userId,
        })),
      });
    }
  }

  const recurrenceCount = recurringDates.length + 1;

  await logActivity({
    userId: actor.userId,
    action: "MISSION_CREATED",
    entityType: "Mission",
    entityId: mission.id,
    ...(recurrenceGroupId ? { metadata: { recurrenceGroupId, recurrenceCount } } : {}),
  });
  await notifyAssignees(
    input.assigneeIds,
    NotificationType.MISSION_ASSIGNED,
    "Nouvelle mission",
    recurrenceGroupId
      ? `Une mission récurrente vous a été attribuée (${recurrenceCount} occurrences jusqu'au ${input.recurrence!.until}).`
      : `Une nouvelle mission vous a été attribuée : ${describeMission(mission)}.`,
    mission.id
  );

  return { ...presentMission(mission), recurrenceCount };
}

interface ListMissionsFilters {
  siteId?: string;
  mine?: boolean;
  status?: MissionStatus;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export async function listMissions(actor: Actor, filters: ListMissionsFilters) {
  const forceMine = actor.role === Role.EMPLOYEE || filters.mine === true;

  let scope: Record<string, unknown> = {};
  if (forceMine) {
    scope = { assignments: { some: { userId: actor.userId } } };
  } else if (actor.role === Role.SITE_MANAGER) {
    // Voit les missions des chantiers qu'il gère ET celles où il est
    // spécifiquement désigné chef d'équipe ailleurs (retour explicite du
    // client : un chef d'équipe n'est pas toujours le même sur toutes les
    // missions d'un chantier) — même raisonnement que canSeeMission ci-dessus.
    scope = { OR: [{ site: { managerId: actor.userId } }, { assignments: { some: { userId: actor.userId } } }] };
  }
  // HR / DIRECTOR / ADMIN sans mine=true : aucune restriction supplémentaire
  // (vue globale nécessaire pour créer/gérer le planning de tous les chantiers).

  // N'ajoute QUE la clé "siteId" — jamais de clé "OR" ici (même bug que
  // from/to date : deux spreads sur la même clé s'écraseraient) : `scope`
  // porte déjà toute restriction de portée par rôle, `siteFilter` ne fait
  // qu'affiner sur un chantier précis, les deux se combinent en AND sans
  // collision de clé.
  const siteFilter = filters.siteId && !forceMine ? { siteId: filters.siteId } : {};

  // Bug corrigé (audit cas limites) : `from` et `to` écrivaient chacun une clé
  // `date` dans deux objets spreadés séparément — quand les DEUX étaient
  // fournis, le second spread (`to`) écrasait silencieusement le premier
  // (`from`), qui disparaissait purement et simplement du filtre. Résultat
  // constaté en conditions réelles : `GET /missions?status=COMPLETED&from=...&to=...`
  // ignorait la borne basse et renvoyait TOUTES les missions du statut
  // demandé antérieures à `to`, au lieu de la plage demandée — jusqu'à
  // exposer des données hors de la période filtrée. Un seul objet `date`
  // fusionnant les deux bornes, jamais deux spreads sur la même clé.
  const dateFilter: { gte?: Date; lte?: Date } = {};
  if (filters.from) dateFilter.gte = calendarDay(filters.from);
  if (filters.to) dateFilter.lte = calendarDayEnd(filters.to);

  const where = {
    ...scope,
    ...siteFilter,
    ...(filters.status ? { status: filters.status } : {}),
    ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.mission.findMany({
      where,
      select: missionSelect,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.mission.count({ where }),
  ]);

  return { items: items.map(presentMission), total, page: filters.page, pageSize: filters.pageSize };
}

async function findMissionOrThrow(id: string) {
  const mission = await prisma.mission.findUnique({ where: { id }, select: missionSelect });
  if (!mission) throw ApiError.notFound("Mission introuvable.");
  return mission;
}

export async function getMissionById(actor: Actor, id: string) {
  const mission = await findMissionOrThrow(id);
  assertCanSeeMission(actor, mission);
  return presentMission(mission);
}

interface UpdateMissionInput {
  siteId?: string;
  title?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  instructions?: string | null;
}

export async function updateMission(actor: Actor, id: string, input: UpdateMissionInput) {
  const mission = await findMissionOrThrow(id);
  assertCanSeeMission(actor, mission);
  const managesPlanning = canManagePlanning(actor);
  const owningManager = isOwningSiteManager(actor, mission.site) || isMissionLead(actor, mission);
  if (!managesPlanning && !owningManager) throw ApiError.forbidden();

  // Le chef d'équipe (propriétaire du chantier, ou désigné sur cette mission
  // précise) ne peut plus toucher au planning lui-même (titre, date, horaire,
  // chantier) — seule la consigne (`instructions`) reste ouverte pour lui.
  if (!managesPlanning) {
    const attemptedRestrictedField = Object.keys(input).some((key) => key !== "instructions");
    if (attemptedRestrictedField) throw ApiError.forbidden();
  }

  if (mission.status === MissionStatus.CANCELLED) {
    throw ApiError.conflict("Cette mission est annulée et ne peut plus être modifiée.");
  }
  // Même règle que cancelMission/setMissionStatus : une mission terminée
  // (potentiellement déjà validée) est un état final, jamais modifiable.
  if (mission.status === MissionStatus.COMPLETED) {
    throw ApiError.conflict("Cette mission est déjà terminée et ne peut plus être modifiée.");
  }

  if (input.siteId && input.siteId !== mission.site.id) {
    const newSite = await findSiteOrThrow(input.siteId);
    if (!newSite.isActive) throw ApiError.badRequest("Ce chantier est inactif.");
  }

  const date = input.date ?? toLocalDateString(mission.date);
  const startTimeStr = input.startTime ?? toLocalTimeString(mission.startTime);
  const endTimeStr = input.endTime ?? toLocalTimeString(mission.endTime);
  const startTime = combineDateTime(date, startTimeStr);
  const endTime = combineDateTime(date, endTimeStr);
  if (endTime <= startTime) {
    throw ApiError.badRequest("L'heure de fin doit être postérieure à l'heure de début.");
  }

  const timeChanged = Boolean(input.date || input.startTime || input.endTime);
  const siteChanged = Boolean(input.siteId && input.siteId !== mission.site.id);
  const instructionsChanged =
    input.instructions !== undefined && input.instructions !== mission.instructions && !!input.instructions;

  const updated = await prisma.mission.update({
    where: { id },
    data: {
      ...(input.title ? { title: input.title } : {}),
      ...(input.siteId ? { siteId: input.siteId } : {}),
      ...(timeChanged ? { date: calendarDay(date), startTime, endTime } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    },
    select: missionSelect,
  });

  await logActivity({
    userId: actor.userId,
    action: "MISSION_UPDATED",
    entityType: "Mission",
    entityId: id,
    metadata: input as Record<string, unknown>,
  });

  const assigneeIds = updated.assignments.map((a) => a.userId);
  if (siteChanged) {
    await notifyAssignees(
      assigneeIds,
      NotificationType.MISSION_SITE_CHANGED,
      "Chantier modifié",
      `Le lieu de votre mission a été modifié : ${describeMission(updated)}, ${updated.site.name}.`,
      id
    );
  }
  if (timeChanged) {
    await notifyAssignees(
      assigneeIds,
      NotificationType.MISSION_TIME_CHANGED,
      "Horaire modifié",
      `L'horaire de votre mission a été modifié : ${describeMission(updated)}.`,
      id
    );
  }
  if (instructionsChanged) {
    const author = await prisma.user.findUnique({
      where: { id: actor.userId },
      select: { firstName: true, lastName: true },
    });
    const authorName = author ? `${author.firstName} ${author.lastName}` : "un responsable";
    await notifyAssignees(
      assigneeIds,
      NotificationType.MISSION_INSTRUCTION_ADDED,
      "Nouvelle consigne",
      `Une nouvelle consigne a été ajoutée à votre mission « ${updated.title} » par ${authorName}.`,
      id
    );
  }

  return presentMission(updated);
}

export async function cancelMission(actor: Actor, id: string, scope: "one" | "series" = "one") {
  const mission = await findMissionOrThrow(id);
  assertCanSeeMission(actor, mission);
  if (!canManagePlanning(actor)) throw ApiError.forbidden();
  if (mission.status === MissionStatus.CANCELLED) {
    throw ApiError.conflict("Cette mission est déjà annulée.");
  }
  // Une mission terminée est un état final au même titre que pour
  // `setMissionStatus` (déjà gardé contre COMPLETED→IN_PROGRESS) — l'annuler
  // romprait la cohérence avec sa validation éventuelle (immuable) et fausse
  // les statistiques de validation. Bug corrigé : rien ne l'empêchait avant.
  if (mission.status === MissionStatus.COMPLETED) {
    throw ApiError.conflict("Cette mission est déjà terminée et ne peut plus être annulée.");
  }

  const updated = await prisma.mission.update({
    where: { id },
    data: { status: MissionStatus.CANCELLED },
    select: missionSelect,
  });

  await logActivity({ userId: actor.userId, action: "MISSION_CANCELLED", entityType: "Mission", entityId: id });
  await notifyAssignees(
    mission.assignments.map((a) => a.userId),
    NotificationType.MISSION_CANCELLED,
    "Mission annulée",
    `Votre mission a été annulée : ${describeMission(mission)}.`,
    id
  );

  // Annulation de toute la série récurrente (retour explicite du client :
  // symétrique de la création en série, éviter d'avoir à annuler chaque
  // occurrence une par une) — ne touche jamais une occurrence déjà en cours,
  // terminée ou annulée, ni une occurrence PASSÉE : seules les occurrences
  // encore SCHEDULED à partir de la date de celle-ci sont concernées.
  let seriesCancelledCount = 0;
  if (scope === "series" && mission.recurrenceGroupId) {
    const siblings = await prisma.mission.findMany({
      where: {
        recurrenceGroupId: mission.recurrenceGroupId,
        id: { not: id },
        status: MissionStatus.SCHEDULED,
        date: { gte: mission.date },
      },
      select: { id: true, assignments: { select: { userId: true } } },
    });

    if (siblings.length > 0) {
      await prisma.mission.updateMany({
        where: { id: { in: siblings.map((s) => s.id) } },
        data: { status: MissionStatus.CANCELLED },
      });
      seriesCancelledCount = siblings.length;

      await logActivity({
        userId: actor.userId,
        action: "MISSION_CANCELLED",
        entityType: "Mission",
        entityId: id,
        metadata: { recurrenceGroupId: mission.recurrenceGroupId, seriesCancelledCount },
      });

      const notifiedUserIds = new Set(siblings.flatMap((s) => s.assignments.map((a) => a.userId)));
      await notifyAssignees(
        [...notifiedUserIds],
        NotificationType.MISSION_CANCELLED,
        "Missions annulées",
        `${seriesCancelledCount} mission${seriesCancelledCount > 1 ? "s" : ""} à venir de cette série récurrente ${
          seriesCancelledCount > 1 ? "ont" : "a"
        } été annulée${seriesCancelledCount > 1 ? "s" : ""}.`,
        id
      );
    }
  }

  return { ...presentMission(updated), seriesCancelledCount };
}

export async function setMissionStatus(actor: Actor, id: string, status: "IN_PROGRESS" | "COMPLETED") {
  const mission = await findMissionOrThrow(id);
  assertCanSeeMission(actor, mission);
  if (!canOperateMission(actor, mission)) throw ApiError.forbidden();
  if (mission.status === MissionStatus.CANCELLED) {
    throw ApiError.conflict("Cette mission est annulée.");
  }
  // Une mission terminée est un état final pour ce statut de suivi terrain —
  // la repasser "en cours" romprait la cohérence avec sa validation
  // éventuelle (immuable, voir `validateMission`) et avec les statistiques
  // qui comptent les missions terminées/validées.
  if (mission.status === MissionStatus.COMPLETED) {
    throw ApiError.conflict("Cette mission est déjà terminée.");
  }
  // Un chantier désactivé ne doit plus accueillir de nouvelle activité —
  // mais une équipe déjà en cours de mission doit pouvoir la clôturer
  // proprement (IN_PROGRESS → COMPLETED reste autorisé), seul le DÉMARRAGE
  // (SCHEDULED → IN_PROGRESS) est bloqué (bug corrigé : rien n'empêchait
  // avant de démarrer une mission sur un chantier désactivé entre-temps).
  if (status === MissionStatus.IN_PROGRESS && !mission.site.isActive) {
    throw ApiError.conflict("Ce chantier est désactivé : impossible de démarrer une mission dessus.");
  }
  if (status === MissionStatus.COMPLETED && mission.status === MissionStatus.SCHEDULED) {
    throw ApiError.conflict("La mission doit être en cours avant de pouvoir être terminée.");
  }

  const updated = await prisma.mission.update({ where: { id }, data: { status }, select: missionSelect });
  await logActivity({ userId: actor.userId, action: `MISSION_STATUS_${status}`, entityType: "Mission", entityId: id });

  // Lacune corrigée (audit notifications) : une mission terminée sur le
  // terrain restait invisible pour les personnes habilitées à la valider —
  // NotificationType.VALIDATION_REQUESTED n'était déclenché nulle part dans
  // le code (le mobile a pourtant déjà son icône dédiée pour ce type,
  // preuve qu'il était prévu). On notifie le chef d'équipe propriétaire
  // du chantier (s'il existe et n'est pas l'auteur de la clôture) ainsi que
  // tous les RH, superviseurs et directeurs actifs — mêmes rôles que ceux
  // vérifiés dans `validateMission` pour le droit de valider — à
  // l'exclusion de l'auteur.
  if (status === MissionStatus.COMPLETED) {
    const validators = await prisma.user.findMany({
      where: { role: { in: VALIDATE_MISSION_ROLES }, isActive: true, id: { not: actor.userId } },
      select: { id: true },
    });
    const recipientIds = new Set(validators.map((v) => v.id));
    if (mission.site.managerId && mission.site.managerId !== actor.userId) {
      recipientIds.add(mission.site.managerId);
    }
    await notifyAssignees(
      [...recipientIds],
      NotificationType.VALIDATION_REQUESTED,
      "Mission à valider",
      `La mission « ${mission.title} » est terminée et attend votre validation.`,
      id
    );
  }

  return presentMission(updated);
}

interface UpdateAssignmentsInput {
  assigneeIds: string[];
  leadId?: string;
}

export async function updateAssignments(actor: Actor, id: string, input: UpdateAssignmentsInput) {
  const mission = await findMissionOrThrow(id);
  assertCanSeeMission(actor, mission);
  if (!canManagePlanning(actor)) throw ApiError.forbidden();
  if (mission.status === MissionStatus.CANCELLED) {
    throw ApiError.conflict("Cette mission est annulée et ne peut plus être modifiée.");
  }
  if (mission.status === MissionStatus.COMPLETED) {
    throw ApiError.conflict("Cette mission est déjà terminée et ne peut plus être modifiée.");
  }

  await assertAssigneesValid(input.assigneeIds);

  const currentIds = mission.assignments.map((a) => a.userId);
  const newlyAdded = input.assigneeIds.filter((uid) => !currentIds.includes(uid));
  const removed = currentIds.filter((uid) => !input.assigneeIds.includes(uid));

  await prisma.$transaction([
    prisma.missionAssignment.deleteMany({ where: { missionId: id } }),
    prisma.missionAssignment.createMany({
      data: input.assigneeIds.map((userId) => ({ missionId: id, userId, isLead: userId === input.leadId })),
    }),
  ]);

  const updated = await findMissionOrThrow(id);

  await logActivity({
    userId: actor.userId,
    action: "MISSION_ASSIGNMENTS_UPDATED",
    entityType: "Mission",
    entityId: id,
    metadata: { assigneeIds: input.assigneeIds },
  });

  if (newlyAdded.length > 0) {
    await notifyAssignees(
      newlyAdded,
      NotificationType.MISSION_ASSIGNED,
      "Nouvelle mission",
      `Une nouvelle mission vous a été attribuée : ${describeMission(mission)}.`,
      id
    );
  }
  // Retirer quelqu'un d'une mission est aussi un changement de planning qui
  // le concerne directement — jamais silencieux, sous peine qu'il continue à
  // croire qu'il doit s'y rendre (bug corrigé : seuls les ajouts étaient
  // notifiés auparavant).
  if (removed.length > 0) {
    await notifyAssignees(
      removed,
      NotificationType.MISSION_UNASSIGNED,
      "Mission retirée",
      "Vous n'êtes plus affecté à cette mission.",
      id
    );
  }

  return presentMission(updated);
}

/**
 * Validation d'une mission terminée — le chef d'équipe responsable du
 * chantier concerné, le chef d'équipe désigné sur cette mission précise
 * (retour explicite du client : c'est lui qui gère l'équipe et
 * l'intervention, il doit pouvoir valider comme le ferait le chef d'équipe
 * propriétaire du chantier), la RH, le superviseur et la direction peuvent
 * valider (retour explicite du client : la direction n'est plus exclue) ;
 * seul l'admin technique reste volontairement en dehors, son rôle étant
 * technique et non opérationnel.
 */
export async function validateMission(actor: Actor, id: string, comment?: string) {
  const mission = await findMissionOrThrow(id);
  assertCanSeeMission(actor, mission);

  const canValidate =
    isOwningSiteManager(actor, mission.site) || isMissionLead(actor, mission) || VALIDATE_MISSION_ROLES.includes(actor.role);
  if (!canValidate) {
    throw ApiError.forbidden(
      "Seul le chef d'équipe responsable de ce chantier ou désigné sur cette mission, la RH, un superviseur ou la direction peuvent valider cette mission."
    );
  }
  if (mission.status !== MissionStatus.COMPLETED) {
    throw ApiError.conflict("Seule une mission terminée peut être validée.");
  }
  const alreadyValidated = mission.validations.some((v) => v.type === ValidationType.MISSION_COMPLETION);
  if (alreadyValidated) {
    throw ApiError.conflict("Cette mission a déjà été validée.");
  }

  await prisma.validation.create({
    data: {
      type: ValidationType.MISSION_COMPLETION,
      missionId: id,
      validatedById: actor.userId,
      comment: comment || null,
    },
  });

  await logActivity({ userId: actor.userId, action: "MISSION_VALIDATED", entityType: "Mission", entityId: id });

  // Lacune corrigée (audit notifications) : la validation d'une mission
  // restait totalement silencieuse pour l'équipe qui l'a réalisée — rien ne
  // le lui signalait, ni dans l'app ni en push, alors que c'est justement la
  // confirmation que son travail est acté. Pas de type dédié dans
  // NotificationType pour ça : GENERAL est déjà le type utilisé ailleurs pour
  // ce genre d'information ponctuelle (voir notifyAbsenceManagers), et
  // relatedEntityType "Mission" suffit pour que la navigation existante
  // (mobile) ouvre directement la mission. L'auteur de la validation n'a pas
  // à être notifié de sa propre action.
  const validator = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { firstName: true, lastName: true },
  });
  const validatorName = validator ? `${validator.firstName} ${validator.lastName}` : "un responsable";
  await notifyAssignees(
    mission.assignments.map((a) => a.userId).filter((userId) => userId !== actor.userId),
    NotificationType.GENERAL,
    "Mission validée",
    `Votre mission « ${mission.title} » a été validée par ${validatorName}.`,
    id
  );

  return presentMission(await findMissionOrThrow(id));
}

// Marge autour du créneau de la mission pour rattacher un pointage : personne
// ne pointe exactement à la minute prévue (arrivée un peu avant, sortie un
// peu après). Pas de lien explicite pointage <-> mission en base (le
// pointage reste une action indépendante, générale à la journée) : ce
// rapprochement par recoupement horaire est un rapprochement approximatif,
// présenté comme tel côté mobile ("Pointages de l'équipe sur ce créneau"),
// jamais comme un lien garanti.
export const MISSION_TIME_ENTRY_BUFFER_MS = 3 * 60 * 60 * 1000;

// Pointages de l'équipe rattachés à une mission par recoupement horaire —
// un chef d'équipe/superviseur/RH/direction/admin voit ceux de toute
// l'équipe affectée, un employé ne voit que le sien (même règle de
// confidentialité que le reste du module Pointage : personne ne voit les
// heures d'un collègue sans un rôle habilité).
export async function getMissionTimeEntries(actor: Actor, missionId: string) {
  const mission = await getMissionById(actor, missionId);

  const assigneeIds = mission.assignments.map((a) => a.userId);
  const scopedUserIds =
    canManagePlanning(actor) || isOwningSiteManager(actor, mission.site) || isMissionLead(actor, mission)
      ? assigneeIds
      : assigneeIds.filter((id) => id === actor.userId);
  if (scopedUserIds.length === 0) return [];

  const windowStart = new Date(mission.startTime.getTime() - MISSION_TIME_ENTRY_BUFFER_MS);
  const windowEnd = new Date(mission.endTime.getTime() + MISSION_TIME_ENTRY_BUFFER_MS);

  return prisma.timeEntry.findMany({
    where: {
      userId: { in: scopedUserIds },
      clockIn: { lte: windowEnd },
      OR: [{ clockOut: null }, { clockOut: { gte: windowStart } }],
    },
    select: {
      id: true,
      userId: true,
      user: { select: { id: true, firstName: true, lastName: true } },
      clockIn: true,
      clockOut: true,
      status: true,
      isRetroactive: true,
    },
    orderBy: { clockIn: "asc" },
  });
}

interface JobSheetInput {
  tasks: string[];
  equipment: string[];
  safetyInstructions?: string | null;
  notes?: string | null;
}

// Fiche de poste = document standard de la mission, réservée aux rôles qui
// gèrent le planning (superviseur en premier lieu, RH/direction/admin) —
// le chef d'équipe n'y touche pas, seule la consigne libre lui reste ouverte.
export async function upsertJobSheet(actor: Actor, missionId: string, input: JobSheetInput) {
  const mission = await findMissionOrThrow(missionId);
  assertCanSeeMission(actor, mission);
  if (!canManagePlanning(actor)) throw ApiError.forbidden();
  if (mission.status === MissionStatus.CANCELLED || mission.status === MissionStatus.COMPLETED) {
    throw ApiError.conflict("Cette mission est annulée ou déjà terminée : la fiche de poste ne peut plus être modifiée.");
  }

  const tasks = input.tasks.map((t) => t.trim()).filter(Boolean);
  const equipment = input.equipment.map((e) => e.trim()).filter(Boolean);

  await prisma.jobSheet.upsert({
    where: { missionId },
    update: {
      tasks,
      equipment,
      safetyInstructions: input.safetyInstructions || null,
      notes: input.notes || null,
    },
    create: {
      missionId,
      tasks,
      equipment,
      safetyInstructions: input.safetyInstructions || null,
      notes: input.notes || null,
      createdById: actor.userId,
    },
  });

  await logActivity({
    userId: actor.userId,
    action: "JOB_SHEET_UPDATED",
    entityType: "Mission",
    entityId: missionId,
  });

  return presentMission(await findMissionOrThrow(missionId));
}

// --- Document PDF de référence (ex. standard de nettoyage du client) ---
// Même droits que la fiche de poste (canManagePlanning) : c'est la personne
// qui organise le planning qui prépare la documentation de la mission, pas
// le chef d'équipe sur le terrain. Contrairement à la fiche de poste,
// volontairement PAS bloqué sur une mission COMPLETED/CANCELLED : un document
// de référence reste consultable après coup (contrôle qualité, archivage),
// ce n'est pas une étape de workflow qui doit se figer.

export async function attachStandardDocument(
  actor: Actor,
  missionId: string,
  fileBuffer: Buffer,
  originalName: string
) {
  const mission = await findMissionOrThrow(missionId);
  assertCanSeeMission(actor, mission);
  if (!canManagePlanning(actor)) throw ApiError.forbidden();

  // `standardDocumentKey` n'est jamais dans missionSelect (jamais exposé au
  // client) : on le relit spécifiquement ici pour purger l'ancien fichier
  // après un remplacement.
  const current = await prisma.mission.findUnique({ where: { id: missionId }, select: { standardDocumentKey: true } });

  const stored = await storePdfDocument(fileBuffer);

  let updated;
  try {
    updated = await prisma.mission.update({
      where: { id: missionId },
      data: {
        standardDocumentKey: stored.storageKey,
        standardDocumentFileName: originalName.slice(0, 255),
        standardDocumentSizeBytes: stored.sizeBytes,
        standardDocumentUploadedById: actor.userId,
        standardDocumentUploadedAt: new Date(),
      },
      select: missionSelect,
    });
  } catch (err) {
    // Le fichier a été écrit sur disque par storePdfDocument() avant l'échec
    // de la mise à jour en base — ne pas laisser de fichier orphelin (même
    // raisonnement que problems.service.ts::addPhoto).
    await deleteStoredFile(stored.storageKey);
    throw err;
  }

  if (current?.standardDocumentKey) {
    await deleteStoredFile(current.standardDocumentKey);
  }

  await logActivity({
    userId: actor.userId,
    action: "MISSION_STANDARD_DOCUMENT_ATTACHED",
    entityType: "Mission",
    entityId: missionId,
    metadata: { fileName: updated.standardDocumentFileName },
  });

  const author = await prisma.user.findUnique({ where: { id: actor.userId }, select: { firstName: true, lastName: true } });
  const authorName = author ? `${author.firstName} ${author.lastName}` : "un responsable";
  await notifyAssignees(
    updated.assignments.map((a) => a.userId).filter((id) => id !== actor.userId),
    NotificationType.MISSION_INSTRUCTION_ADDED,
    "Nouveau document sur votre mission",
    `${authorName} a ajouté un document (standard de nettoyage) à votre mission « ${updated.title} ».`,
    missionId
  );

  return presentMission(updated);
}

export async function getStandardDocumentFile(actor: Actor, missionId: string) {
  const mission = await findMissionOrThrow(missionId);
  assertCanSeeMission(actor, mission);

  const doc = await prisma.mission.findUnique({
    where: { id: missionId },
    select: { standardDocumentKey: true, standardDocumentFileName: true },
  });
  if (!doc?.standardDocumentKey) throw ApiError.notFound("Document introuvable.");

  return { storageKey: doc.standardDocumentKey, fileName: doc.standardDocumentFileName ?? "standard.pdf" };
}

export async function removeStandardDocument(actor: Actor, missionId: string) {
  const mission = await findMissionOrThrow(missionId);
  assertCanSeeMission(actor, mission);
  if (!canManagePlanning(actor)) throw ApiError.forbidden();

  const current = await prisma.mission.findUnique({ where: { id: missionId }, select: { standardDocumentKey: true } });
  if (!current?.standardDocumentKey) throw ApiError.notFound("Document introuvable.");

  const updated = await prisma.mission.update({
    where: { id: missionId },
    data: {
      standardDocumentKey: null,
      standardDocumentFileName: null,
      standardDocumentSizeBytes: null,
      standardDocumentUploadedById: null,
      standardDocumentUploadedAt: null,
    },
    select: missionSelect,
  });

  await deleteStoredFile(current.standardDocumentKey);

  await logActivity({
    userId: actor.userId,
    action: "MISSION_STANDARD_DOCUMENT_REMOVED",
    entityType: "Mission",
    entityId: missionId,
  });

  return presentMission(updated);
}
