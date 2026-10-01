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
