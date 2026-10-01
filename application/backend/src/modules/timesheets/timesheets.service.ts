import { MissionStatus, Prisma, Role, TimeEntryStatus } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { createNotification } from "../notifications/notifications.service";
import { MISSION_TIME_ENTRY_BUFFER_MS } from "../missions/missions.service";
import { deleteStoredImage, storeImage } from "../../utils/storage";

export interface ClockPosition {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface Actor {
  userId: string;
  role: Role;
}

// La RH, la direction, l'admin et le superviseur (dont c'est le rôle central :
// il valide les heures avant transmission à la RH) valident les heures de
// tout le monde (sauf les leurs) ; le chef d'équipe valide celles des
// employés de ses propres chantiers (voir `isTeamMemberOf`). Un employé
// pointe pour lui-même, jamais pour autrui.
const GLOBAL_VALIDATE_ROLES: Role[] = [Role.SUPERVISOR, Role.HR, Role.DIRECTOR, Role.ADMIN];

// Fenêtre maximale pour un pointage différé (oubli) : au-delà, l'écart est
// trop important pour être fiable, l'employé doit passer par la RH.
const MAX_RETROACTIVE_DAYS = 7;

// Bug corrigé (audit notifications, sept. 2026) : ne s'appuyait QUE sur
// SiteMember, une table que rien dans l'application ne peuple jamais (aucun
// écran n'appelle POST /sites/:id/members) — en pratique, un chef d'équipe
// ne pouvait donc JAMAIS valider, ni même consulter, le pointage d'un
// employé de son chantier, malgré la permission explicitement prévue pour
// ce rôle ci-dessous. On reconnaît maintenant aussi l'appartenance à
// l'équipe via une affectation à une mission de ce chantier — une relation
// réelle, toujours à jour, du même type que celle déjà utilisée pour la
// portée du planning (voir missions.service.ts) — en plus de SiteMember,
// gardée pour ne rien retirer si elle est un jour alimentée par un futur
// écran de gestion d'équipe.
async function isTeamMemberOf(managerId: string, employeeId: string): Promise<boolean> {
  const [membership, assignment] = await Promise.all([
    prisma.siteMember.findFirst({
      where: { userId: employeeId, site: { managerId } },
      select: { id: true },
    }),
    prisma.missionAssignment.findFirst({
      where: { userId: employeeId, mission: { site: { managerId } } },
      select: { id: true },
    }),
  ]);
  return membership !== null || assignment !== null;
}

async function canValidate(actor: Actor, targetUserId: string): Promise<boolean> {
  if (actor.userId === targetUserId) return false; // jamais valider ses propres heures
  if (GLOBAL_VALIDATE_ROLES.includes(actor.role)) return true;
  if (actor.role === Role.SITE_MANAGER) return isTeamMemberOf(actor.userId, targetUserId);
  return false;
}

export const timeEntrySelect = {
  id: true,
  userId: true,
  user: { select: { id: true, firstName: true, lastName: true, role: true, avatarKey: true } },
  clockIn: true,
  clockOut: true,
  status: true,
  validatedById: true,
  validatedBy: { select: { id: true, firstName: true, lastName: true } },
  validatedAt: true,
  comment: true,
  isRetroactive: true,
  clockInLatitude: true,
  clockInLongitude: true,
  clockInAccuracy: true,
  clockInPhotoKey: true,
  clockOutLatitude: true,
  clockOutLongitude: true,
  clockOutAccuracy: true,
  clockOutPhotoKey: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Verrouille la ligne de l'utilisateur (SELECT ... FOR UPDATE) pour la durée
// de la transaction : sérialise les clock-in/clock-out concurrents du MÊME
// employé (double-tap, retry réseau sur requête lente) sans affecter les
// autres utilisateurs — corrige une condition de course où deux requêtes
// simultanées passaient toutes les deux le "pas de pointage ouvert" avant
// qu'aucune des deux créations n'ait été validée, laissant deux pointages
// ouverts pour la même personne et corrompant silencieusement les totaux
// d'heures (résumé hebdomadaire, rapprochement pointage/mission).
async function lockUserRow(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  // PAS de cast ::uuid : le schéma Prisma déclare `id String @id @default(uuid())`
  // SANS `@db.Uuid`, donc la colonne Postgres réelle est `text`, pas le type
  // natif `uuid`. Le cast comparait un `uuid` à une colonne `text` — Postgres
  // n'a pas d'opérateur `=` entre ces deux types, ce qui faisait échouer
  // CETTE REQUÊTE EN PRODUCTION à chaque appel (bug jamais détecté avant : pas
  // de base Postgres locale disponible pour exécuter les tests, seulement les
  // type-checker — un test purement statique ne pouvait pas l'attraper).
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
}

// Même principe que `lockUserRow`, mais sur le pointage lui-même : sérialise
// les appels concurrents de validation/refus d'UN MÊME pointage (deux
// validateurs qui cliquent au même instant, ou un double-tap réseau) pour
// qu'un seul l'emporte au lieu de laisser le pointage finir dans un état
// incohérent (validé puis refusé, ou l'inverse, avec deux notifications
// contradictoires envoyées à l'employé).
async function lockTimeEntryRow(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "time_entries" WHERE id = ${id} FOR UPDATE`;
}

// Enlève la clé de stockage brute de la réponse API (même principe que
// Photo.storageKey, jamais exposée telle quelle — voir schema.prisma) au
// profit d'un simple booléen : le client récupère le fichier via la route
// authentifiée dédiée (GET /:id/clock-in-photo ou /clock-out-photo), jamais
// par la clé elle-même.
// Même principe pour la photo de profil de la personne (`hasAvatar`), affichée
// sur l'écran de validation des heures.
function presentEntry<
  T extends { clockInPhotoKey?: string | null; clockOutPhotoKey?: string | null; user?: { avatarKey?: string | null } }
>(entry: T) {
  const { clockInPhotoKey, clockOutPhotoKey, ...rest } = entry;
  const user = rest.user ? (({ avatarKey, ...u }) => ({ ...u, hasAvatar: Boolean(avatarKey) }))(rest.user) : rest.user;
  return { ...rest, user, hasClockInPhoto: Boolean(clockInPhotoKey), hasClockOutPhoto: Boolean(clockOutPhotoKey) };
}

export async function clockIn(actor: Actor, position: ClockPosition, photoBuffer: Buffer) {
  // Stocké HORS transaction (I/O disque, pas de verrou à tenir pendant ce
  // temps) ; si la transaction échoue ensuite (pointage déjà ouvert), le
  // fichier orphelin est supprimé dans le catch, même principe que
  // problems.service.ts::addPhoto.
  const stored = await storeImage(photoBuffer);

  try {
    const entry = await prisma.$transaction(async (tx) => {
      await lockUserRow(tx, actor.userId);

      const open = await tx.timeEntry.findFirst({
        where: { userId: actor.userId, clockOut: null },
      });
      if (open) {
        throw ApiError.conflict("Vous êtes déjà pointé — pointez d'abord votre sortie.");
      }

      return tx.timeEntry.create({
        data: {
          userId: actor.userId,
          clockIn: new Date(),
          clockInLatitude: position.latitude,
          clockInLongitude: position.longitude,
          clockInAccuracy: position.accuracy,
          clockInPhotoKey: stored.storageKey,
        },
        select: timeEntrySelect,
      });
    });

    await logActivity({ userId: actor.userId, action: "TIME_ENTRY_CLOCK_IN", entityType: "TimeEntry", entityId: entry.id });
    return presentEntry(entry);
  } catch (err) {
    await deleteStoredImage(stored.storageKey);
    throw err;
  }
}

export async function clockOut(actor: Actor, position: ClockPosition, photoBuffer: Buffer) {
  const stored = await storeImage(photoBuffer);

  try {
    const entry = await prisma.$transaction(async (tx) => {
      await lockUserRow(tx, actor.userId);

      const open = await tx.timeEntry.findFirst({
        where: { userId: actor.userId, clockOut: null },
        orderBy: { clockIn: "desc" },
      });
      if (!open) {
        throw ApiError.conflict("Aucun pointage en cours à clôturer.");
      }

      return tx.timeEntry.update({
        where: { id: open.id },
        data: {
          clockOut: new Date(),
          clockOutLatitude: position.latitude,
          clockOutLongitude: position.longitude,
          clockOutAccuracy: position.accuracy,
          clockOutPhotoKey: stored.storageKey,
        },
        select: timeEntrySelect,
      });
    });

    await logActivity({ userId: actor.userId, action: "TIME_ENTRY_CLOCK_OUT", entityType: "TimeEntry", entityId: entry.id });
    return presentEntry(entry);
  } catch (err) {
    await deleteStoredImage(stored.storageKey);
    throw err;
  }
}

// Pointage différé : l'employé a oublié de pointer et saisit après coup une
// session déjà terminée (arrivée + départ connus), plutôt qu'un pointage en
// cours. Reste soumis à validation comme n'importe quel pointage — signalé
// via `isRetroactive` pour que le validateur le voie clairement.
export async function createRetroactiveTimeEntry(
  actor: Actor,
  input: { clockIn: string; clockOut: string; comment?: string }
) {
  const clockInDate = new Date(input.clockIn);
  const clockOutDate = new Date(input.clockOut);
  const now = new Date();

  if (Number.isNaN(clockInDate.getTime()) || Number.isNaN(clockOutDate.getTime())) {
    throw ApiError.badRequest("Dates de pointage invalides.");
  }
  if (clockOutDate <= clockInDate) {
    throw ApiError.badRequest("L'heure de sortie doit être postérieure à l'heure d'entrée.");
  }
  if (clockOutDate > now) {
    throw ApiError.badRequest("Un pointage différé ne peut pas concerner une période future.");
  }
  const oldestAllowed = new Date(now.getTime() - MAX_RETROACTIVE_DAYS * 24 * 60 * 60 * 1000);
  if (clockInDate < oldestAllowed) {
    throw ApiError.badRequest(
      `Un pointage différé ne peut pas remonter à plus de ${MAX_RETROACTIVE_DAYS} jours. Contactez la RH pour une régularisation plus ancienne.`
    );
  }

  const entry = await prisma.$transaction(async (tx) => {
    await lockUserRow(tx, actor.userId);

    const overlapping = await tx.timeEntry.findFirst({
      where: {
        userId: actor.userId,
        OR: [{ clockOut: null }, { clockOut: { gt: clockInDate } }],
        clockIn: { lt: clockOutDate },
      },
    });
    if (overlapping) {
      throw ApiError.conflict("Cette période chevauche un pointage déjà enregistré.");
    }

    return tx.timeEntry.create({
      data: {
        userId: actor.userId,
        clockIn: clockInDate,
        clockOut: clockOutDate,
        isRetroactive: true,
        comment: input.comment,
      },
      select: timeEntrySelect,
    });
  });
  await logActivity({
    userId: actor.userId,
    action: "TIME_ENTRY_RETROACTIVE_CREATED",
    entityType: "TimeEntry",
    entityId: entry.id,
  });
  return presentEntry(entry);
}

export async function getMyStatus(actor: Actor) {
  const open = await prisma.timeEntry.findFirst({
    where: { userId: actor.userId, clockOut: null },
    select: timeEntrySelect,
  });
  return { clockedIn: open !== null, openEntry: open ? presentEntry(open) : null };
}

export interface ListFilters {
  userId?: string;
  status?: TimeEntryStatus;
  from?: string;
  to?: string;
}

// Détermine l'ensemble des utilisateurs dont l'acteur peut voir les
// pointages (`null` = vue globale, sans restriction), PUIS applique le
// filtre `userId` optionnel EN INTERSECTION de cet ensemble — jamais en
// simple écrasement d'un objet `where` par un autre : un chef d'équipe
// qui passerait `?userId=<hors équipe>` doit être bloqué, pas voir ses
// heures (bug corrigé : l'ancienne version construisait `scope` et
// `userFilter` comme deux objets à même clé `userId`, et le spread final
// laissait `userFilter` écraser silencieusement la restriction d'équipe).
// Un chef d'équipe gère lui-même + les membres des chantiers dont il est
// responsable — règle centrale de portée, partagée par toutes les vues
// (liste/export/rapprochement) pour ne jamais avoir deux définitions
// susceptibles de diverger.
async function resolveManagedTeamIds(managerId: string): Promise<string[]> {
  const team = await prisma.siteMember.findMany({
    where: { site: { managerId } },
    select: { userId: true },
  });
  return Array.from(new Set([managerId, ...team.map((m) => m.userId)]));
}

export async function buildTimeEntriesWhere(actor: Actor, filters: ListFilters) {
  let allowedUserIds: string[] | null = null;

  if (actor.role === Role.EMPLOYEE) {
    allowedUserIds = [actor.userId];
  } else if (actor.role === Role.SITE_MANAGER) {
    allowedUserIds = await resolveManagedTeamIds(actor.userId);
  }
  // HR / DIRECTOR / ADMIN / SUPERVISOR : vue globale, allowedUserIds reste null.

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

  // Bug corrigé (audit exports pointages, sept. 2026) : `from` et `to` étaient
  // deux objets `{ clockIn: {...} }` séparés fusionnés par spread SOUS LA MÊME
  // CLÉ `clockIn` — le second (`to`) écrasait silencieusement le premier
  // (`from`) au lieu de s'y ajouter. Résultat vérifié en confrontant deux
  // exports : `?from=X&to=X` sur une seule journée renvoyait TOUT l'historique
  // (uniquement la borne `to` appliquée), au lieu des seules entrées de X. Ce
  // where est partagé par la liste ET les 3 formats d'export — même correction
  // pour tous. On construit maintenant un seul objet `clockIn` combinant les
  // deux bornes quand les deux sont fournies.
  const clockInFilter: Record<string, Date> = {};
  if (filters.from) clockInFilter.gte = new Date(`${filters.from}T00:00:00`);
  if (filters.to) clockInFilter.lte = new Date(`${filters.to}T23:59:59`);

  return {
    ...userIdFilter,
    ...(filters.status ? { status: filters.status } : {}),
    ...(Object.keys(clockInFilter).length > 0 ? { clockIn: clockInFilter } : {}),
  };
}

export async function listTimeEntries(actor: Actor, filters: ListFilters & { page: number; pageSize: number }) {
  const where = await buildTimeEntriesWhere(actor, filters);

  const [items, total] = await Promise.all([
    prisma.timeEntry.findMany({
      where,
      select: timeEntrySelect,
      orderBy: { clockIn: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.timeEntry.count({ where }),
  ]);

  const withOvertime = await attachOvertimeInfo(items);
  const withMission = await attachMatchedMissions(withOvertime);
  return { items: withMission.map(presentEntry), total, page: filters.page, pageSize: filters.pageSize };
}

// Au-delà de cette marge, un pointage validé plus long que les missions
// auxquelles il se rattache est considéré comme des heures supplémentaires —
// en-deça, c'est juste l'imprécision normale d'un pointage manuel.
const OVERTIME_TOLERANCE_MINUTES = 15;

type OvertimeSource = { id: string; userId: string; clockIn: Date; clockOut: Date | null; status: TimeEntryStatus };

// Rattache à chaque pointage VALIDÉ un nombre d'heures supplémentaires
// détecté par recoupement horaire avec les missions de la personne (même
// heuristique/marge que missions.service.ts) : un pointage plus long que la
// ou les missions auxquelles il correspond est signalé comme "heures
// supplémentaires" — visible aussi bien par l'employé sur son propre pointage
// que par la RH — dès lors qu'un validateur l'a approuvé sans le retoucher.
// Un pointage encore en attente n'est jamais marqué : c'est justement ce que
// le validateur doit trancher.
async function attachOvertimeInfo<T extends OvertimeSource>(entries: T[]): Promise<(T & { overtimeMinutes: number | null })[]> {
  const validated = entries.filter((e) => e.clockOut !== null && e.status === TimeEntryStatus.VALIDATED);
  if (validated.length === 0) {
    return entries.map((e) => ({ ...e, overtimeMinutes: null }));
  }

  const userIds = Array.from(new Set(validated.map((e) => e.userId)));
  const minClockIn = new Date(Math.min(...validated.map((e) => e.clockIn.getTime())) - MISSION_TIME_ENTRY_BUFFER_MS);
  const maxClockOut = new Date(Math.max(...validated.map((e) => e.clockOut!.getTime())) + MISSION_TIME_ENTRY_BUFFER_MS);

  const missions = await prisma.mission.findMany({
    where: {
      status: { not: MissionStatus.CANCELLED },
      startTime: { lte: maxClockOut },
      endTime: { gte: minClockIn },
      assignments: { some: { userId: { in: userIds } } },
    },
    select: { startTime: true, endTime: true, assignments: { select: { userId: true } } },
  });

  return entries.map((e) => {
    if (e.clockOut === null || e.status !== TimeEntryStatus.VALIDATED) return { ...e, overtimeMinutes: null };

    const windowStart = new Date(e.clockIn.getTime() - MISSION_TIME_ENTRY_BUFFER_MS);
    const windowEnd = new Date(e.clockOut.getTime() + MISSION_TIME_ENTRY_BUFFER_MS);
    const matched = missions.filter(
      (m) => m.assignments.some((a) => a.userId === e.userId) && m.startTime < windowEnd && m.endTime > windowStart
    );
    if (matched.length === 0) return { ...e, overtimeMinutes: null };

    const scheduledMinutes = matched.reduce((sum, m) => sum + (m.endTime.getTime() - m.startTime.getTime()) / 60000, 0);
    const workedMinutes = (e.clockOut.getTime() - e.clockIn.getTime()) / 60000;
    const gap = Math.round(workedMinutes - scheduledMinutes);
    return { ...e, overtimeMinutes: gap > OVERTIME_TOLERANCE_MINUTES ? gap : null };
  });
}

export interface MatchedMissionInfo {
  id: string;
  title: string;
  date: Date;
  startTime: Date;
  endTime: Date;
  site: { name: string; address: string; latitude: number | null; longitude: number | null };
}

type MissionMatchSource = {
  id: string;
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  clockInLatitude: number | null;
  clockInLongitude: number | null;
  clockOutLatitude: number | null;
  clockOutLongitude: number | null;
};

// Distance à vol d'oiseau (formule de Haversine) — calcul purement local, sans
// aucun service externe (retour explicite du client : "faut pas que tu
// prennes sur internet, je veux faire tourner ça en interne"), pour vérifier
// qu'un pointage a bien été fait à proximité du chantier prévu.
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function matchOverlapMinutes(entry: MissionMatchSource, mission: { startTime: Date; endTime: Date }): number {
  const entryEnd = entry.clockOut ?? new Date();
  const start = Math.max(entry.clockIn.getTime(), mission.startTime.getTime());
  const end = Math.min(entryEnd.getTime(), mission.endTime.getTime());
  return Math.max(0, end - start) / 60000;
}

function matchDistanceMinutes(entry: MissionMatchSource, mission: { startTime: Date; endTime: Date }): number {
  const entryEnd = entry.clockOut ?? new Date();
  if (entryEnd.getTime() < mission.startTime.getTime()) return (mission.startTime.getTime() - entryEnd.getTime()) / 60000;
  if (entry.clockIn.getTime() > mission.endTime.getTime()) return (entry.clockIn.getTime() - mission.endTime.getTime()) / 60000;
  return 0;
}

// Rattache à chaque pointage clôturé le chantier/la mission à laquelle il
// correspond le mieux — même heuristique de recoupement horaire que le
// rapprochement RH (`getReconciliationDetail` : recouvrement réel maximal,
// puis distance minimale à défaut de recouvrement), pour que le justificatif
// (photo + position) affiché à la RH/au superviseur/à la direction montre
// aussi, à côté de l'heure pointée, l'heure PRÉVUE pour ce chantier — retour
// explicite du client, pour repérer un abus (ex. prévu 8h-9h, pointé 8h-11h).
// Volontairement non exclusif entre pointages voisins (contrairement au
// rapprochement) : ici chaque pointage est affiché indépendamment, il n'y a
// pas de total agrégé à protéger d'un double comptage.
async function attachMatchedMissions<T extends MissionMatchSource>(
  entries: T[]
): Promise<(T & { matchedMission: MatchedMissionInfo | null; clockInDistanceMeters: number | null; clockOutDistanceMeters: number | null })[]> {
  const closed = entries.filter((e) => e.clockOut !== null);
  if (closed.length === 0) {
    return entries.map((e) => ({ ...e, matchedMission: null, clockInDistanceMeters: null, clockOutDistanceMeters: null }));
  }

  const userIds = Array.from(new Set(closed.map((e) => e.userId)));
  const minClockIn = new Date(Math.min(...closed.map((e) => e.clockIn.getTime())) - MISSION_TIME_ENTRY_BUFFER_MS);
  const maxClockOut = new Date(Math.max(...closed.map((e) => e.clockOut!.getTime())) + MISSION_TIME_ENTRY_BUFFER_MS);

  const missions = await prisma.mission.findMany({
    where: {
      status: { not: MissionStatus.CANCELLED },
      startTime: { lte: maxClockOut },
      endTime: { gte: minClockIn },
      assignments: { some: { userId: { in: userIds } } },
    },
    select: {
      id: true,
      title: true,
      date: true,
      startTime: true,
      endTime: true,
      site: { select: { name: true, address: true, latitude: true, longitude: true } },
      assignments: { select: { userId: true } },
    },
  });

  return entries.map((e) => {
    if (e.clockOut === null) return { ...e, matchedMission: null, clockInDistanceMeters: null, clockOutDistanceMeters: null };

    const windowStart = new Date(e.clockIn.getTime() - MISSION_TIME_ENTRY_BUFFER_MS);
    const windowEnd = new Date(e.clockOut.getTime() + MISSION_TIME_ENTRY_BUFFER_MS);
    const candidates = missions.filter(
      (m) => m.assignments.some((a) => a.userId === e.userId) && m.startTime < windowEnd && m.endTime > windowStart
    );
    if (candidates.length === 0) {
      return { ...e, matchedMission: null, clockInDistanceMeters: null, clockOutDistanceMeters: null };
    }

    let best = candidates[0]!;
    let bestOverlap = matchOverlapMinutes(e, best);
    let bestDistance = matchDistanceMinutes(e, best);
    for (const candidate of candidates.slice(1)) {
      const overlap = matchOverlapMinutes(e, candidate);
      const distance = matchDistanceMinutes(e, candidate);
      if (overlap > bestOverlap || (overlap === bestOverlap && distance < bestDistance)) {
        best = candidate;
        bestOverlap = overlap;
        bestDistance = distance;
      }
    }

    const { assignments, ...missionInfo } = best;
    const site = missionInfo.site;
    const clockInDistanceMeters =
      site.latitude != null && site.longitude != null && e.clockInLatitude != null && e.clockInLongitude != null
        ? Math.round(haversineMeters(e.clockInLatitude, e.clockInLongitude, site.latitude, site.longitude))
        : null;
    const clockOutDistanceMeters =
      site.latitude != null && site.longitude != null && e.clockOutLatitude != null && e.clockOutLongitude != null
        ? Math.round(haversineMeters(e.clockOutLatitude, e.clockOutLongitude, site.latitude, site.longitude))
        : null;

    return { ...e, matchedMission: missionInfo, clockInDistanceMeters, clockOutDistanceMeters };
  });
}

// Neutralise l'injection de formule CSV/Excel (OWASP CSV Injection) : un champ
// libre saisi par un utilisateur (commentaire de pointage) commençant par
// =, +, -, @ serait interprété comme une formule par Excel/LibreOffice à
// l'ouverture du fichier — un préfixe apostrophe neutralise l'interprétation
// sans altérer la valeur affichée.
const FORMULA_PREFIX_CHARS = new Set(["=", "+", "-", "@"]);

function csvEscape(value: string): string {
  const neutralized = FORMULA_PREFIX_CHARS.has(value.charAt(0)) ? `'${value}` : value;
  // ";" est aussi échappé : c'est le VRAI délimiteur de ce fichier (locale
  // française), pas seulement "," — un commentaire contenant un point-virgule
  // décalait silencieusement toutes les colonnes suivantes de la ligne.
  if (/["\n;]/.test(neutralized)) return `"${neutralized.replace(/"/g, '""')}"`;
  return neutralized;
}

const csvDateFmt = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
const csvTimeFmt = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const STATUS_LABEL_FR: Record<TimeEntryStatus, string> = {
  PENDING: "En attente",
  VALIDATED: "Validé",
  REJECTED: "Refusé",
};

// Export CSV des pointages — même portée que la consultation (un employé ne
// peut exporter que les siens, un chef d'équipe que son équipe,
// superviseur/RH/direction/admin n'importe qui) : le dossier RH "par
// personne" pour la paie réutilise cette même règle, jamais un contournement.
export async function exportTimeEntriesCsv(actor: Actor, filters: ListFilters): Promise<string> {
  const where = await buildTimeEntriesWhere(actor, filters);

  const items = await prisma.timeEntry.findMany({
    where,
    select: timeEntrySelect,
    orderBy: { clockIn: "asc" },
  });

  const header = ["Employé", "Date", "Arrivée", "Départ", "Durée (h)", "Statut", "Différé", "Commentaire"];
  const rows = items.map((entry) => {
    const durationHours = entry.clockOut
      ? ((entry.clockOut.getTime() - entry.clockIn.getTime()) / 3_600_000).toFixed(2)
      : "";
    return [
      `${entry.user.firstName} ${entry.user.lastName}`,
      csvDateFmt(entry.clockIn),
      csvTimeFmt(entry.clockIn),
      entry.clockOut ? csvTimeFmt(entry.clockOut) : "",
      durationHours,
      STATUS_LABEL_FR[entry.status],
      entry.isRetroactive ? "Oui" : "",
      entry.comment ?? "",
    ];
  });

  // Export de données nominatives d'heures (potentiellement toute l'équipe
  // pour un rôle habilité) destinées à la paie — journalisé comme toute autre
  // action sensible de ce module (cahier des charges §21).
  await logActivity({
    userId: actor.userId,
    action: "TIME_ENTRIES_EXPORTED",
    entityType: "TimeEntry",
    metadata: { ...filters, rowCount: items.length },
  });

  // BOM UTF-8 : Excel (Windows) n'affiche correctement les accents dans un
  // CSV que si ce marqueur précède le contenu.
  const lines = [header, ...rows].map((row) => row.map((cell) => csvEscape(String(cell))).join(";"));
  return "﻿" + lines.join("\r\n");
}

async function findEntryOrThrow(id: string) {
  const entry = await prisma.timeEntry.findUnique({ where: { id }, select: timeEntrySelect });
  if (!entry) throw ApiError.notFound("Pointage introuvable.");
  return entry;
}

// Un employé ne voit que ses propres pointages ; un chef d'équipe, les
// siens et ceux de son équipe ; superviseur/RH/direction/admin, tous — même
// portée que `listTimeEntries`. Partagée avec l'accès aux photos justificatives
// (voir `getTimeEntryPhoto`), qui doit suivre exactement la même règle.
async function assertCanViewEntry(actor: Actor, entry: { userId: string }): Promise<boolean> {
  return (
    actor.userId === entry.userId ||
    GLOBAL_VALIDATE_ROLES.includes(actor.role) ||
    (actor.role === Role.SITE_MANAGER && (await isTeamMemberOf(actor.userId, entry.userId)))
  );
}

// 404 (jamais 403) hors périmètre, pour ne pas révéler l'existence du pointage.
export async function getTimeEntryById(actor: Actor, id: string) {
  const entry = await findEntryOrThrow(id);
  if (!(await assertCanViewEntry(actor, entry))) throw ApiError.notFound("Pointage introuvable.");

  const [withOvertime] = await attachOvertimeInfo([entry]);
  const [withMission] = await attachMatchedMissions([withOvertime!]);
  return presentEntry(withMission!);
}

// Sert le justificatif photo d'un pointage (arrivée ou sortie) — jamais d'URL
// publique, même principe que problems.service.ts::getPhotoFile : la
// permission est revérifiée ici, pas seulement au moment de l'affichage de la
// liste/fiche.
export async function getTimeEntryPhoto(actor: Actor, id: string, moment: "in" | "out") {
  const entry = await findEntryOrThrow(id);
  if (!(await assertCanViewEntry(actor, entry))) throw ApiError.notFound("Pointage introuvable.");

  const storageKey = moment === "in" ? entry.clockInPhotoKey : entry.clockOutPhotoKey;
  if (!storageKey) throw ApiError.notFound("Aucune photo pour ce pointage.");

  return { storageKey, mimeType: "image/jpeg" };
}

// Fenêtre lisible "20/09 09:00–17:00" pour les messages de notification —
// jamais toISOString() (voir la même remarque dans missions.service.ts).
function formatEntryWindow(clockIn: Date, clockOut: Date): string {
  const day = String(clockIn.getDate()).padStart(2, "0");
  const month = String(clockIn.getMonth() + 1).padStart(2, "0");
  const startTime = `${String(clockIn.getHours()).padStart(2, "0")}:${String(clockIn.getMinutes()).padStart(2, "0")}`;
  const endTime = `${String(clockOut.getHours()).padStart(2, "0")}:${String(clockOut.getMinutes()).padStart(2, "0")}`;
  return `${day}/${month} ${startTime}–${endTime}`;
}

export async function validateTimeEntry(actor: Actor, id: string, comment?: string) {
  const entry = await findEntryOrThrow(id);
  if (!(await canValidate(actor, entry.userId))) throw ApiError.forbidden();
  if (!entry.clockOut) throw ApiError.conflict("Ce pointage n'est pas encore clôturé.");
  if (entry.status === TimeEntryStatus.VALIDATED) throw ApiError.conflict("Ce pointage est déjà validé.");

  const updated = await prisma.$transaction(async (tx) => {
    await lockTimeEntryRow(tx, id);
    const fresh = await tx.timeEntry.findUnique({ where: { id }, select: { status: true } });
    if (!fresh) throw ApiError.notFound("Pointage introuvable.");
    if (fresh.status === TimeEntryStatus.VALIDATED) throw ApiError.conflict("Ce pointage est déjà validé.");

    return tx.timeEntry.update({
      where: { id },
      // Bug corrigé (audit exports pointages, sept. 2026) : `comment: comment || null`
      // écrasait TOUJOURS le commentaire original de l'employé par null dès qu'un
      // validateur validait sans en saisir un lui-même — constaté en confrontant le
      // contenu réel de l'export CSV/XLSX à ce qui avait été saisi : le commentaire
      // de l'employé (contexte d'un pointage différé, remarque sur un écart, etc.)
      // disparaissait silencieusement dans le dossier transmis à la paie. Un
      // commentaire de validateur explicitement fourni reste prioritaire (il peut
      // vouloir clarifier ou compléter), mais l'absence de commentaire ne doit plus
      // effacer celui de l'employé.
      data: { status: TimeEntryStatus.VALIDATED, validatedById: actor.userId, validatedAt: new Date(), comment: comment || entry.comment },
      select: timeEntrySelect,
    });
  });

  await logActivity({ userId: actor.userId, action: "TIME_ENTRY_VALIDATED", entityType: "TimeEntry", entityId: id });
  const validator = await prisma.user.findUnique({ where: { id: actor.userId }, select: { firstName: true, lastName: true } });
  const validatorName = validator ? `${validator.firstName} ${validator.lastName}` : "un validateur";
  await createNotification({
    userId: entry.userId,
    type: "TIMESHEET_VALIDATED",
    title: "Heures validées",
    body: `Vos heures du ${formatEntryWindow(entry.clockIn, entry.clockOut)} ont été validées par ${validatorName} et transmises à la RH.`,
    relatedEntityType: "TimeEntry",
    relatedEntityId: id,
  });

  // Sans ça, `overtimeMinutes` restait absent de la réponse (contrairement à
  // listTimeEntries/getTimeEntryById) : le badge "heures supp." n'apparaissait
  // qu'après avoir quitté puis rouvert l'écran de validation.
  const [withOvertime] = await attachOvertimeInfo([updated]);
  const [withMission] = await attachMatchedMissions([withOvertime!]);
  return presentEntry(withMission!);
}

export async function rejectTimeEntry(actor: Actor, id: string, comment: string) {
  const entry = await findEntryOrThrow(id);
  if (!(await canValidate(actor, entry.userId))) throw ApiError.forbidden();
  if (!entry.clockOut) throw ApiError.conflict("Ce pointage n'est pas encore clôturé.");
  if (entry.status === TimeEntryStatus.VALIDATED) throw ApiError.conflict("Ce pointage est déjà validé et ne peut plus être refusé.");

  const updated = await prisma.$transaction(async (tx) => {
    await lockTimeEntryRow(tx, id);
    const fresh = await tx.timeEntry.findUnique({ where: { id }, select: { status: true } });
    if (!fresh) throw ApiError.notFound("Pointage introuvable.");
    if (fresh.status === TimeEntryStatus.VALIDATED) {
      throw ApiError.conflict("Ce pointage est déjà validé et ne peut plus être refusé.");
    }

    return tx.timeEntry.update({
      where: { id },
      data: { status: TimeEntryStatus.REJECTED, validatedById: actor.userId, validatedAt: new Date(), comment },
      select: timeEntrySelect,
    });
  });

  await logActivity({ userId: actor.userId, action: "TIME_ENTRY_REJECTED", entityType: "TimeEntry", entityId: id, metadata: { comment } });
  const validator = await prisma.user.findUnique({ where: { id: actor.userId }, select: { firstName: true, lastName: true } });
  const validatorName = validator ? `${validator.firstName} ${validator.lastName}` : "un validateur";
  await createNotification({
    userId: entry.userId,
    type: "TIMESHEET_VALIDATED",
    title: "Pointage à corriger",
    body: `Vos heures du ${formatEntryWindow(entry.clockIn, entry.clockOut)} ont été refusées par ${validatorName} : ${comment}`,
    relatedEntityType: "TimeEntry",
    relatedEntityId: id,
  });

  // Cohérence de contrat avec le reste du module : chaque pointage renvoyé au
  // client porte `overtimeMinutes` (jamais absent), même si un pointage
  // refusé vaudra toujours `null` ici (voir `attachOvertimeInfo`).
  const [withOvertime] = await attachOvertimeInfo([updated]);
  const [withMission] = await attachMatchedMissions([withOvertime!]);
  return presentEntry(withMission!);
}

// --- Rapprochement pointage <-> mission (menu RH "qui a un écart à examiner") ---

function canViewReconciliation(actor: Actor): boolean {
  return GLOBAL_VALIDATE_ROLES.includes(actor.role) || actor.role === Role.SITE_MANAGER;
}

async function resolveReconciliationUserIds(actor: Actor): Promise<string[]> {
  if (actor.role === Role.SITE_MANAGER) {
    return resolveManagedTeamIds(actor.userId);
  }
  const users = await prisma.user.findMany({ where: { isActive: true }, select: { id: true } });
  return users.map((u) => u.id);
}

interface ReconciliationFilters {
  from: string;
  to: string;
}

export interface ReconciliationRow {
  user: { id: string; firstName: string; lastName: string };
  scheduledMinutes: number;
  workedMinutes: number;
  missionsCount: number;
  pendingCount: number;
  rejectedCount: number;
  status: "OK" | "ANOMALY";
}

// Au-delà de cette marge, un écart entre heures planifiées et heures
// pointées est considéré réel plutôt qu'un simple arrondi de pointage.
const RECONCILIATION_TOLERANCE_MINUTES = 15;

// Vue de rapprochement (typiquement hebdomadaire) pointage <-> mission, pour
// que la RH — et le superviseur/la direction/l'admin sur toute l'entreprise,
// le chef d'équipe sur son équipe — repèrent d'un coup d'œil qui a un
// écart à examiner plutôt que de reconstituer chaque dossier à la main.
// Vert (OK) : les heures pointées correspondent aux missions planifiées et
// tout ce qui a été pointé a été traité par un validateur. Rouge (ANOMALY) :
// quelque chose reste à trancher — un pointage refusé, un pointage encore en
// attente, ou moins d'heures pointées que prévu ("un trou"). Des heures
// pointées EN PLUS ("un trop") mais déjà validées ne déclenchent PAS
// l'alerte : un validateur les a déjà examinées et acceptées, c'est du
// travail normalement payé — voir `attachOvertimeInfo` pour ce détail
// affiché côté pointage individuel.
export async function getReconciliation(actor: Actor, filters: ReconciliationFilters): Promise<ReconciliationRow[]> {
  if (!canViewReconciliation(actor)) throw ApiError.forbidden();

  const userIds = await resolveReconciliationUserIds(actor);
  if (userIds.length === 0) return [];

  const dayStart = new Date(`${filters.from}T00:00:00`);
  const dayEnd = new Date(`${filters.to}T23:59:59`);

  const [assignments, entries, users] = await Promise.all([
    prisma.missionAssignment.findMany({
      where: {
        userId: { in: userIds },
        mission: { status: { not: MissionStatus.CANCELLED }, date: { gte: dayStart, lte: dayEnd } },
      },
      select: { userId: true, mission: { select: { startTime: true, endTime: true } } },
    }),
    prisma.timeEntry.findMany({
      where: { userId: { in: userIds }, clockIn: { gte: dayStart, lte: dayEnd } },
      select: { userId: true, clockIn: true, clockOut: true, status: true },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }),
  ]);

  const rows = new Map<string, ReconciliationRow>();
  for (const u of users) {
    rows.set(u.id, { user: u, scheduledMinutes: 0, workedMinutes: 0, missionsCount: 0, pendingCount: 0, rejectedCount: 0, status: "OK" });
  }

  for (const a of assignments) {
    const row = rows.get(a.userId);
    if (!row) continue;
    row.scheduledMinutes += (a.mission.endTime.getTime() - a.mission.startTime.getTime()) / 60000;
    row.missionsCount += 1;
  }

  for (const e of entries) {
    const row = rows.get(e.userId);
    if (!row || e.clockOut === null) continue; // pointage en cours : ni compté, ni jugé pour l'instant
    if (e.status === TimeEntryStatus.REJECTED) {
      // Un pointage refusé n'a jamais été reconnu comme du temps travaillé —
      // corrigé : il gonflait auparavant `workedMinutes`, donnant à la RH un
      // total d'heures faux avant même d'ouvrir le détail de l'écart.
      row.rejectedCount += 1;
      continue;
    }
    row.workedMinutes += (e.clockOut.getTime() - e.clockIn.getTime()) / 60000;
    if (e.status === TimeEntryStatus.PENDING) row.pendingCount += 1;
  }

  for (const row of rows.values()) {
    const shortfall = row.scheduledMinutes - row.workedMinutes > RECONCILIATION_TOLERANCE_MINUTES;
    row.status = row.rejectedCount > 0 || row.pendingCount > 0 || shortfall ? "ANOMALY" : "OK";
    // Arrondi APRÈS le calcul du statut (qui doit rester précis face à la
    // tolérance de 15 min) — sans ça, l'écran de rapprochement affichait des
    // minutes brutes du type "1.4558833333333334 min" (précision à la seconde
    // d'un pointage réel), jamais un cas limite isolé : vérifié en testant
    // l'écran en conditions réelles, pas seulement en lisant le code.
    row.workedMinutes = Math.round(row.workedMinutes);
    row.scheduledMinutes = Math.round(row.scheduledMinutes);
  }

  return Array.from(rows.values())
    .filter((r) => r.missionsCount > 0 || r.workedMinutes > 0)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "ANOMALY" ? -1 : 1));
}

export interface ReconciliationMissionEntry {
  mission: { id: string; title: string; date: Date; startTime: Date; endTime: Date; site: { name: string } };
  scheduledMinutes: number;
  matchedEntries: Array<{
    id: string;
    clockIn: Date;
    clockOut: Date | null;
    status: TimeEntryStatus;
    isRetroactive: boolean;
    validatedBy: { id: string; firstName: string; lastName: string } | null;
  }>;
  workedMinutes: number;
  gapMinutes: number;
}

// Détail par mission pour comprendre un écart signalé par `getReconciliation` :
// même rapprochement par créneau horaire que
// `missions.service.getMissionTimeEntries`, mais organisé du point de vue de
// LA PERSONNE plutôt que de la mission — pour répondre à "pourquoi cet
// écart, un trou ou un trop" sans avoir à rouvrir chaque mission une par une.
export async function getReconciliationDetail(actor: Actor, targetUserId: string, filters: ReconciliationFilters) {
  const allowed =
    actor.userId === targetUserId ||
    GLOBAL_VALIDATE_ROLES.includes(actor.role) ||
    (actor.role === Role.SITE_MANAGER && (await isTeamMemberOf(actor.userId, targetUserId)));
  if (!allowed) throw ApiError.notFound("Utilisateur introuvable.");

  const user = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, firstName: true, lastName: true } });
  if (!user) throw ApiError.notFound("Utilisateur introuvable.");

  const dayStart = new Date(`${filters.from}T00:00:00`);
  const dayEnd = new Date(`${filters.to}T23:59:59`);

  const [assignments, entries] = await Promise.all([
    prisma.missionAssignment.findMany({
      where: { userId: targetUserId, mission: { status: { not: MissionStatus.CANCELLED }, date: { gte: dayStart, lte: dayEnd } } },
      select: {
        mission: { select: { id: true, title: true, date: true, startTime: true, endTime: true, site: { select: { name: true } } } },
      },
      orderBy: { mission: { startTime: "asc" } },
    }),
    prisma.timeEntry.findMany({
      where: { userId: targetUserId, clockIn: { gte: dayStart, lte: dayEnd } },
      select: {
        id: true,
        clockIn: true,
        clockOut: true,
        status: true,
        isRetroactive: true,
        validatedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { clockIn: "asc" },
    }),
  ]);

  // Anomalie confirmée par test réel (audit stats/réconciliation, 2026-09-23) :
  // avec un employé affecté à DEUX missions le même jour proches dans le temps
  // (ex. 07:00–08:30 puis 09:30–11:00, moins de 6h d'écart), un unique pointage
  // tombant dans le CRÉNEAU LIBRE entre les deux (ex. 08:45–09:15, qui ne
  // recouvre le temps réel d'AUCUNE des deux missions) se retrouvait compté en
  // intégralité dans `matchedEntries`/`workedMinutes` des DEUX missions à la
  // fois — un pointage de 30 min affichait 30 min "travaillées" sur la mission
  // A ET 30 min sur la mission B (60 min au total), alors que `totals.workedMinutes`
  // (calculé séparément, à partir des pointages bruts) restait, lui, correct.
  // Cause : chaque mission filtrait les pointages indépendamment sur sa seule
  // fenêtre tamponnée (±MISSION_TIME_ENTRY_BUFFER_MS = 3h), sans jamais
  // vérifier qu'un même pointage n'était pas déjà retenu par une mission
  // voisine — avec un tampon aussi large, deux missions à moins de 6h
  // d'intervalle (courant : matin/après-midi) ont des fenêtres qui se
  // chevauchent. Corrigé en rattachant chaque pointage à UNE SEULE mission au
  // maximum : celle dont il recouvre le plus le créneau RÉEL (non tamponné) ;
  // à défaut de recouvrement (pointage dans un "trou" entre deux missions),
  // celle dont il est temporellement le plus proche. Le tampon continue de
  // servir à décider QUELLES missions sont candidates (arrivée en avance,
  // départ tardif), seule l'exclusivité de l'attribution finale change.
  function bufferedWindow(mission: { startTime: Date; endTime: Date }) {
    return {
      windowStart: new Date(mission.startTime.getTime() - MISSION_TIME_ENTRY_BUFFER_MS),
      windowEnd: new Date(mission.endTime.getTime() + MISSION_TIME_ENTRY_BUFFER_MS),
    };
  }
  function overlapMinutes(entry: (typeof entries)[number], mission: { startTime: Date; endTime: Date }): number {
    const entryEnd = entry.clockOut ?? new Date();
    const start = Math.max(entry.clockIn.getTime(), mission.startTime.getTime());
    const end = Math.min(entryEnd.getTime(), mission.endTime.getTime());
    return Math.max(0, end - start) / 60000;
  }
  function distanceMinutes(entry: (typeof entries)[number], mission: { startTime: Date; endTime: Date }): number {
    const entryEnd = entry.clockOut ?? new Date();
    if (entryEnd.getTime() < mission.startTime.getTime()) return (mission.startTime.getTime() - entryEnd.getTime()) / 60000;
    if (entry.clockIn.getTime() > mission.endTime.getTime()) return (entry.clockIn.getTime() - mission.endTime.getTime()) / 60000;
    return 0;
  }

  const missionsList = assignments.map((a) => a.mission);
  const entryToMission = new Map<string, string>(); // entryId -> missionId (au plus une)
  const usedEntryIds = new Set<string>();
  for (const entry of entries) {
    const candidates = missionsList.filter((mission) => {
      const { windowStart, windowEnd } = bufferedWindow(mission);
      return entry.clockIn <= windowEnd && (entry.clockOut === null || entry.clockOut >= windowStart);
    });
    if (candidates.length === 0) continue;
    usedEntryIds.add(entry.id);
    // Meilleur candidat : recouvrement réel maximal, puis distance minimale en cas
    // d'égalité (notamment quand aucune mission ne recouvre réellement le pointage).
    let best = candidates[0]!;
    let bestOverlap = overlapMinutes(entry, best);
    let bestDistance = distanceMinutes(entry, best);
    for (const candidate of candidates.slice(1)) {
      const candidateOverlap = overlapMinutes(entry, candidate);
      const candidateDistance = distanceMinutes(entry, candidate);
      if (candidateOverlap > bestOverlap || (candidateOverlap === bestOverlap && candidateDistance < bestDistance)) {
        best = candidate;
        bestOverlap = candidateOverlap;
        bestDistance = candidateDistance;
      }
    }
    entryToMission.set(entry.id, best.id);
  }

  const missions: ReconciliationMissionEntry[] = assignments.map(({ mission }) => {
    const matched = entries.filter((e) => entryToMission.get(e.id) === mission.id);

    const scheduledMinutes = (mission.endTime.getTime() - mission.startTime.getTime()) / 60000;
    // Un pointage refusé reste visible dans `matchedEntries` (avec son statut,
    // pour le contexte) mais ne compte pas comme du temps travaillé dans le
    // total — même règle que `getReconciliation`, pour que les deux écrans
    // affichent un chiffre cohérent pour la même personne.
    const workedMinutes = matched.reduce(
      (sum, e) => sum + (e.clockOut && e.status !== TimeEntryStatus.REJECTED ? (e.clockOut.getTime() - e.clockIn.getTime()) / 60000 : 0),
      0
    );

    // Arrondi seulement au moment de construire la réponse — `gapMinutes`
    // reste calculé sur les valeurs précises (cohérent avec `getReconciliation`
    // ci-dessus), même bug corrigé qu'au-dessus : sans arrondi, cet écran
    // affichait aussi des minutes brutes à rallonge (précision seconde d'un
    // vrai pointage).
    return {
      mission,
      scheduledMinutes: Math.round(scheduledMinutes),
      matchedEntries: matched,
      workedMinutes: Math.round(workedMinutes),
      gapMinutes: Math.round(workedMinutes - scheduledMinutes),
    };
  });

  const unmatchedEntries = entries.filter((e) => !usedEntryIds.has(e.id));

  return {
    user,
    missions,
    unmatchedEntries,
    totals: {
      scheduledMinutes: Math.round(missions.reduce((s, m) => s + m.scheduledMinutes, 0)),
      workedMinutes: Math.round(
        entries.reduce(
          (s, e) => s + (e.clockOut && e.status !== TimeEntryStatus.REJECTED ? (e.clockOut.getTime() - e.clockIn.getTime()) / 60000 : 0),
          0
        )
      ),
    },
  };
}
