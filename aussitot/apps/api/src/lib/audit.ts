import type { Db } from "./db.ts";
import type { Ctx } from "./context.ts";
import type { Prisma } from "../generated/prisma/client.ts";

/**
 * Journal d'activité : qui a fait quoi, quand, sur quel élément. Écrit dans
 * la MÊME transaction que l'action elle-même (pas d'action sans trace, pas de
 * trace d'une action annulée). Le rôle de l'API ne peut ni modifier ni
 * effacer une ligne du journal (droits retirés dans la migration).
 */
export async function logActivity(
  tx: Db,
  ctx: Pick<Ctx, "userId" | "ip" | "viaAssistant"> | { userId: null; ip?: string; viaAssistant?: boolean },
  action: string,
  entity?: { type: string; id: string },
  metadata?: Prisma.InputJsonValue,
): Promise<void> {
  await tx.activityLog.create({
    data: {
      userId: ctx.userId,
      action,
      entityType: entity?.type ?? null,
      entityId: entity?.id ?? null,
      metadata: metadata ?? undefined,
      viaAssistant: ctx.viaAssistant ?? false,
      ipAddress: ctx.ip ?? null,
    },
  });
}

/** Libellés lisibles du journal (écran « Activité »). */
export const ACTIVITY_LABELS: Record<string, string> = {
  AUTH_LOGIN: "Connexion",
  AUTH_LOGIN_FAILED: "Échec de connexion",
  AUTH_LOGOUT: "Déconnexion",
  AUTH_PASSWORD_CHANGED: "Mot de passe modifié",
  AUTH_LOCKED: "Compte bloqué temporairement (trop d'échecs)",
  AUTH_REFRESH_REUSE: "Réutilisation suspecte d'une session — sessions révoquées",
  USER_CREATED: "Compte créé",
  USER_UPDATED: "Compte modifié",
  USER_DEACTIVATED: "Compte désactivé",
  USER_REACTIVATED: "Compte réactivé",
  USER_ACCESS_RESET: "Accès réinitialisé",
  ORG_UPDATED: "Réglages de l'entreprise modifiés",
  ORG_LOGO_UPDATED: "Logo de l'entreprise modifié",
  CLIENT_CREATED: "Client créé",
  CLIENT_UPDATED: "Client modifié",
  CLIENT_ARCHIVED: "Client archivé",
  SITE_CREATED: "Lieu d'intervention créé",
  SITE_UPDATED: "Lieu d'intervention modifié",
  CATALOG_CREATED: "Prestation ajoutée au catalogue",
  CATALOG_UPDATED: "Prestation modifiée",
  QUOTE_CREATED: "Devis créé",
  QUOTE_UPDATED: "Devis modifié",
  QUOTE_DELETED: "Brouillon de devis supprimé",
  QUOTE_SENT: "Devis envoyé au client",
  QUOTE_ACCEPTED: "Devis accepté",
  QUOTE_DECLINED: "Devis refusé",
  QUOTE_CANCELLED: "Devis annulé",
  INVOICE_CREATED: "Facture créée",
  INVOICE_UPDATED: "Facture modifiée",
  INVOICE_DELETED: "Brouillon de facture supprimé",
  INVOICE_ISSUED: "Facture émise",
  INVOICE_SENT: "Facture envoyée au client",
  INVOICE_REMINDER_SENT: "Relance envoyée",
  INVOICE_PAYMENT_RECORDED: "Paiement enregistré",
  CREDIT_NOTE_ISSUED: "Avoir émis",
  MISSION_CREATED: "Mission planifiée",
  MISSION_UPDATED: "Mission modifiée",
  MISSION_CANCELLED: "Mission annulée",
  MISSION_STARTED: "Mission démarrée",
  MISSION_FINISHED: "Mission terminée",
  MISSION_VALIDATED: "Mission validée",
  MISSION_INSTRUCTIONS_UPDATED: "Consigne de mission modifiée",
  ASSISTANT_ACTION_CONFIRMED: "Action de l'assistant confirmée",
  ASSISTANT_ACTION_CANCELLED: "Action de l'assistant annulée",
};

export function activityLabel(action: string): string {
  return ACTIVITY_LABELS[action] ?? action;
}
