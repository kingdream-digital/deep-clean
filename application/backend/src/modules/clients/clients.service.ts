import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { escapeLikePattern } from "../../utils/likePattern";

interface Actor {
  userId: string;
  role: Role;
}

const COMMERCIAL_FULL_ROLES: Role[] = [Role.DIRECTOR, Role.HR, Role.ADMIN];
export const COMMERCIAL_ROLES: Role[] = [Role.SUPERVISOR, ...COMMERCIAL_FULL_ROLES];

const clientSelect = {
  id: true,
  companyName: true,
  contactFirstName: true,
  contactLastName: true,
  jobTitle: true,
  phone: true,
  email: true,
  billingAddress: true,
  postalCode: true,
  city: true,
  siret: true,
  notes: true,
  prospectId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClientSelect;

async function findClientOrThrow(id: string) {
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) throw ApiError.notFound("Client introuvable.");
  return client;
}

// Un client, une fois créé, sert de référentiel partagé pour tous les
// commerciaux (choisir un client pour un devis, par exemple) — la
// consultation est donc ouverte à tout le module commercial. Seule la
// MODIFICATION de la fiche reste restreinte : RH/Direction/Admin partout,
// un Superviseur seulement sur les clients qu'il a lui-même créés (cahier
// des charges §3 : "le Directeur/RH puisse contrôler les accès du
// Superviseur si nécessaire").
function assertCanManageClient(actor: Actor, client: { createdById: string }): void {
  if (COMMERCIAL_FULL_ROLES.includes(actor.role)) return;
  if (actor.role === Role.SUPERVISOR && client.createdById === actor.userId) return;
  throw ApiError.forbidden();
}

interface ClientInput {
  companyName: string;
  contactFirstName?: string;
  contactLastName?: string;
  jobTitle?: string;
  phone?: string;
  email?: string;
  billingAddress?: string;
  postalCode?: string;
  city?: string;
  siret?: string;
  notes?: string;
}

export async function createClient(actor: Actor, input: ClientInput) {
  const client = await prisma.client.create({ data: { ...input, createdById: actor.userId }, select: clientSelect });
  await logActivity({ userId: actor.userId, action: "CLIENT_CREATED", entityType: "Client", entityId: client.id });
  return client;
}

interface ListClientsFilters {
  search?: string;
  page: number;
  pageSize: number;
}

export async function listClients(_actor: Actor, filters: ListClientsFilters) {
  const where: Prisma.ClientWhereInput = filters.search
    ? {
        OR: [
          { companyName: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
          { contactLastName: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
          { email: { contains: escapeLikePattern(filters.search), mode: "insensitive" } },
        ],
      }
    : {};

  const [items, total] = await Promise.all([
    prisma.client.findMany({
      where,
      select: clientSelect,
      orderBy: { companyName: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.client.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

// Consultation ouverte à tout le module commercial (voir assertCanManageClient
// ci-dessus) — pas de portée à appliquer ici, juste l'existence de la fiche.
export async function getClientById(_actor: Actor, id: string) {
  const client = await prisma.client.findUnique({ where: { id }, select: clientSelect });
  if (!client) throw ApiError.notFound("Client introuvable.");
  return client;
}

export async function updateClient(actor: Actor, id: string, input: Partial<ClientInput>) {
  const existing = await findClientOrThrow(id);
  assertCanManageClient(actor, existing);

  const updated = await prisma.client.update({ where: { id }, data: input, select: clientSelect });
  await logActivity({
    userId: actor.userId,
    action: "CLIENT_UPDATED",
    entityType: "Client",
    entityId: id,
    metadata: input as Record<string, unknown>,
  });
  return updated;
}
