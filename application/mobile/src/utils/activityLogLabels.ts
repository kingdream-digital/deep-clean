// Libellés français pour les codes d'action bruts du journal d'activité
// (voir tous les appels logActivity() côté backend). Une action non listée
// ici (nouveau module ajouté plus tard, par exemple) reste lisible grâce au
// fallback de formatAction() plutôt que d'afficher un code brut incongru.
const ACTION_LABELS: Record<string, string> = {
  AUTH_LOGIN_SUCCESS: "Connexion réussie",
  AUTH_LOGIN_FAILED: "Tentative de connexion échouée",
  AUTH_PASSWORD_CHANGED: "Mot de passe modifié",
  USER_CREATED: "Compte créé",
  USER_UPDATED: "Compte modifié",
  USER_ACTIVATED: "Compte activé",
  USER_DEACTIVATED: "Compte désactivé",
  USER_ACCESS_RESET: "Accès réinitialisé",
  SITE_CREATED: "Chantier créé",
  SITE_UPDATED: "Chantier modifié",
  SITE_MEMBER_ADDED: "Employé ajouté à l'équipe",
  SITE_MEMBER_REMOVED: "Employé retiré de l'équipe",
  MISSION_CREATED: "Mission créée",
  MISSION_UPDATED: "Mission modifiée",
  MISSION_CANCELLED: "Mission annulée",
  MISSION_ASSIGNMENTS_UPDATED: "Affectations modifiées",
  MISSION_VALIDATED: "Mission validée",
  MISSION_STATUS_IN_PROGRESS: "Mission démarrée",
  MISSION_STATUS_COMPLETED: "Mission terminée",
  JOB_SHEET_UPDATED: "Fiche de poste modifiée",
  STANDARD_CREATED: "Standard de nettoyage créé",
  STANDARD_UPDATED: "Standard de nettoyage modifié",
  STANDARD_DELETED: "Standard de nettoyage supprimé",
  PROBLEM_CREATED: "Signalement créé",
  PROBLEM_STATUS_CHANGED: "Statut du signalement modifié",
  PROBLEM_COMMENT_ADDED: "Commentaire ajouté au signalement",
  PROBLEM_PHOTO_ADDED: "Photo ajoutée au signalement",
  PROBLEM_PHOTO_DELETED: "Photo supprimée du signalement",
  TIME_ENTRY_CLOCK_IN: "Pointage d'arrivée",
  TIME_ENTRY_CLOCK_OUT: "Pointage de sortie",
  TIME_ENTRY_RETROACTIVE_CREATED: "Pointage différé saisi",
  TIME_ENTRY_CREATED_FOR_USER: "Pointage saisi pour un collaborateur",
  TIME_ENTRY_VALIDATED: "Pointage validé",
  TIME_ENTRY_REJECTED: "Pointage refusé",
  TIME_ENTRIES_EXPORTED: "Export des pointages",
  ABSENCE_CREATED: "Demande d'absence créée",
  ABSENCE_APPROVED: "Absence approuvée",
  ABSENCE_REJECTED: "Absence refusée",
  ABSENCE_MISSION_CONFLICT_DETECTED: "Conflit absence/mission détecté",
  MESSAGE_SENT: "Message envoyé",
};

export function formatAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback lisible pour toute action non listée ci-dessus : "USER_FOO_BAR" -> "User foo bar".
  const words = action.toLowerCase().split("_");
  return words.length > 0 ? words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1) + " " + words.slice(1).join(" ") : action;
}
