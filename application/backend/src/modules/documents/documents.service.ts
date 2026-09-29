import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";
import { logActivity } from "../../utils/activityLog";
import { deleteStoredFile, storePdfDocument } from "../../utils/storage";

interface Actor {
  userId: string;
  role: Role;
}

// Déposer/retirer un document dans l'espace d'un collaborateur reste réservé
// à la RH (seule autorisée à gérer les comptes) et à la direction/l'admin —
// même portée que la gestion des comptes eux-mêmes (users.service.ts),
// jamais le chef d'équipe/superviseur : un contrat ou un document RH n'a
// rien à voir avec l'encadrement du planning.
const MANAGE_ROLES: Role[] = [Role.HR, Role.DIRECTOR, Role.ADMIN];

function assertCanManage(actor: Actor): void {
  if (!MANAGE_ROLES.includes(actor.role)) throw ApiError.forbidden();
}

// Un employé consulte toujours son propre espace ; la RH/direction/admin
// consultent celui de n'importe qui, pour le gérer.
function assertCanView(actor: Actor, targetUserId: string): void {
  if (actor.userId === targetUserId) return;
  if (!MANAGE_ROLES.includes(actor.role)) throw ApiError.forbidden();
}

const documentSelect = {
  id: true,
  userId: true,
  title: true,
  fileName: true,
  sizeBytes: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
} as const;

async function findUserOrThrow(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.badRequest("Utilisateur introuvable.");
  return user;
}

// Retour explicite du client : un espace document "pour tout le monde",
// simple liste par personne (contrat, avenant, attestation...) — jamais de
// notion de dossier/catégorie à gérer en plus.
export async function uploadDocument(
  actor: Actor,
  targetUserId: string,
  title: string,
  fileBuffer: Buffer,
  originalName: string
) {
  assertCanManage(actor);
  await findUserOrThrow(targetUserId);

  const stored = await storePdfDocument(fileBuffer);

  try {
    const document = await prisma.employeeDocument.create({
      data: {
        userId: targetUserId,
        title,
        storageKey: stored.storageKey,
        fileName: originalName.slice(0, 255),
        sizeBytes: stored.sizeBytes,
        uploadedById: actor.userId,
      },
      select: documentSelect,
    });

    await logActivity({
      userId: actor.userId,
      action: "EMPLOYEE_DOCUMENT_UPLOADED",
      entityType: "EmployeeDocument",
      entityId: document.id,
      metadata: { targetUserId, title },
    });

    return document;
  } catch (err) {
    // Le fichier a été écrit sur disque par storePdfDocument() avant l'échec
    // de la création en base — jamais laisser de fichier orphelin (même
    // raisonnement que standards.service.ts::attachStandardDocument).
    await deleteStoredFile(stored.storageKey);
    throw err;
  }
}

export async function listDocuments(actor: Actor, targetUserId: string) {
  assertCanView(actor, targetUserId);

  return prisma.employeeDocument.findMany({
    where: { userId: targetUserId },
    select: documentSelect,
    orderBy: { createdAt: "desc" },
  });
}

async function findDocumentOrThrow(id: string) {
  const document = await prisma.employeeDocument.findUnique({ where: { id } });
  if (!document) throw ApiError.notFound("Document introuvable.");
  return document;
}

// Jamais d'URL publique, comme tout autre fichier de l'application — servi
// uniquement via une route authentifiée qui revérifie la permission.
export async function getDocumentFile(actor: Actor, id: string) {
  const document = await findDocumentOrThrow(id);
  assertCanView(actor, document.userId);

  return { storageKey: document.storageKey, fileName: document.fileName };
}

export async function deleteDocument(actor: Actor, id: string) {
  assertCanManage(actor);
  const document = await findDocumentOrThrow(id);

  await prisma.employeeDocument.delete({ where: { id } });
  await logActivity({
    userId: actor.userId,
    action: "EMPLOYEE_DOCUMENT_DELETED",
    entityType: "EmployeeDocument",
    entityId: id,
    metadata: { targetUserId: document.userId, title: document.title },
  });

  await deleteStoredFile(document.storageKey);
}
