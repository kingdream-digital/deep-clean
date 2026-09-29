import { Role } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { ApiError } from "../../utils/ApiError";

export interface Actor {
  userId: string;
  role: Role;
}

// Niveau complet — retour explicite du client (cahier des charges module
// commercial, §2) : "La RH doit avoir les MÊMES DROITS que le Directeur".
// ADMIN inclus par cohérence avec le reste de l'application (rôle technique
// utilisé partout comme niveau de contrôle maximal), même si le cahier des
// charges ne mentionne que Directeur/RH.
export const COMMERCIAL_FULL_ROLES: Role[] = [Role.DIRECTOR, Role.HR, Role.ADMIN];
// Rôles ayant accès au module commercial — le Superviseur y a accès mais
// restreint à ses propres prospects/devis (voir isOwnRecord ci-dessous).
export const COMMERCIAL_ROLES: Role[] = [Role.SUPERVISOR, ...COMMERCIAL_FULL_ROLES];

export function isOwnRecord(actor: Actor, record: { assignedUserId?: string | null; createdById: string }): boolean {
  return actor.role === Role.SUPERVISOR && (record.assignedUserId === actor.userId || record.createdById === actor.userId);
}

// Un superviseur ne peut s'assigner (un prospect, un devis) qu'à
// lui-même — seuls RH/Direction/Admin peuvent choisir un autre commercial
// responsable (cahier des charges §3 : "le Directeur/RH puisse contrôler les
// accès du Superviseur si nécessaire").
export async function resolveAssignedUserId(actor: Actor, requested: string | null | undefined): Promise<string | null> {
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
