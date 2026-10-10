/** Tons visuels communs (l'app associe une couleur accessible à chacun). */
export type Tone = "neutral" | "info" | "accent" | "success" | "warning" | "danger";

export const QUOTE_STATUSES = ["DRAFT", "SENT", "ACCEPTED", "DECLINED", "EXPIRED", "CANCELLED"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<QuoteStatus, string> = {
  DRAFT: "Brouillon",
  SENT: "Envoyé",
  ACCEPTED: "Accepté",
  DECLINED: "Refusé",
  EXPIRED: "Expiré",
  CANCELLED: "Annulé",
};
export const QUOTE_STATUS_TONES: Record<QuoteStatus, Tone> = {
  DRAFT: "neutral",
  SENT: "info",
  ACCEPTED: "success",
  DECLINED: "danger",
  EXPIRED: "warning",
  CANCELLED: "neutral",
};

export const INVOICE_KINDS = ["INVOICE", "CREDIT_NOTE"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_STATUSES = ["DRAFT", "ISSUED", "SENT", "PARTIALLY_PAID", "PAID", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  DRAFT: "Brouillon",
  ISSUED: "Émise",
  SENT: "Envoyée",
  PARTIALLY_PAID: "Partiellement payée",
  PAID: "Payée",
  CANCELLED: "Annulée",
};
export const INVOICE_STATUS_TONES: Record<InvoiceStatus, Tone> = {
  DRAFT: "neutral",
  ISSUED: "accent",
  SENT: "info",
  PARTIALLY_PAID: "warning",
  PAID: "success",
  CANCELLED: "neutral",
};
/** Statuts d'une facture qui attend encore un paiement. */
export const INVOICE_OPEN_STATUSES: readonly InvoiceStatus[] = ["ISSUED", "SENT", "PARTIALLY_PAID"];

export const PAYMENT_METHODS = ["TRANSFER", "CARD", "CHECK", "CASH", "DIRECT_DEBIT", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  TRANSFER: "Virement",
  CARD: "Carte bancaire",
  CHECK: "Chèque",
  CASH: "Espèces",
  DIRECT_DEBIT: "Prélèvement",
  OTHER: "Autre",
};

export const MISSION_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE", "VALIDATED", "CANCELLED"] as const;
export type MissionStatus = (typeof MISSION_STATUSES)[number];
export const MISSION_STATUS_LABELS: Record<MissionStatus, string> = {
  PLANNED: "Planifiée",
  IN_PROGRESS: "En cours",
  DONE: "Terminée",
  VALIDATED: "Validée",
  CANCELLED: "Annulée",
};
export const MISSION_STATUS_TONES: Record<MissionStatus, Tone> = {
  PLANNED: "info",
  IN_PROGRESS: "accent",
  DONE: "success",
  VALIDATED: "success",
  CANCELLED: "neutral",
};

export const EMAIL_STATUSES = ["QUEUED", "SENT", "FAILED"] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

export const VAT_REGIMES = ["NORMAL", "FRANCHISE"] as const;
export type VatRegime = (typeof VAT_REGIMES)[number];
export const VAT_REGIME_LABELS: Record<VatRegime, string> = {
  NORMAL: "Assujetti à la TVA",
  FRANCHISE: "Franchise en base (TVA non applicable, art. 293 B du CGI)",
};

export const CLIENT_KINDS = ["COMPANY", "INDIVIDUAL"] as const;
export type ClientKind = (typeof CLIENT_KINDS)[number];
export const CLIENT_KIND_LABELS: Record<ClientKind, string> = {
  COMPANY: "Professionnel",
  INDIVIDUAL: "Particulier",
};
