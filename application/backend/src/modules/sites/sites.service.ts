import { QuoteStatus, Role, SiteBillingMode } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { geocodeAddress } from "../../utils/geocoding";
import { deleteStoredImage, storeImage } from "../../utils/storage";

interface Actor {
  userId: string;
  role: Role;
}

const MANAGE_ROLES: Role[] = [Role.SUPERVISOR, Role.HR, Role.DIRECTOR, Role.ADMIN];

const siteSelect = {
  id: true,
  name: true,
  address: true,
  description: true,
  isActive: true,
  managerId: true,
  manager: { select: { id: true, firstName: true, lastName: true, email: true } },
  supervisorId: true,
  supervisor: { select: { id: true, firstName: true, lastName: true, email: true } },
  photoKey: true,
  latitude: true,
  longitude: true,
  // Lien commercial optionnel (§19-21) — voir createSite().
  clientId: true,
  client: { select: { id: true, companyName: true } },
  quoteId: true,
  quote: { select: { id: true, quoteNumber: true } },
  createdAt: true,
  updatedAt: true,
} as const;

// Retire `photoKey` (jamais exposé tel quel, même principe que
// `Announcement.coverPhotoKey`) au profit d'un simple booléen — le client
// récupère la photo via la route authentifiée dédiée (GET /:id/photo/file).
function presentSite<T extends { photoKey: string | null }>(site: T): Omit<T, "photoKey"> & { hasPhoto: boolean } {
  const { photoKey, ...rest } = site;
  return { ...rest, hasPhoto: Boolean(photoKey) };
}

async function findSiteOrThrow(id: string) {
  const site = await prisma.site.findUnique({ where: { id } });
  if (!site) throw ApiError.notFound("Chantier introuvable.");
  return site;
}

function isOwningManager(actor: Actor, site: { managerId: string | null }): boolean {
  return actor.role === Role.SITE_MANAGER && site.managerId === actor.userId;
}

// Modifier la fiche du chantier (nom, adresse, description, responsable,
// statut) est désormais réservé au superviseur/RH/direction/admin — retour
// explicite du client : le chef d'équipe n'y touche plus, même la
// description (avant, seul champ qui lui restait ouvert).
async function assertCanManage(actor: Actor): Promise<void> {
  if (MANAGE_ROLES.includes(actor.role)) return;
  throw ApiError.forbidden();
}

// Composer son équipe (ajouter/retirer un membre) reste une action de
// terrain que le chef d'équipe propriétaire garde sur son propre
// chantier — distincte de la modification de la fiche chantier elle-même.
async function assertCanManageTeam(actor: Actor, site: { managerId: string | null }): Promise<void> {
  if (MANAGE_ROLES.includes(actor.role) || isOwningManager(actor, site)) return;
  throw ApiError.forbidden();
}

// 404 (jamais 403) hors périmètre, pour ne pas révéler l'existence du
// chantier — même convention que missions/pointages/notifications/problèmes
// (incohérence corrigée : cette fonction renvoyait auparavant un 403, seul
// point du code à laisser fuiter cette information).
async function assertCanView(actor: Actor, siteId: string, site: { managerId: string | null }): Promise<void> {
  if (MANAGE_ROLES.includes(actor.role) || isOwningManager(actor, site)) return;
  if (actor.role === Role.EMPLOYEE) {
    const membership = await prisma.siteMember.findUnique({
      where: { siteId_userId: { siteId, userId: actor.userId } },
    });
    if (membership) return;
  }
  throw ApiError.notFound("Chantier introuvable.");
}

async function assertValidManager(managerId: string): Promise<void> {
  const manager = await prisma.user.findUnique({ where: { id: managerId } });
  if (!manager || manager.role !== Role.SITE_MANAGER) {
    throw ApiError.badRequest("Le responsable désigné doit être un chef d'équipe.");
  }
  if (!manager.isActive) {
    throw ApiError.badRequest("Le responsable désigné a un compte désactivé.");
  }
}

// Superviseur du chantier — retour explicite du client : un interlocuteur
// fixe pour ce chantier, distinct du chef d'équipe qui peut varier d'un jour
// à l'autre (voir `Site.supervisorId` dans schema.prisma). Même principe de
// validation que le chef d'équipe : doit être un compte actif au rôle
// Superviseur.
async function assertValidSupervisor(supervisorId: string): Promise<void> {
  const supervisor = await prisma.user.findUnique({ where: { id: supervisorId } });
  if (!supervisor || supervisor.role !== Role.SUPERVISOR) {
    throw ApiError.badRequest("Le superviseur désigné doit avoir le rôle Superviseur.");
  }
  if (!supervisor.isActive) {
    throw ApiError.badRequest("Le superviseur désigné a un compte désactivé.");
  }
}

// Un devis ne peut servir de base qu'une seule fois (une fois accepté, en
// plus) — retour explicite du cahier des charges §19 : "Créer un chantier à
// partir du devis" est une action humaine ponctuelle, jamais automatique.
async function assertValidQuoteForSite(quoteId: string, clientId: string | undefined): Promise<void> {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, include: { site: true } });
  if (!quote) throw ApiError.badRequest("Devis introuvable.");
  if (quote.status !== QuoteStatus.ACCEPTED) {
    throw ApiError.badRequest("Seul un devis accepté peut servir de base à un chantier.");
  }
  if (quote.site) {
    throw ApiError.conflict("Un chantier existe déjà pour ce devis.");
  }
  if (clientId && quote.clientId !== clientId) {
    throw ApiError.badRequest("Le client indiqué ne correspond pas au client du devis.");
  }
}

export async function createSite(
  actorId: string,
  input: {
    name: string;
    address: string;
    description?: string;
    managerId?: string;
    supervisorId?: string;
    clientId?: string;
    quoteId?: string;
  }
) {
  if (input.managerId) await assertValidManager(input.managerId);
  if (input.supervisorId) await assertValidSupervisor(input.supervisorId);
  if (input.clientId) {
    const client = await prisma.client.findUnique({ where: { id: input.clientId } });
    if (!client) throw ApiError.badRequest("Client introuvable.");
  }
  if (input.quoteId) await assertValidQuoteForSite(input.quoteId, input.clientId);

  // Position GPS déduite automatiquement de l'adresse tapée (retour explicite
  // du client : il tape l'adresse à la main, jamais de capture GPS manuelle
  // sur place) — best-effort, ne bloque jamais la création si l'adresse n'est
  // pas reconnue (voir utils/geocoding.ts) : le chantier est alors créé sans
  // position, et la vérification de distance des pointages ne s'applique
  // simplement pas pour lui.
  const position = await geocodeAddress(input.address);

  const site = await prisma.site.create({
    data: { ...input, latitude: position?.latitude, longitude: position?.longitude },
    select: siteSelect,
  });
  await logActivity({ userId: actorId, action: "SITE_CREATED", entityType: "Site", entityId: site.id, metadata: { quoteId: input.quoteId, clientId: input.clientId } });
  return presentSite(site);
}

interface ListSitesFilters {
  isActive?: boolean;
  search?: string;
  page: number;
  pageSize: number;
}

// Bug corrigé (audit cas limites, recherche/filtrage) : Prisma traduit
// `contains` en LIKE/ILIKE côté Postgres SANS échapper les métacaractères `%`
// et `_` contenus dans la valeur elle-même — un `%` tapé par l'utilisateur
// n'est donc pas cherché comme un caractère littéral mais interprété comme le
// joker SQL "n'importe quelle séquence", ce qui fait matcher TOUS les
// chantiers au lieu d'aucun. Confirmé en conditions réelles sur le module
// users (même pattern `contains`, non corrigé ici : fichier hors périmètre,
// une autre session y travaille en parallèle — voir le rapport d'audit).
// Échapper `\`, `%` et `_` avant de les passer à `contains` les rend
// littéraux : Postgres utilise `\` comme caractère d'échappement par défaut
// pour LIKE/ILIKE, aucune clause ESCAPE supplémentaire n'est nécessaire.
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

export async function listSites(actor: Actor, filters: ListSitesFilters) {
  const scope =
    actor.role === Role.EMPLOYEE
      ? { members: { some: { userId: actor.userId } } }
      : actor.role === Role.SITE_MANAGER
        ? { managerId: actor.userId }
        : {};

  const where = {
    ...scope,
    ...(filters.isActive !== undefined ? { isActive: filters.isActive } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: escapeLikePattern(filters.search), mode: "insensitive" as const } },
            { address: { contains: escapeLikePattern(filters.search), mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.site.findMany({
      where,
      select: siteSelect,
      orderBy: { name: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.site.count({ where }),
  ]);

  return { items: items.map(presentSite), total, page: filters.page, pageSize: filters.pageSize };
}

export async function getSiteById(actor: Actor, id: string) {
  const site = await findSiteOrThrow(id);
  await assertCanView(actor, id, site);

  const [full, members] = await Promise.all([
    prisma.site.findUniqueOrThrow({ where: { id }, select: siteSelect }),
    prisma.siteMember.findMany({
      where: { siteId: id },
      select: { userId: true, joinedAt: true, user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } },
      orderBy: { joinedAt: "asc" },
    }),
  ]);

  return { ...presentSite(full), members: members.map((m) => ({ ...m.user, joinedAt: m.joinedAt })) };
}

interface UpdateSiteInput {
  name?: string;
  address?: string;
  description?: string | null;
  managerId?: string | null;
  supervisorId?: string | null;
  isActive?: boolean;
}

export async function updateSite(actor: Actor, id: string, input: UpdateSiteInput) {
  const existing = await findSiteOrThrow(id);
  await assertCanManage(actor);

  if (input.managerId) await assertValidManager(input.managerId);
  if (input.supervisorId) await assertValidSupervisor(input.supervisorId);

  // Ne re-géocode que si l'adresse change réellement — inutile de refaire
  // l'appel à chaque modification de la fiche (nom, description, statut...)
  // qui ne touche pas l'adresse.
  let geo: { latitude?: number | null; longitude?: number | null } = {};
  if (input.address && input.address !== existing.address) {
    const position = await geocodeAddress(input.address);
    geo = { latitude: position?.latitude ?? null, longitude: position?.longitude ?? null };
  }

  const updated = await prisma.site.update({ where: { id }, data: { ...input, ...geo }, select: siteSelect });
  await logActivity({ userId: actor.userId, action: "SITE_UPDATED", entityType: "Site", entityId: id, metadata: input as Record<string, unknown> });
  return presentSite(updated);
}

// Photo du chantier (retour explicite du client) — mêmes droits que le reste
// de la fiche chantier (assertCanManage) : le chef d'équipe n'y touche plus,
// au même titre que le nom, l'adresse ou la description depuis l'évolution
// "superviseur/RH/direction/admin gèrent seuls la fiche".
export async function setSitePhoto(actor: Actor, id: string, fileBuffer: Buffer) {
  const site = await findSiteOrThrow(id);
  await assertCanManage(actor);

  const stored = await storeImage(fileBuffer);

  let updated;
  try {
    updated = await prisma.site.update({ where: { id }, data: { photoKey: stored.storageKey }, select: siteSelect });
  } catch (err) {
    await deleteStoredImage(stored.storageKey);
    throw err;
  }

  if (site.photoKey) await deleteStoredImage(site.photoKey);

  await logActivity({ userId: actor.userId, action: "SITE_PHOTO_UPDATED", entityType: "Site", entityId: id });
  return presentSite(updated);
}

export async function removeSitePhoto(actor: Actor, id: string) {
  const site = await findSiteOrThrow(id);
  await assertCanManage(actor);
  if (!site.photoKey) throw ApiError.notFound("Aucune photo pour ce chantier.");

  const updated = await prisma.site.update({ where: { id }, data: { photoKey: null }, select: siteSelect });
  await deleteStoredImage(site.photoKey);
  await logActivity({ userId: actor.userId, action: "SITE_PHOTO_REMOVED", entityType: "Site", entityId: id });
  return presentSite(updated);
}

// Consultation ouverte à quiconque peut déjà voir la fiche du chantier
// elle-même (même règle que le reste de `getSiteById`) — une photo de
// chantier n'est pas une information plus sensible que le reste de la fiche.
export async function getSitePhotoFile(actor: Actor, id: string) {
  const site = await findSiteOrThrow(id);
  await assertCanView(actor, id, site);
  if (!site.photoKey) throw ApiError.notFound("Aucune photo pour ce chantier.");
  return { storageKey: site.photoKey };
}

export async function addSiteMember(actor: Actor, siteId: string, userId: string) {
  const site = await findSiteOrThrow(siteId);
  await assertCanManageTeam(actor, site);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("Utilisateur introuvable.");
  if (!user.isActive) throw ApiError.badRequest("Ce compte est désactivé.");

  const existing = await prisma.siteMember.findUnique({ where: { siteId_userId: { siteId, userId } } });
  if (existing) throw ApiError.conflict("Cet utilisateur fait déjà partie de l'équipe du chantier.");

  await prisma.siteMember.create({ data: { siteId, userId } });
  await logActivity({ userId: actor.userId, action: "SITE_MEMBER_ADDED", entityType: "Site", entityId: siteId, metadata: { userId } });
}

export async function removeSiteMember(actor: Actor, siteId: string, userId: string) {
  const site = await findSiteOrThrow(siteId);
  await assertCanManageTeam(actor, site);

  await prisma.siteMember.deleteMany({ where: { siteId, userId } });
  await logActivity({ userId: actor.userId, action: "SITE_MEMBER_REMOVED", entityType: "Site", entityId: siteId, metadata: { userId } });
}

// ---------------------------------------------------------------------------
// Objectifs et suivi mensuel (cahier des charges module commercial, §22-24 et
// §28) — l'objectif est saisi MANUELLEMENT par le responsable ; le "réalisé"
// n'est JAMAIS stocké séparément : il est recalculé à la volée depuis les
// missions réelles du chantier, pour ne jamais désynchroniser prévision et
// réalisation (§34). Rien ici ne crée ni ne modifie de mission.
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function parsePeriod(period: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = period.split("-");
  const start = new Date(Number(yearStr), Number(monthStr) - 1, 1);
  const end = new Date(Number(yearStr), Number(monthStr), 1);
  return { start, end };
}

interface SiteTargetInput {
  period: string;
  plannedVisits: number;
  plannedHours?: number;
  plannedAmount?: number;
  billingMode?: SiteBillingMode;
}

// Même droits que la modification de la fiche chantier (assertCanManage) —
// définir l'objectif du mois est une décision de gestion, pas une action de
// terrain (contrairement à la composition d'équipe, voir assertCanManageTeam).
export async function upsertSiteTarget(actor: Actor, siteId: string, input: SiteTargetInput) {
  await findSiteOrThrow(siteId);
  await assertCanManage(actor);

  const target = await prisma.siteTarget.upsert({
    where: { siteId_period: { siteId, period: input.period } },
    create: {
      siteId,
      period: input.period,
      plannedVisits: input.plannedVisits,
      plannedHours: input.plannedHours,
      plannedAmount: input.plannedAmount,
      billingMode: input.billingMode ?? SiteBillingMode.FLAT_RATE,
      createdById: actor.userId,
    },
    update: {
      plannedVisits: input.plannedVisits,
      plannedHours: input.plannedHours,
      plannedAmount: input.plannedAmount,
      ...(input.billingMode ? { billingMode: input.billingMode } : {}),
    },
  });
  await logActivity({ userId: actor.userId, action: "SITE_TARGET_SET", entityType: "Site", entityId: siteId, metadata: { ...input } });
  return target;
}

export async function listSiteTargets(actor: Actor, siteId: string) {
  const site = await findSiteOrThrow(siteId);
  await assertCanView(actor, siteId, site);
  return prisma.siteTarget.findMany({ where: { siteId }, orderBy: { period: "desc" } });
}

export interface SiteProgress {
  period: string;
  target: { plannedVisits: number; plannedHours: number | null; plannedAmount: number | null; billingMode: SiteBillingMode } | null;
  scheduledVisits: number;
  completedVisits: number;
  cancelledVisits: number;
  remainingVisits: number | null;
  plannedHours: number;
  actualHours: number;
}

// Suivi mensuel (§23/§34) — tout est recalculé en direct depuis les missions
// réelles du chantier : jamais une valeur stockée qui pourrait dériver.
// `actualHours` reste un INDICATEUR (pointages validés des employés affectés,
// le même jour calendaire qu'une mission du chantier) : pour un rapprochement
// pointage ↔ mission précis, voir "Pointage vs mission" (Reconciliation).
export async function getSiteProgress(actor: Actor, siteId: string, period: string): Promise<SiteProgress> {
  const site = await findSiteOrThrow(siteId);
  await assertCanView(actor, siteId, site);

  const [target, missions] = await Promise.all([
    prisma.siteTarget.findUnique({ where: { siteId_period: { siteId, period } } }),
    (async () => {
      const { start, end } = parsePeriod(period);
      return prisma.mission.findMany({
        where: { siteId, date: { gte: start, lt: end } },
        select: { status: true, date: true, startTime: true, endTime: true, assignments: { select: { userId: true } } },
      });
    })(),
  ]);

  const active = missions.filter((m) => m.status !== "CANCELLED");
  const completedVisits = missions.filter((m) => m.status === "COMPLETED").length;
  const cancelledVisits = missions.filter((m) => m.status === "CANCELLED").length;
  const plannedHours = active.reduce((sum, m) => sum + (m.endTime.getTime() - m.startTime.getTime()) / 3_600_000, 0);

  const involvedUserIds = [...new Set(active.flatMap((m) => m.assignments.map((a) => a.userId)))];
  const missionDayKeys = new Set(active.map((m) => m.date.toISOString().slice(0, 10)));
  let actualHours = 0;
  if (involvedUserIds.length > 0) {
    const { start, end } = parsePeriod(period);
    const entries = await prisma.timeEntry.findMany({
      where: { userId: { in: involvedUserIds }, status: "VALIDATED", clockOut: { not: null }, clockIn: { gte: start, lt: end } },
      select: { clockIn: true, clockOut: true },
    });
    for (const entry of entries) {
      if (entry.clockOut && missionDayKeys.has(entry.clockIn.toISOString().slice(0, 10))) {
        actualHours += (entry.clockOut.getTime() - entry.clockIn.getTime()) / 3_600_000;
      }
    }
  }

  return {
    period,
    target: target
      ? { plannedVisits: target.plannedVisits, plannedHours: target.plannedHours, plannedAmount: target.plannedAmount, billingMode: target.billingMode }
      : null,
    scheduledVisits: active.length,
    completedVisits,
    cancelledVisits,
    remainingVisits: target ? Math.max(0, target.plannedVisits - completedVisits) : null,
    plannedHours: round1(plannedHours),
    actualHours: round1(actualHours),
  };
}
