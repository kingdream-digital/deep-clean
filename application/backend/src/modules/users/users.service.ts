import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { generateTemporaryPassword, hashPassword } from "../../utils/password";
import { generateUsername } from "../../utils/username";
import { logActivity } from "../../utils/activityLog";
import { deleteStoredImage, storeImage } from "../../utils/storage";

// Peut consulter le dossier complet d'un employé (pointages, absences,
// missions, journal) : la RH au premier chef, mais aussi direction/admin
// (mêmes rôles que `ACCOUNT_MANAGEMENT_ROLES` plus bas) et le superviseur,
// qui a déjà une visibilité globale sur les pointages/validations ailleurs
// dans l'application (voir timesheets.service.ts) — cohérent de la lui
// donner aussi ici plutôt que de l'exclure d'un écran de synthèse.
export const DOSSIER_VIEW_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN, Role.SUPERVISOR];

// `avatarKey` n'est jamais exposé tel quel au client (même principe que
// `documentKey` pour les standards PDF, voir standards.service.ts) — il est
// sélectionné ici puis transformé en simple booléen `hasAvatar` par
// `presentUser` avant de quitter le service ; le client récupère l'image via
// la route de fichier authentifiée GET /users/:id/avatar/file.
const publicSelect = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  isActive: true,
  mustChangePassword: true,
  lastLoginAt: true,
  avatarKey: true,
  createdAt: true,
  updatedAt: true,
} as const;

// Vue "annuaire" : de quoi contacter un collègue, sans exposer l'état de
// son compte. Utilisée pour tout appelant qui ne gère pas les comptes
// (employé, chef d'équipe, superviseur) — la RH/direction/admin, elles,
// voient les champs complets ci-dessus.
const contactSelect = {
  id: true,
  username: true,
  email: true,
  firstName: true,
  lastName: true,
  phone: true,
  role: true,
  avatarKey: true,
} as const;

const ACCOUNT_MANAGEMENT_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN];

function selectForViewer(viewerRole: Role) {
  return ACCOUNT_MANAGEMENT_ROLES.includes(viewerRole) ? publicSelect : contactSelect;
}

function presentUser<T extends { avatarKey?: string | null }>(user: T): Omit<T, "avatarKey"> & { hasAvatar: boolean } {
  const { avatarKey, ...rest } = user;
  return { ...rest, hasAvatar: Boolean(avatarKey) };
}

interface CreateUserInput {
  email?: string;
  firstName: string;
  lastName: string;
  phone?: string;
  role: Role;
}

// Rôles qu'un compte RH ne peut PAS attribuer, ni à la création ni à la
// modification : direction et administration technique sont hors de sa
// portée (faille corrigée — seule l'auto-élévation était bloquée jusqu'ici,
// rien n'empêchait la RH de nommer N'IMPORTE QUEL AUTRE compte Admin ou
// Directeur). Seul l'admin technique peut accorder ces deux rôles.
const HR_RESTRICTED_ROLES: Role[] = [Role.DIRECTOR, Role.ADMIN];

// Retour explicite du client : la direction gère désormais les comptes
// (modifier, activer, désactiver, réinitialiser l'accès — tout sauf en
// créer, voir users.routes.ts::CREATE_ACCOUNTS), au même titre que la RH.
// Elle reste néanmoins sans autorité sur le compte de l'admin technique :
// rôle de maintenance technique de l'application, hors de la hiérarchie
// métier — seul l'admin technique peut agir sur son propre rang.
const DIRECTOR_RESTRICTED_ROLES: Role[] = [Role.ADMIN];

function restrictedRolesFor(actorRole: Role): Role[] {
  if (actorRole === Role.HR) return HR_RESTRICTED_ROLES;
  if (actorRole === Role.DIRECTOR) return DIRECTOR_RESTRICTED_ROLES;
  return [];
}

function assertCanAssignRole(actorRole: Role, targetRole: Role): void {
  if (restrictedRolesFor(actorRole).includes(targetRole)) {
    throw ApiError.forbidden("Seul l'administrateur technique peut attribuer ce rôle.");
  }
}

// Faille corrigée (audit résilience des comptes à privilèges) : contrairement
// à la création/au changement de rôle (assertCanAssignRole ci-dessus), rien
// n'empêchait jusqu'ici la RH de désactiver ou réinitialiser l'accès d'un
// compte DIRECTOR ou ADMIN déjà existant — confirmé en conditions réelles.
// Même politique que pour l'attribution : ni la RH ni la direction n'ont
// autorité sur un compte de rang supérieur au leur, seul l'admin technique
// peut agir dessus.
function assertCanActOnTarget(actorRole: Role, targetRole: Role): void {
  if (restrictedRolesFor(actorRole).includes(targetRole)) {
    throw ApiError.forbidden("Seul l'administrateur technique peut gérer ce compte.");
  }
}

/**
 * Seule la RH (ou l'admin technique) peut créer un compte — jamais d'auto-inscription.
 * Un mot de passe temporaire est généré et renvoyé une seule fois à la RH, à charge
 * pour elle de le communiquer à l'utilisateur. Il n'est jamais stocké en clair.
 */
export async function createUser(actorId: string, actorRole: Role, input: CreateUserInput) {
  assertCanAssignRole(actorRole, input.role);

  // L'email reste optionnel (coordonnée de contact) mais, s'il est fourni,
  // doit rester unique — jamais utilisé pour la connexion (voir username
  // ci-dessous). L'identifiant de connexion, lui, est TOUJOURS généré par le
  // serveur : jamais fourni par la RH, jamais dérivé de l'email.
  if (input.email) {
    const existingEmail = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingEmail) {
      throw ApiError.conflict("Un compte existe déjà avec cet email.");
    }
  }

  const username = await generateUsername(input.firstName, input.lastName);
  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  const user = await prisma.user.create({
    data: {
      username,
      email: input.email || null,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: input.role,
      passwordHash,
      mustChangePassword: true,
      createdById: actorId,
    },
    select: publicSelect,
  });

  await logActivity({
    userId: actorId,
    action: "USER_CREATED",
    entityType: "User",
    entityId: user.id,
    metadata: { role: user.role },
  });

  return { user: presentUser(user), temporaryPassword };
}

interface ListUsersFilters {
  role?: Role;
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

export async function listUsers(viewerRole: Role, filters: ListUsersFilters) {
  const where = {
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.search
      ? {
          OR: [
            { username: { contains: filters.search, mode: "insensitive" as const } },
            { email: { contains: filters.search, mode: "insensitive" as const } },
            { firstName: { contains: filters.search, mode: "insensitive" as const } },
            { lastName: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: selectForViewer(viewerRole),
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return { items: items.map(presentUser), total, page: filters.page, pageSize: filters.pageSize };
}

// Variante interne (sélection complète, avatarKey compris) utilisée par les
// fonctions de mutation ci-dessous qui ont besoin du user complet en base
// avant de renvoyer une vue présentée au client.
async function getUserRecordById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: publicSelect });
  if (!user) {
    throw ApiError.notFound("Utilisateur introuvable.");
  }
  return user;
}

export async function getUserById(id: string) {
  return presentUser(await getUserRecordById(id));
}

// Variante "annuaire" de getUserById, utilisée par la route GET /:id : les
// champs renvoyés dépendent du rôle de l'appelant (voir selectForViewer).
export async function getUserForViewer(viewerRole: Role, id: string) {
  const user = await prisma.user.findUnique({ where: { id }, select: selectForViewer(viewerRole) });
  if (!user) {
    throw ApiError.notFound("Utilisateur introuvable.");
  }
  return presentUser(user);
}

interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  role?: Role;
  // Moteur de congés (retour explicite du client : "les règles d'acquisition
  // doivent être configurables") — réglables par salarié, null = valeur par
  // défaut de l'entreprise (voir leave.service.ts::computeAccrual).
  leaveAccrualRate?: number | null;
  leaveAccrualCap?: number | null;
}

// Détache un utilisateur de tous les chantiers dont il est responsable —
// appelé quand il n'est plus en mesure d'assumer ce rôle (désactivation, ou
// changement de rôle qui lui retire SITE_MANAGER). Sans ça, `site.managerId`
// restait orphelin : un chantier gardait comme responsable quelqu'un qui ne
// peut plus rien y faire, sans aucune alerte (bug corrigé). Le chantier
// reste actif — c'est à la RH/direction de lui assigner un nouveau
// responsable, ce détachement rend juste l'absence visible au lieu de la
// masquer derrière un ID qui pointe vers un compte inopérant.
async function detachAsSiteManager(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.site.updateMany({ where: { managerId: userId }, data: { managerId: null } });
}

export async function updateUser(actorId: string, actorRole: Role, targetId: string, input: UpdateUserInput) {
  const target = await getUserRecordById(targetId);

  // Empêche l'auto-élévation de privilèges : la RH peut attribuer des rôles à
  // n'importe qui d'autre, mais jamais modifier son propre rôle par cette
  // route (faille corrigée — rien n'empêchait auparavant un compte RH de se
  // nommer lui-même Directeur ou Admin d'un simple appel API).
  if (actorId === targetId && input.role !== undefined) {
    throw ApiError.badRequest("Vous ne pouvez pas modifier votre propre rôle.");
  }
  if (input.role !== undefined) {
    assertCanAssignRole(actorRole, input.role);
  }

  const losesManagerRole = input.role !== undefined && input.role !== Role.SITE_MANAGER && target.role === Role.SITE_MANAGER;

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: targetId }, data: input, select: publicSelect });
    if (losesManagerRole) {
      await detachAsSiteManager(tx, targetId);
    }
    return updated;
  });

  await logActivity({
    userId: actorId,
    action: "USER_UPDATED",
    entityType: "User",
    entityId: targetId,
    metadata: input as Record<string, unknown>,
  });

  return presentUser(user);
}

export async function setUserActive(actorId: string, actorRole: Role, targetId: string, isActive: boolean) {
  if (actorId === targetId && !isActive) {
    throw ApiError.badRequest("Vous ne pouvez pas désactiver votre propre compte.");
  }

  const target = await getUserRecordById(targetId);
  assertCanActOnTarget(actorRole, target.role);

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: targetId }, data: { isActive }, select: publicSelect });
    if (!isActive) {
      // Un compte désactivé perd immédiatement tout accès actif.
      await tx.session.updateMany({
        where: { userId: targetId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await detachAsSiteManager(tx, targetId);
    }
    return updated;
  });

  await logActivity({
    userId: actorId,
    action: isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
    entityType: "User",
    entityId: targetId,
  });

  return presentUser(user);
}

/**
 * Réinitialisation de l'accès par la RH, sans jamais connaître le mot de passe actuel :
 * un nouveau mot de passe temporaire est généré, l'utilisateur devra le changer à la
 * prochaine connexion, et toutes ses sessions actives sont invalidées par sécurité.
 */
export async function resetUserAccess(actorId: string, actorRole: Role, targetId: string) {
  const target = await getUserById(targetId);
  assertCanActOnTarget(actorRole, target.role);

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: targetId },
      data: { passwordHash, mustChangePassword: true },
    }),
    prisma.session.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  await logActivity({ userId: actorId, action: "USER_ACCESS_RESET", entityType: "User", entityId: targetId });

  return { temporaryPassword };
}

/**
 * Photo de profil — toujours facultative et gérée par l'utilisateur lui-même
 * (jamais par la RH) : il peut en ajouter une, la remplacer, ou la retirer
 * sans jamais se retrouver bloqué sans photo. `storeImage` s'occupe de la
 * compression et de la vérification réelle du contenu (voir utils/storage.ts).
 */
export async function setAvatar(actorId: string, fileBuffer: Buffer) {
  const stored = await storeImage(fileBuffer);

  const current = await prisma.user.findUnique({ where: { id: actorId }, select: { avatarKey: true } });

  const user = await prisma.user.update({
    where: { id: actorId },
    data: { avatarKey: stored.storageKey },
    select: publicSelect,
  });

  if (current?.avatarKey) {
    await deleteStoredImage(current.avatarKey);
  }

  return presentUser(user);
}

export async function removeAvatar(actorId: string) {
  const current = await prisma.user.findUnique({ where: { id: actorId }, select: { avatarKey: true } });
  if (!current?.avatarKey) throw ApiError.notFound("Aucune photo de profil à retirer.");

  const user = await prisma.user.update({
    where: { id: actorId },
    data: { avatarKey: null },
    select: publicSelect,
  });

  await deleteStoredImage(current.avatarKey);

  return presentUser(user);
}

// N'importe quel compte authentifié peut consulter la photo d'un collègue —
// même niveau d'exposition que les champs de `contactSelect` (nom, téléphone,
// rôle), pas une information sensible liée à la gestion du compte.
export async function getAvatarFile(targetId: string) {
  const user = await prisma.user.findUnique({ where: { id: targetId }, select: { avatarKey: true } });
  if (!user?.avatarKey) throw ApiError.notFound("Photo de profil introuvable.");
  return { storageKey: user.avatarKey, mimeType: "image/jpeg" };
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_ITEMS_LIMIT = 10;
// Fenêtre glissante pour les totaux de pointage (l'historique complet reste
// consultable via l'écran dédié "Dossiers d'heures") — un dossier employé est
// une synthèse récente, pas un remplacement de l'export complet pour la paie.
const TIMESHEET_TOTALS_WINDOW_DAYS = 30;

/**
 * Dossier employé — centralise pour la RH (et direction/admin/superviseur,
 * voir DOSSIER_VIEW_ROLES) ce qu'un employé a fait dans l'application :
 * pointages, absences, missions, journal d'activité. Réponse en LECTURE
 * seule : aucune mutation n'a lieu ici. La validation d'une absence
 * depuis la fiche employé (retour explicite du client : l'appui sur une
 * notification de demande d'absence doit amener sur la fiche de
 * l'employé pour décider) appelle le endpoint dédié absences.decide,
 * jamais dupliqué dans ce dossier.
 */
export async function getEmployeeDossier(actorRole: Role, targetId: string) {
  if (!DOSSIER_VIEW_ROLES.includes(actorRole)) throw ApiError.forbidden();

  const user = await getUserById(targetId);

  const timesheetWindowStart = new Date(Date.now() - TIMESHEET_TOTALS_WINDOW_DAYS * MS_PER_DAY);
  const yearStart = new Date(new Date().getFullYear(), 0, 1);

  const [recentTimeEntries, windowTimeEntries, recentAbsences, absencesThisYear, pendingAbsenceCount, recentMissions, missionCounts, recentActivity] =
    await Promise.all([
      prisma.timeEntry.findMany({
        where: { userId: targetId },
        orderBy: { clockIn: "desc" },
        take: RECENT_ITEMS_LIMIT,
        select: { id: true, clockIn: true, clockOut: true, status: true, isRetroactive: true, comment: true },
      }),
      prisma.timeEntry.findMany({
        where: { userId: targetId, clockIn: { gte: timesheetWindowStart } },
        select: { clockIn: true, clockOut: true, status: true },
      }),
      prisma.absence.findMany({
        where: { userId: targetId },
        orderBy: { startDate: "desc" },
        take: RECENT_ITEMS_LIMIT,
        select: { id: true, type: true, startDate: true, endDate: true, status: true, reason: true, decisionNote: true },
      }),
      prisma.absence.findMany({
        where: { userId: targetId, status: "APPROVED", startDate: { gte: yearStart } },
        select: { type: true, startDate: true, endDate: true },
      }),
      prisma.absence.count({ where: { userId: targetId, status: "PENDING" } }),
      prisma.missionAssignment.findMany({
        where: { userId: targetId },
        orderBy: { mission: { date: "desc" } },
        take: RECENT_ITEMS_LIMIT,
        select: {
          mission: { select: { id: true, title: true, date: true, endTime: true, status: true, site: { select: { id: true, name: true } } } },
        },
      }),
      prisma.missionAssignment
        .findMany({ where: { userId: targetId }, select: { mission: { select: { status: true } } } })
        .then((assignments) => ({
          completed: assignments.filter((a) => a.mission.status === "COMPLETED").length,
          upcoming: assignments.filter((a) => a.mission.status === "SCHEDULED" || a.mission.status === "IN_PROGRESS").length,
          cancelled: assignments.filter((a) => a.mission.status === "CANCELLED").length,
        })),
      prisma.activityLog.findMany({
        where: { userId: targetId },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
      }),
    ]);

  let validatedMinutes = 0;
  let pendingMinutes = 0;
  let rejectedMinutes = 0;
  for (const entry of windowTimeEntries) {
    if (!entry.clockOut) continue;
    const minutes = (entry.clockOut.getTime() - entry.clockIn.getTime()) / 60000;
    if (entry.status === "VALIDATED") validatedMinutes += minutes;
    else if (entry.status === "PENDING") pendingMinutes += minutes;
    else rejectedMinutes += minutes;
  }

  const absenceDaysByType: Record<string, number> = {};
  for (const absence of absencesThisYear) {
    const days = Math.round((absence.endDate.getTime() - absence.startDate.getTime()) / MS_PER_DAY);
    absenceDaysByType[absence.type] = (absenceDaysByType[absence.type] ?? 0) + days;
  }

  return {
    user,
    timesheet: {
      windowDays: TIMESHEET_TOTALS_WINDOW_DAYS,
      totals: {
        validatedMinutes: Math.round(validatedMinutes),
        pendingMinutes: Math.round(pendingMinutes),
        rejectedMinutes: Math.round(rejectedMinutes),
      },
      recent: recentTimeEntries,
    },
    absences: {
      approvedDaysThisYearByType: absenceDaysByType,
      pendingCount: pendingAbsenceCount,
      recent: recentAbsences,
    },
    missions: {
      totals: missionCounts,
      recent: recentMissions.map((a) => a.mission),
    },
    activity: recentActivity,
  };
}
