import { Prisma, ProspectStatus, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { escapeLikePattern } from "../../utils/likePattern";

interface Actor {
  userId: string;
  role: Role;
}

// Niveau complet — retour explicite du client (cahier des charges module
// commercial, §2) : "La RH doit avoir les MÊMES DROITS que le Directeur".
// ADMIN inclus par cohérence avec le reste de l'application (rôle technique
// utilisé partout comme niveau de contrôle maximal), même si le cahier des
// charges ne mentionne que Directeur/RH.
const COMMERCIAL_FULL_ROLES: Role[] = [Role.DIRECTOR, Role.HR, Role.ADMIN];
// Rôles ayant accès au module commercial — le Superviseur y a accès mais
// restreint à ses propres prospects (voir assertCanView/assertCanManage).
export const COMMERCIAL_ROLES: Role[] = [Role.SUPERVISOR, ...COMMERCIAL_FULL_ROLES];

const userSummarySelect = { id: true, firstName: true, lastName: true, email: true, role: true } as const;

const prospectSelect = {
  id: true,
  companyName: true,
  contactFirstName: true,
  contactLastName: true,
  jobTitle: true,
  phone: true,
  email: true,
  address: true,
  postalCode: true,
  city: true,
  siret: true,
  source: true,
  need: true,
  serviceType: true,
  notes: true,
  status: true,
  nextFollowUpAt: true,
  assignedUserId: true,
  assignedUser: { select: userSummarySelect },
  createdById: true,
  createdBy: { select: userSummarySelect },
  createdAt: true,
  updatedAt: true,
  client: { select: { id: true } },
} satisfies Prisma.ProspectSelect;

type ProspectRow = Prisma.ProspectGetPayload<{ select: typeof prospectSelect }>;

function presentProspect(prospect: ProspectRow) {
  const { client, ...rest } = prospect;
  return { ...rest, hasClient: Boolean(client) };
}

async function findProspectOrThrow(id: string) {
  const prospect = await prisma.prospect.findUnique({ where: { id } });
  if (!prospect) throw ApiError.notFound("Prospect introuvable.");
  return prospect;
}

function isOwnProspect(actor: Actor, prospect: { assignedUserId: string | null; createdById: string }): boolean {
  return actor.role === Role.SUPERVISOR && (prospect.assignedUserId === actor.userId || prospect.createdById === actor.userId);
}

// Consultation et gestion partagent la même portée pour un prospect : un
// superviseur ne voit et ne gère que "ses" prospects (assignés à lui, ou
// créés par lui s'ils ne sont pas encore assignés) — RH/Direction/Admin
// voient et gèrent tout (cahier des charges §2-3).
function assertCanAccessProspect(actor: Actor, prospect: { assignedUserId: string | null; createdById: string }): void {
  if (COMMERCIAL_FULL_ROLES.includes(actor.role) || isOwnProspect(actor, prospect)) return;
  throw ApiError.notFound("Prospect introuvable.");
}

// Un superviseur ne peut s'assigner un prospect qu'à lui-même — seuls
// RH/Direction/Admin peuvent choisir un autre commercial responsable
// (cahier des charges §3 : "le Directeur/RH puisse contrôler les accès du
// Superviseur si nécessaire").
async function resolveAssignedUserId(actor: Actor, requested: string | null | undefined): Promise<string | null> {
  if (actor.role === Role.SUPERVISOR) return actor.userId;
  if (requested === undefined) return actor.userId;
  if (requested === null) return null;

  const user = await prisma.user.findUnique({ where: { id: requested } });
  if (!user || !COMMERCIAL_ROLES.includes(user.role)) {
    throw ApiError.badRequest("Le commercial assigné doit être Superviseur, RH ou Direction.");
  }
  if (!user.isActive) {
    throw ApiError.badRequest("Le commercial assigné a un compte désactivé.");
  }
  return requested;
}

interface ProspectInput {
  companyName: string;
  contactFirstName?: string;
  contactLastName?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  siret?: string;
  source?: string;
  need?: string;
  serviceType?: string;
  notes?: string;
  status?: ProspectStatus;
  nextFollowUpAt?: Date;
  assignedUserId?: string | null;
}

export async function createProspect(actor: Actor, input: ProspectInput) {
  const assignedUserId = await resolveAssignedUserId(actor, input.assignedUserId);

  const prospect = await prisma.prospect.create({
    data: { ...input, assignedUserId, createdById: actor.userId },
    select: prospectSelect,
  });
  await logActivity({ userId: actor.userId, action: "PROSPECT_CREATED", entityType: "Prospect", entityId: prospect.id });
  return presentProspect(prospect);
}

interface ListProspectsFilters {
  status?: ProspectStatus;
  search?: string;
  assignedUserId?: string;
  page: number;
  pageSize: number;
}

export async function listProspects(actor: Actor, filters: ListProspectsFilters) {
  const scope = COMMERCIAL_FULL_ROLES.includes(actor.role)
    ? {}
    : { OR: [{ assignedUserId: actor.userId }, { createdById: actor.userId }] };

  const where: Prisma.ProspectWhereInput = {
    ...scope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assignedUserId ? { assignedUserId: filters.assignedUserId } : {}),
    ...(filters.search
      ? {
          OR: [
            { companyName: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
            { contactLastName: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
            { email: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.prospect.findMany({
      where,
      select: prospectSelect,
      orderBy: { updatedAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.prospect.count({ where }),
  ]);

  return { items: items.map(presentProspect), total, page: filters.page, pageSize: filters.pageSize };
}

export async function getProspectById(actor: Actor, id: string) {
  const existing = await findProspectOrThrow(id);
  assertCanAccessProspect(actor, existing);
  const prospect = await prisma.prospect.findUniqueOrThrow({ where: { id }, select: prospectSelect });
  return presentProspect(prospect);
}

type UpdateProspectInput = Omit<Partial<ProspectInput>, "nextFollowUpAt"> & {
  nextFollowUpAt?: Date | null;
};

export async function updateProspect(actor: Actor, id: string, input: UpdateProspectInput) {
  const existing = await findProspectOrThrow(id);
  assertCanAccessProspect(actor, existing);

  // Un superviseur ne peut jamais réassigner un prospect à quelqu'un
  // d'autre (ni à lui-même explicitement, déjà le cas) — seul RH/Direction/
  // Admin en a le droit.
  const data: Prisma.ProspectUncheckedUpdateInput = { ...input };
  if ("assignedUserId" in input) {
    if (actor.role === Role.SUPERVISOR) {
      delete data.assignedUserId;
    } else if (input.assignedUserId) {
      await resolveAssignedUserId(actor, input.assignedUserId);
      data.assignedUserId = input.assignedUserId;
    }
  }

  const updated = await prisma.prospect.update({ where: { id }, data, select: prospectSelect });
  await logActivity({
    userId: actor.userId,
    action: "PROSPECT_UPDATED",
    entityType: "Prospect",
    entityId: id,
    metadata: input as Record<string, unknown>,
  });
  return presentProspect(updated);
}

// "Transformer en client" (cahier des charges §7) : ne recrée jamais les
// informations à la main, reprend telles quelles les coordonnées déjà
// saisies sur la fiche prospect. Purement humain/manuel — ne crée ni devis,
// ni chantier, ni mission.
export async function convertProspectToClient(actor: Actor, id: string) {
  const existing = await findProspectOrThrow(id);
  assertCanAccessProspect(actor, existing);

  const alreadyClient = await prisma.client.findUnique({ where: { prospectId: id } });
  if (alreadyClient) throw ApiError.conflict("Ce prospect a déjà été transformé en client.");

  const [client] = await prisma.$transaction([
    prisma.client.create({
      data: {
        companyName: existing.companyName,
        contactFirstName: existing.contactFirstName,
        contactLastName: existing.contactLastName,
        jobTitle: existing.jobTitle,
        phone: existing.phone,
        email: existing.email,
        billingAddress: existing.address,
        postalCode: existing.postalCode,
        city: existing.city,
        siret: existing.siret,
        notes: existing.notes,
        prospectId: existing.id,
        createdById: actor.userId,
      },
    }),
    prisma.prospect.update({ where: { id }, data: { status: ProspectStatus.WON } }),
  ]);

  await logActivity({
    userId: actor.userId,
    action: "PROSPECT_CONVERTED_TO_CLIENT",
    entityType: "Prospect",
    entityId: id,
    metadata: { clientId: client.id },
  });
  await logActivity({ userId: actor.userId, action: "CLIENT_CREATED", entityType: "Client", entityId: client.id, metadata: { prospectId: id } });

  return client;
}
