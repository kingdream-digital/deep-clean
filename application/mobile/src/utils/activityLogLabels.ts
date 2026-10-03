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
  ABSENCE_CANCELLED: "Absence annulée",
  LEAVE_ADJUSTMENT: "Solde de congés ajusté",
  LEAVE_ACCRUAL_VALIDATED: "Congés acquis validés",
  LEAVE_ACCRUAL_CORRECTED: "Congés acquis corrigés",
  ANNOUNCEMENT_POSTED: "Actualité publiée",
  ANNOUNCEMENT_DELETED: "Actualité supprimée",
  CONVERSATION_GROUP_CREATED: "Groupe de discussion créé",
  CONVERSATION_LEFT: "Départ d'un groupe",
  CONVERSATION_PARTICIPANTS_ADDED: "Participants ajoutés au groupe",
  CONVERSATION_PARTICIPANT_REMOVED: "Participant retiré du groupe",
  CONVERSATION_RENAMED: "Groupe renommé",
  EMPLOYEE_DOCUMENT_UPLOADED: "Document salarié ajouté",
  EMPLOYEE_DOCUMENT_DELETED: "Document salarié supprimé",
  EMPLOYEE_DOSSIER_EXPORTED: "Dossier salarié exporté",
  MISSION_REASSIGNED: "Mission réaffectée",
  MISSION_STATUS_CANCELLED: "Mission annulée",
  MISSION_STANDARD_DOCUMENT_ATTACHED: "Document joint à la mission",
  MISSION_STANDARD_DOCUMENT_REMOVED: "Document retiré de la mission",
  STANDARD_DOCUMENT_ATTACHED: "Document joint au standard",
  STANDARD_DOCUMENT_REMOVED: "Document retiré du standard",
  SITE_PHOTO_UPDATED: "Photo du chantier modifiée",
  SITE_PHOTO_REMOVED: "Photo du chantier supprimée",
  SITE_TARGET_SET: "Objectif du chantier défini",
  PROSPECT_CREATED: "Prospect créé",
  PROSPECT_UPDATED: "Prospect modifié",
  PROSPECT_CONVERTED_TO_CLIENT: "Prospect transformé en client",
  CLIENT_CREATED: "Client créé",
  CLIENT_UPDATED: "Client modifié",
  QUOTE_CREATED: "Devis créé",
  QUOTE_UPDATED: "Devis modifié",
  QUOTE_SUBMITTED_FOR_VALIDATION: "Devis soumis à validation",
  QUOTE_VALIDATED: "Devis validé",
  QUOTE_SENT: "Devis envoyé",
  QUOTE_ACCEPTED: "Devis accepté",
  QUOTE_REJECTED: "Devis refusé",
  QUOTE_EXPIRED: "Devis expiré",
  QUOTE_FOLLOW_UP: "Relance du devis",
  QUOTE_NEW_VERSION: "Nouvelle version du devis",
  INVOICE_CREATED: "Facture créée",
  INVOICE_UPDATED: "Facture modifiée",
  INVOICE_VALIDATED: "Facture validée",
  INVOICE_SENT: "Facture envoyée",
  INVOICE_PAID: "Facture payée",
  INVOICE_CANCELLED: "Facture annulée",
};

/** Libellé du type d'élément concerné par une action du journal. */
export const ENTITY_LABELS: Record<string, string> = {
  User: "Compte",
  Site: "Chantier",
  Mission: "Mission",
  Problem: "Signalement",
  TimeEntry: "Pointage",
  Absence: "Absence",
  CleaningStandard: "Standard",
  Announcement: "Actualité",
  Conversation: "Discussion",
  EmployeeDocument: "Document salarié",
  Message: "Message",
  Prospect: "Prospect",
  Client: "Client",
  Quote: "Devis",
  Invoice: "Facture",
};

/** « Compte · Marie Dupont » — type de l'élément suivi de son nom quand il est connu. */
export function formatEntity(entityType: string | null, entityLabel?: string | null): string {
  if (!entityType) return "—";
  const typeLabel = ENTITY_LABELS[entityType] ?? entityType;
  return entityLabel ? `${typeLabel} · ${entityLabel}` : typeLabel;
}

export function formatAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  // Fallback lisible pour toute action non listée ci-dessus : "USER_FOO_BAR" -> "User foo bar".
  const words = action.toLowerCase().split("_");
  return words.length > 0 ? words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1) + " " + words.slice(1).join(" ") : action;
}
