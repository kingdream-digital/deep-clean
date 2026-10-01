import type { Role } from "../api/auth.api";

// Libellés des rôles affichés à l'utilisateur — source unique, pour qu'un
// renommage décidé par le client (« Chef de chantier » devenu « Chef
// d'équipe ») n'ait jamais à être répercuté écran par écran.
export const ROLE_LABELS: Record<Role, string> = {
  EMPLOYEE: "Employé",
  SITE_MANAGER: "Chef d'équipe",
  SUPERVISOR: "Superviseur",
  HR: "Ressources humaines",
  DIRECTOR: "Directeur",
  ADMIN: "Administrateur technique",
};

// Variante courte, là où la place manque (sous un nom dans une liste).
export const ROLE_LABELS_SHORT: Record<Role, string> = {
  ...ROLE_LABELS,
  HR: "RH",
  ADMIN: "Admin",
};

// Titres des groupes d'une liste de personnes rangée par rôle, dans l'ordre
// du terrain vers l'encadrement.
export const ROLE_GROUP_TITLES: Record<Role, string> = {
  EMPLOYEE: "Employés",
  SITE_MANAGER: "Chefs d'équipe",
  SUPERVISOR: "Superviseurs",
  HR: "Ressources humaines",
  DIRECTOR: "Direction",
  ADMIN: "Administration technique",
};

const ROLE_ORDER: Role[] = ["EMPLOYEE", "SITE_MANAGER", "SUPERVISOR", "HR", "DIRECTOR", "ADMIN"];

/**
 * Range des personnes par rôle (groupes vides omis), chaque groupe trié par
 * nom puis prénom — on retrouve quelqu'un comme dans un carnet d'adresses,
 * plutôt que dans l'ordre de création des comptes.
 */
export function groupByRole<T extends { role: Role; firstName: string; lastName: string }>(
  people: T[]
): { role: Role; title: string; people: T[] }[] {
  return ROLE_ORDER.map((role) => ({
    role,
    title: ROLE_GROUP_TITLES[role],
    people: people
      .filter((p) => p.role === role)
      .sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")),
  })).filter((group) => group.people.length > 0);
}
