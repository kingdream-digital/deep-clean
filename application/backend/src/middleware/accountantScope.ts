// Compte « Comptable » (retour explicite du client) : un accès externe, en
// LECTURE, aux seules informations utiles à la paie et à l'administratif —
// heures et récapitulatifs de paie, absences et congés, dossiers et
// documents des salariés, factures — plus le dépôt des documents de paie
// (bulletins) dans l'espace de chaque salarié.
//
// Défense en profondeur : plusieurs modules accordent une vue globale à
// « tout rôle autre qu'employé ou chef d'équipe ». Plutôt que de compter sur
// chacun d'eux, toute requête d'un comptable est d'abord confrontée à cette
// liste blanche ; tout ce qui n'y figure pas est refusé (403), avant même
// d'atteindre le module concerné.
type Rule = [method: string, path: RegExp];

const ID = "[0-9a-fA-F-]{36}";

const ACCOUNTANT_ALLOWED: Rule[] = [
  // Session, mot de passe, profil, synchronisation.
  ["*", /^\/api\/v1\/auth\//],
  ["GET", /^\/api\/v1\/sync\/version$/],
  ["*", /^\/api\/v1\/notifications(\/|$)/],
  ["*", /^\/api\/v1\/users\/me\/avatar$/],
  // Salariés : annuaire, fiche, dossier (et son export PDF).
  ["GET", /^\/api\/v1\/users$/],
  ["GET", new RegExp(`^/api/v1/users/${ID}(/avatar/file|/dossier|/dossier/export\\.pdf)?$`)],
  // Heures : liste, exports, récapitulatif de paie, détail d'un pointage
  // (jamais les photos justificatives, inutiles à la paie).
  ["GET", /^\/api\/v1\/time-entries$/],
  ["GET", /^\/api\/v1\/time-entries\/(export|export\.xlsx|export\.pdf|pay-summary)$/],
  ["GET", new RegExp(`^/api/v1/time-entries/${ID}$`)],
  // Congés et absences.
  ["GET", /^\/api\/v1\/leave\/accruals$/],
  ["GET", new RegExp(`^/api/v1/leave/${ID}/(balance|transactions)$`)],
  ["GET", /^\/api\/v1\/absences$/],
  ["GET", new RegExp(`^/api/v1/absences/${ID}$`)],
  // Documents des salariés : consultation, et dépôt (bulletins de paie).
  ["GET", /^\/api\/v1\/documents\/me$/],
  ["GET", new RegExp(`^/api/v1/documents/(user/${ID}|${ID}/file)$`)],
  ["POST", /^\/api\/v1\/documents$/],
  // Factures (comptabilité).
  ["GET", /^\/api\/v1\/invoices$/],
  ["GET", new RegExp(`^/api/v1/invoices/${ID}(/pdf)?$`)],
  // Espace comptable (dossier de paie du mois).
  ["GET", /^\/api\/v1\/accounting\//],
];

export function isAllowedForAccountant(method: string, url: string): boolean {
  const path = url.split("?")[0]!.replace(/\/+$/, "") || "/";
  return ACCOUNTANT_ALLOWED.some(([m, re]) => (m === "*" || m === method.toUpperCase()) && re.test(path));
}
