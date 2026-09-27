import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";

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
  latitude: true,
  longitude: true,
  createdAt: true,
  updatedAt: true,
} as const;

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

export async function createSite(
  actorId: string,
  input: { name: string; address: string; description?: string; managerId?: string; latitude?: number; longitude?: number }
) {
  if (input.managerId) {
    const manager = await prisma.user.findUnique({ where: { id: input.managerId } });
    if (!manager || manager.role !== Role.SITE_MANAGER) {
      throw ApiError.badRequest("Le responsable désigné doit être un chef d'équipe.");
    }
    if (!manager.isActive) {
      throw ApiError.badRequest("Le responsable désigné a un compte désactivé.");
    }
  }

  const site = await prisma.site.create({ data: input, select: siteSelect });
  await logActivity({ userId: actorId, action: "SITE_CREATED", entityType: "Site", entityId: site.id });
  return site;
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

  return { items, total, page: filters.page, pageSize: filters.pageSize };
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

  return { ...full, members: members.map((m) => ({ ...m.user, joinedAt: m.joinedAt })) };
}

interface UpdateSiteInput {
  name?: string;
  address?: string;
  description?: string | null;
  managerId?: string | null;
  isActive?: boolean;
  latitude?: number | null;
  longitude?: number | null;
}

export async function updateSite(actor: Actor, id: string, input: UpdateSiteInput) {
  await findSiteOrThrow(id);
  await assertCanManage(actor);

  if (input.managerId) {
    const manager = await prisma.user.findUnique({ where: { id: input.managerId } });
    if (!manager || manager.role !== Role.SITE_MANAGER) {
      throw ApiError.badRequest("Le responsable désigné doit être un chef d'équipe.");
    }
    if (!manager.isActive) {
      throw ApiError.badRequest("Le responsable désigné a un compte désactivé.");
    }
  }

  const updated = await prisma.site.update({ where: { id }, data: input, select: siteSelect });
  await logActivity({ userId: actor.userId, action: "SITE_UPDATED", entityType: "Site", entityId: id, metadata: input as Record<string, unknown> });
  return updated;
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
