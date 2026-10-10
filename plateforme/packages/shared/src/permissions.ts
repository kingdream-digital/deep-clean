import type { Role } from "./roles";
import { ROLE_RANK } from "./roles";

/**
 * Matrice des permissions — source unique, lue par l'API (contrôle réel,
 * toujours côté serveur) et par l'app (uniquement pour ne pas afficher ce
 * qui serait refusé). Ne jamais ajouter de contrôle d'accès ailleurs qu'ici
 * sans le refléter dans cette table.
 */
const ALL: readonly Role[] = ["ADMIN", "DIRECTOR", "HR", "SUPERVISOR", "TEAM_LEAD", "EMPLOYEE"];
const MANAGEMENT: readonly Role[] = ["ADMIN", "DIRECTOR", "HR", "SUPERVISOR"];
const COMMERCIAL: readonly Role[] = ["ADMIN", "DIRECTOR", "HR", "SUPERVISOR"];
const BILLING: readonly Role[] = ["ADMIN", "DIRECTOR", "HR"];
const PLANNERS: readonly Role[] = ["ADMIN", "DIRECTOR", "SUPERVISOR"];
const FIELD: readonly Role[] = ["ADMIN", "DIRECTOR", "HR", "SUPERVISOR", "TEAM_LEAD"];

export const PERMISSIONS = {
  // Entreprise
  "org.read": ALL,
  "org.update": ["ADMIN"],

  // Comptes utilisateurs — seule la RH (et l'administrateur du compte)
  // crée des comptes : règle Deep Clean conservée.
  "users.read": MANAGEMENT,
  "users.create": ["ADMIN", "HR"],
  "users.update": ["ADMIN", "DIRECTOR", "HR"],
  "users.deactivate": ["ADMIN", "DIRECTOR", "HR"],
  "users.resetAccess": ["ADMIN", "DIRECTOR", "HR"],

  // Clients, lieux d'intervention, catalogue de prestations
  "clients.read": COMMERCIAL,
  "clients.write": COMMERCIAL,
  "sites.read": FIELD,
  "sites.write": PLANNERS,
  "catalog.read": COMMERCIAL,
  "catalog.write": ["ADMIN", "DIRECTOR"],

  // Devis
  "quotes.read": COMMERCIAL,
  "quotes.write": COMMERCIAL,
  "quotes.send": COMMERCIAL,

  // Factures et avoirs
  "invoices.read": BILLING,
  "invoices.write": BILLING,
  "invoices.issue": BILLING,
  "invoices.payments": BILLING,

  // Planning et missions
  "planning.readAll": MANAGEMENT,
  "planning.manage": PLANNERS,
  "missions.field": FIELD,

  // Pilotage
  "stats.read": ["ADMIN", "DIRECTOR"],
  "activity.read": ["ADMIN", "DIRECTOR", "HR"],

  // Assistant vocal / chat : ouvert à tous, mais chaque outil revérifie la
  // permission métier correspondante avant d'agir.
  "assistant.use": ALL,
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

/** Rôles qu'un utilisateur peut attribuer : jamais un rang supérieur au sien. */
export function assignableRoles(actor: Role): Role[] {
  return (Object.keys(ROLE_RANK) as Role[]).filter((r) => ROLE_RANK[r] <= ROLE_RANK[actor] && (actor === "ADMIN" || r !== "ADMIN"));
}

/** Un compte ne peut agir que sur un compte de rang strictement inférieur (sauf l'administrateur). */
export function canManageAccount(actor: Role, target: Role): boolean {
  if (actor === "ADMIN") return true;
  return ROLE_RANK[target] < ROLE_RANK[actor];
}
