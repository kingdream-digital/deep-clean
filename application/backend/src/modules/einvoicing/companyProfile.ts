import { env } from "../../config/env";

// Identité légale de l'entreprise émettrice (devis, factures, facture
// électronique), lue dans les variables d'environnement COMPANY_* — jamais
// codée en dur. Une valeur vide ("") compte comme absente.

function clean(value: string | undefined): string | undefined {
  const v = value?.trim();
  return v ? v : undefined;
}

export interface CompanyProfile {
  name: string;
  legalForm?: string;
  shareCapital?: string;
  addressLine?: string;
  postalCode?: string;
  city?: string;
  siren?: string;
  siret?: string;
  rcs?: string;
  vatNumber?: string;
  phone?: string;
  email?: string;
  iban?: string;
  bic?: string;
  vatOnDebits: boolean;
  paymentDays: number;
  latePenaltyText: string;
}

export function getCompanyProfile(): CompanyProfile {
  const siret = clean(env.COMPANY_SIRET)?.replace(/\s/g, "");
  return {
    name: clean(env.COMPANY_LEGAL_NAME) ?? "Deep Clean",
    legalForm: clean(env.COMPANY_LEGAL_FORM),
    shareCapital: clean(env.COMPANY_SHARE_CAPITAL),
    addressLine: clean(env.COMPANY_ADDRESS),
    postalCode: clean(env.COMPANY_POSTAL_CODE),
    city: clean(env.COMPANY_CITY),
    siren: clean(env.COMPANY_SIREN)?.replace(/\s/g, "") ?? (siret ? siret.slice(0, 9) : undefined),
    siret,
    rcs: clean(env.COMPANY_RCS),
    vatNumber: clean(env.COMPANY_VAT_NUMBER)?.replace(/\s/g, ""),
    phone: clean(env.COMPANY_PHONE),
    email: clean(env.COMPANY_EMAIL),
    iban: clean(env.COMPANY_IBAN)?.replace(/\s/g, ""),
    bic: clean(env.COMPANY_BIC)?.replace(/\s/g, ""),
    vatOnDebits: env.COMPANY_VAT_ON_DEBITS,
    paymentDays: env.INVOICE_PAYMENT_DAYS,
    latePenaltyText: env.INVOICE_LATE_PENALTY_TEXT,
  };
}

/** « SAS au capital de 10 000 € · RCS Paris 123 456 789 · SIRET … · TVA … » */
export function companyLegalLine(c: CompanyProfile = getCompanyProfile()): string {
  const identity = [c.name, c.legalForm ? `${c.legalForm}${c.shareCapital ? ` au capital de ${c.shareCapital}` : ""}` : undefined]
    .filter(Boolean)
    .join(", ");
  return [
    identity,
    [c.addressLine, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ") || undefined,
    c.rcs,
    c.siret ? `SIRET ${c.siret}` : c.siren ? `SIREN ${c.siren}` : undefined,
    c.vatNumber ? `TVA intracommunautaire ${c.vatNumber}` : undefined,
    c.phone,
    c.email,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** SIREN (9 chiffres) d'un client : saisi, sinon déduit de son SIRET. */
export function sirenOf(client: { siren?: string | null; siret?: string | null }): string | undefined {
  const siren = client.siren?.replace(/\s/g, "");
  if (siren && /^\d{9}$/.test(siren)) return siren;
  const siret = client.siret?.replace(/\s/g, "");
  if (siret && /^\d{14}$/.test(siret)) return siret.slice(0, 9);
  return undefined;
}

export interface StructuredAddress {
  line: string;
  postalCode?: string;
  city?: string;
}

/**
 * Découpe une adresse saisie d'un bloc (« 12 rue de la Paix, 75002 Paris »)
 * en rue / code postal / ville, comme l'exige le format structuré de la
 * facture électronique. Les champs connus séparément sont prioritaires.
 */
export function structuredAddress(text: string | null | undefined, known: { postalCode?: string | null; city?: string | null } = {}): StructuredAddress | null {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw && !known.postalCode && !known.city) return null;
  const match = raw.match(/^(.*?)[,\s]+(\d{5})\s+([^,]+?)(?:,\s*France)?$/i);
  if (match) {
    return { line: match[1]!.replace(/,\s*$/, "").trim(), postalCode: known.postalCode ?? match[2], city: known.city ?? match[3]!.trim() };
  }
  return { line: raw, postalCode: known.postalCode ?? undefined, city: known.city ?? undefined };
}

/** Pied de page des documents envoyés au client : nom et identifiant légal. */
export function companyFooterLine(c: CompanyProfile = getCompanyProfile()): string {
  return [c.name, c.siret ? `SIRET ${c.siret}` : c.siren ? `SIREN ${c.siren}` : undefined, c.vatNumber ? `TVA ${c.vatNumber}` : undefined].filter(Boolean).join(" · ");
}

/** Lignes du bloc « Émetteur » des devis et factures (identité légale complète). */
export function sellerBlockLines(c: CompanyProfile = getCompanyProfile()): string[] {
  return [
    c.name + (c.legalForm ? `, ${c.legalForm}${c.shareCapital ? ` au capital de ${c.shareCapital}` : ""}` : ""),
    c.addressLine,
    [c.postalCode, c.city].filter(Boolean).join(" ") || undefined,
    c.siret ? `SIRET ${c.siret}` : c.siren ? `SIREN ${c.siren}` : undefined,
    c.rcs,
    c.vatNumber ? `TVA intracommunautaire ${c.vatNumber}` : undefined,
    [c.phone, c.email].filter(Boolean).join(" · ") || undefined,
  ].filter(Boolean) as string[];
}
