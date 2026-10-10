import type { Client, Organization } from "../../generated/prisma/client.ts";

/**
 * Coordonnées figées au moment de l'envoi (devis) ou de l'émission
 * (facture) : un document transmis au client ne change plus jamais, même si
 * la fiche client ou les réglages de l'entreprise sont modifiés ensuite.
 */
export interface ClientSnapshot {
  kind: "COMPANY" | "INDIVIDUAL";
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  addressLines: string[];
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
}

export interface SellerSnapshot {
  name: string;
  legalName: string | null;
  legalForm: string | null;
  shareCapital: string | null;
  siren: string | null;
  siret: string | null;
  vatNumber: string | null;
  rcs: string | null;
  addressLines: string[];
  email: string | null;
  phone: string | null;
  website: string | null;
  iban: string | null;
  bic: string | null;
  vatRegime: "NORMAL" | "FRANCHISE";
  latePenaltyText: string | null;
  paymentTermsDays: number;
  brandColor: string | null;
  logoKey: string | null;
}

function addressLines(a: {
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  city: string | null;
  country: string;
}): string[] {
  const cityLine = [a.postalCode, a.city].filter(Boolean).join(" ");
  return [a.addressLine1, a.addressLine2, cityLine, a.country !== "FR" ? a.country : null].filter((l): l is string =>
    Boolean(l && l.trim()),
  );
}

export function clientSnapshot(client: Client): ClientSnapshot {
  const contact = [client.contactFirstName, client.contactLastName].filter(Boolean).join(" ");
  return {
    kind: client.kind,
    name: client.name,
    contactName: contact || null,
    email: client.email,
    phone: client.phone,
    addressLines: addressLines(client),
    siren: client.siren ?? (client.siret ? client.siret.slice(0, 9) : null),
    siret: client.siret,
    vatNumber: client.vatNumber,
  };
}

export function sellerSnapshot(org: Organization): SellerSnapshot {
  return {
    name: org.name,
    legalName: org.legalName,
    legalForm: org.legalForm,
    shareCapital: org.shareCapital,
    siren: org.siren ?? (org.siret ? org.siret.slice(0, 9) : null),
    siret: org.siret,
    vatNumber: org.vatNumber,
    rcs: org.rcs,
    addressLines: addressLines(org),
    email: org.email,
    phone: org.phone,
    website: org.website,
    iban: org.iban,
    bic: org.bic,
    vatRegime: org.vatRegime,
    latePenaltyText: org.latePenaltyText,
    paymentTermsDays: org.paymentTermsDays,
    brandColor: org.brandColor,
    logoKey: org.logoKey,
  };
}

/**
 * Mentions obligatoires manquantes pour ÉMETTRE une facture (Code de commerce
 * L441-9, CGI art. 242 nonies A) : on refuse d'émettre un document non
 * conforme plutôt que de le laisser partir incomplet.
 */
export function missingInvoiceMentions(seller: SellerSnapshot, client: ClientSnapshot): string[] {
  const missing: string[] = [];
  if (!seller.siren && !seller.siret) missing.push("SIREN ou SIRET de votre entreprise (Réglages → Entreprise)");
  if (seller.addressLines.length < 2) missing.push("Adresse complète de votre entreprise (Réglages → Entreprise)");
  if (seller.vatRegime === "NORMAL" && !seller.vatNumber)
    missing.push("Numéro de TVA intracommunautaire de votre entreprise (Réglages → Entreprise)");
  if (client.addressLines.length < 2) missing.push(`Adresse complète du client « ${client.name} »`);
  return missing;
}
