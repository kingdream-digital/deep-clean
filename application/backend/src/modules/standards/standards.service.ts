import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { deleteStoredFile, storePdfDocument } from "../../utils/storage";

interface Actor {
  userId: string;
  role: Role;
}

// Préparer/gérer les standards de nettoyage suit les mêmes droits que la
// gestion du planning (missions.service.ts, MISSION_MANAGE_ROLES) : le
// superviseur en premier lieu, puis RH/direction/admin.
const MANAGE_ROLES: Role[] = [Role.SUPERVISOR, Role.HR, Role.DIRECTOR, Role.ADMIN];

const standardSelect = {
  id: true,
  siteId: true,
  name: true,
  tasks: true,
  equipment: true,
  safetyInstructions: true,
  notes: true,
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
  updatedAt: true,
  // Métadonnées du document PDF exposées au client — jamais `documentKey`
  // (clé de stockage opaque, servie uniquement par la route dédiée ci-dessous).
  documentFileName: true,
  documentSizeBytes: true,
  documentUploadedAt: true,
  documentUploadedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

function assertCanManage(actor: Actor): void {
  if (!MANAGE_ROLES.includes(actor.role)) throw ApiError.forbidden();
}

async function findSiteOrThrow(siteId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId } });
  if (!site) throw ApiError.badRequest("Chantier introuvable.");
  return site;
}

async function findStandardOrThrow(id: string) {
  const standard = await prisma.cleaningStandard.findUnique({ where: { id }, select: standardSelect });
  if (!standard) throw ApiError.notFound("Standard introuvable.");
  return standard;
}

// FAILLE CORRIGÉE (audit sites/standards) : la lecture (list/get) n'appliquait
// AUCUN contrôle de portée par chantier — n'importe quel utilisateur
// authentifié (employé d'un autre chantier, chef d'équipe non concerné)
// pouvait lire les standards de N'IMPORTE QUEL chantier (consignes de
// sécurité, codes d'accès client, notes internes) en devinant/énumérant un
// siteId ou un id de standard, confirmé en conditions réelles contre la prod.
// Même règle d'accès que sites.service.ts::assertCanView (mêmes rôles
// habilités), et même convention 404 (jamais 403) pour ne pas révéler
// l'existence d'un chantier/standard hors périmètre.
async function assertCanAccessSite(actor: Actor, siteId: string, notFoundMessage: string): Promise<void> {
  if (MANAGE_ROLES.includes(actor.role)) return;

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { managerId: true } });
  if (!site) throw ApiError.notFound(notFoundMessage);

  if (actor.role === Role.SITE_MANAGER && site.managerId === actor.userId) return;

  if (actor.role === Role.EMPLOYEE) {
    const membership = await prisma.siteMember.findUnique({
      where: { siteId_userId: { siteId, userId: actor.userId } },
    });
    if (membership) return;
  }

  throw ApiError.notFound(notFoundMessage);
}

interface ListStandardsFilters {
  page: number;
  pageSize: number;
}

// BUG CORRIGE (audit standards) : pas de pagination alors que tous les
// autres listings du projet en ont une (voir sites.service.ts::listSites) —
// confirmé en conditions réelles, un chantier avec 32 standards renvoyait
// les 32 sans limite.
export async function listStandards(actor: Actor, siteId: string, filters: ListStandardsFilters) {
  await findSiteOrThrow(siteId);
  await assertCanAccessSite(actor, siteId, "Chantier introuvable.");

  const where = { siteId };
  const [items, total] = await Promise.all([
    prisma.cleaningStandard.findMany({
      where,
      select: standardSelect,
      orderBy: { name: "asc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.cleaningStandard.count({ where }),
  ]);

  return { items, total, page: filters.page, pageSize: filters.pageSize };
}

export async function getStandardById(actor: Actor, id: string) {
  const standard = await findStandardOrThrow(id);
  await assertCanAccessSite(actor, standard.siteId, "Standard introuvable.");
  return standard;
}

interface CreateStandardInput {
  siteId: string;
  name: string;
  tasks: string[];
  equipment: string[];
  safetyInstructions?: string;
  notes?: string;
}

export async function createStandard(actor: Actor, input: CreateStandardInput) {
  assertCanManage(actor);
  await findSiteOrThrow(input.siteId);

  const standard = await prisma.cleaningStandard.create({
    data: {
      siteId: input.siteId,
      name: input.name,
      tasks: input.tasks.map((t) => t.trim()).filter(Boolean),
      equipment: input.equipment.map((e) => e.trim()).filter(Boolean),
      safetyInstructions: input.safetyInstructions || null,
      notes: input.notes || null,
      createdById: actor.userId,
    },
    select: standardSelect,
  });

  await logActivity({ userId: actor.userId, action: "STANDARD_CREATED", entityType: "CleaningStandard", entityId: standard.id });
  return standard;
}

interface UpdateStandardInput {
  name?: string;
  tasks?: string[];
  equipment?: string[];
  safetyInstructions?: string | null;
  notes?: string | null;
}

export async function updateStandard(actor: Actor, id: string, input: UpdateStandardInput) {
  assertCanManage(actor);
  await findStandardOrThrow(id);

  const updated = await prisma.cleaningStandard.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.tasks !== undefined ? { tasks: input.tasks.map((t) => t.trim()).filter(Boolean) } : {}),
      ...(input.equipment !== undefined ? { equipment: input.equipment.map((e) => e.trim()).filter(Boolean) } : {}),
      ...(input.safetyInstructions !== undefined ? { safetyInstructions: input.safetyInstructions || null } : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
    },
    select: standardSelect,
  });

  await logActivity({ userId: actor.userId, action: "STANDARD_UPDATED", entityType: "CleaningStandard", entityId: id });
  return updated;
}

export async function deleteStandard(actor: Actor, id: string) {
  assertCanManage(actor);
  await findStandardOrThrow(id);

  // `documentKey` n'est jamais dans standardSelect : relu spécifiquement ici
  // pour ne pas laisser un fichier orphelin sur disque après suppression
  // (même raisonnement que attachStandardDocument ci-dessous).
  const current = await prisma.cleaningStandard.findUnique({ where: { id }, select: { documentKey: true } });

  await prisma.cleaningStandard.delete({ where: { id } });
  await logActivity({ userId: actor.userId, action: "STANDARD_DELETED", entityType: "CleaningStandard", entityId: id });

  if (current?.documentKey) {
    await deleteStoredFile(current.documentKey);
  }
}

// --- Document PDF déposé directement sur le standard ---
// Mêmes droits que la gestion du standard lui-même (assertCanManage) pour le
// dépôt/retrait ; la lecture/téléchargement suit la même portée que la
// consultation du standard (assertCanAccessSite), pas seulement la gestion —
// une équipe affectée à une mission basée sur ce standard doit pouvoir
// ouvrir le PDF, même raisonnement que missions.service.ts::getStandardDocumentFile.

export async function attachStandardDocument(actor: Actor, id: string, fileBuffer: Buffer, originalName: string) {
  assertCanManage(actor);
  await findStandardOrThrow(id);

  // `documentKey` n'est jamais dans standardSelect (jamais exposé au client) :
  // relu spécifiquement ici pour purger l'ancien fichier après un remplacement.
  const current = await prisma.cleaningStandard.findUnique({ where: { id }, select: { documentKey: true } });

  const stored = await storePdfDocument(fileBuffer);

  let updated;
  try {
    updated = await prisma.cleaningStandard.update({
      where: { id },
      data: {
        documentKey: stored.storageKey,
        documentFileName: originalName.slice(0, 255),
        documentSizeBytes: stored.sizeBytes,
        documentUploadedById: actor.userId,
        documentUploadedAt: new Date(),
      },
      select: standardSelect,
    });
  } catch (err) {
    // Le fichier a été écrit sur disque par storePdfDocument() avant l'échec
    // de la mise à jour en base — ne pas laisser de fichier orphelin (même
    // raisonnement que missions.service.ts::attachStandardDocument).
    await deleteStoredFile(stored.storageKey);
    throw err;
  }

  if (current?.documentKey) {
    await deleteStoredFile(current.documentKey);
  }

  await logActivity({
    userId: actor.userId,
    action: "STANDARD_DOCUMENT_ATTACHED",
    entityType: "CleaningStandard",
    entityId: id,
    metadata: { fileName: updated.documentFileName },
  });

  return updated;
}

export async function getStandardDocumentFile(actor: Actor, id: string) {
  const standard = await findStandardOrThrow(id);
  await assertCanAccessSite(actor, standard.siteId, "Standard introuvable.");

  const doc = await prisma.cleaningStandard.findUnique({
    where: { id },
    select: { documentKey: true, documentFileName: true },
  });
  if (!doc?.documentKey) throw ApiError.notFound("Document introuvable.");

  return { storageKey: doc.documentKey, fileName: doc.documentFileName ?? "standard.pdf" };
}

export async function removeStandardDocument(actor: Actor, id: string) {
  assertCanManage(actor);
  await findStandardOrThrow(id);

  const current = await prisma.cleaningStandard.findUnique({ where: { id }, select: { documentKey: true } });
  if (!current?.documentKey) throw ApiError.notFound("Document introuvable.");

  const updated = await prisma.cleaningStandard.update({
    where: { id },
    data: {
      documentKey: null,
      documentFileName: null,
      documentSizeBytes: null,
      documentUploadedById: null,
      documentUploadedAt: null,
    },
    select: standardSelect,
  });

  await deleteStoredFile(current.documentKey);

  await logActivity({ userId: actor.userId, action: "STANDARD_DOCUMENT_REMOVED", entityType: "CleaningStandard", entityId: id });

  return updated;
}
