/**
 * Rôles d'un compte au sein d'UNE entreprise cliente (un même rôle n'a
 * jamais de droit sur une autre entreprise : l'isolation est assurée par la
 * base de données, voir apps/api/prisma/rls.sql).
 *
 * Repris de Deep Clean (employé, chef d'équipe, superviseur, RH, direction),
 * plus « Administrateur » : la personne qui a souscrit l'abonnement — dans une
 * TPE, c'est souvent le gérant, qui fait tout lui-même.
 */
export const ROLES = ["ADMIN", "DIRECTOR", "HR", "SUPERVISOR", "TEAM_LEAD", "EMPLOYEE"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrateur",
  DIRECTOR: "Direction",
  HR: "RH",
  SUPERVISOR: "Superviseur",
  TEAM_LEAD: "Chef d'équipe",
  EMPLOYEE: "Employé",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Tous les droits, y compris les réglages de l'entreprise et l'abonnement.",
  DIRECTOR: "Pilote toute l'activité. Ne crée pas de comptes.",
  HR: "Gère les comptes, l'équipe et la facturation.",
  SUPERVISOR: "Gère le planning, les clients et les devis.",
  TEAM_LEAD: "Encadre ses missions sur le terrain.",
  EMPLOYEE: "Consulte ses missions et signale les problèmes.",
};

/** Ordre hiérarchique : sert à empêcher d'agir sur un compte de rang supérieur. */
export const ROLE_RANK: Record<Role, number> = {
  ADMIN: 60,
  DIRECTOR: 50,
  HR: 40,
  SUPERVISOR: 30,
  TEAM_LEAD: 20,
  EMPLOYEE: 10,
};

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
