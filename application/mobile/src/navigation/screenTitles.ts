import type { Role } from "../api/auth.api";

// Le titre d'un écran reprend le libellé qui y mène dans le Menu : on ouvre
// « Mon équipe », on arrive sur « Mon équipe » — et non sur « Comptes », qui
// ne parle qu'à la RH. Source unique pour les piles de navigation, le Menu et
// la barre latérale web.

/** Annuaire / gestion des comptes : même écran, nommé selon ce qu'on y fait. */
export function usersListTitle(role: Role | undefined): string {
  if (role === "SUPERVISOR") return "Équipes";
  if (role === "SITE_MANAGER") return "Mon équipe";
  return "Comptes";
}

export function sitesListTitle(role: Role | undefined): string {
  return role === "SITE_MANAGER" ? "Mes chantiers" : "Chantiers";
}

/**
 * Ses propres absences, depuis « Moi » dans le Menu — même mot que le bouton
 * « Demander une absence » de l'écran, et assez court pour la barre latérale.
 */
export const MY_ABSENCES_TITLE = "Mes absences";

/** Les demandes de l'équipe à traiter (RH, superviseur, direction). */
export const ABSENCES_MANAGEMENT_TITLE = "Validation des congés";
