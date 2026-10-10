import type { QuoteItemUnit } from "@prisma/client";
import { companyDateKey } from "../../utils/companyTime";
import { getCompanyProfile, sirenOf, structuredAddress } from "./companyProfile";
import type { CompanyProfile, StructuredAddress } from "./companyProfile";

// Facture au modèle européen EN 16931 (format « en_invoice » JSON de Super
// PDP), avec les mentions françaises de la réforme 2026 : SIREN des deux
// parties, adresse d'intervention, catégorie d'opération (prestations de
// services), option TVA d'après les débits, conditions et pénalités de
// paiement. Super PDP le convertit ensuite en Factur-X (PDF + XML) — le
// format reconnu par toutes les plateformes agréées.

export interface EinvoiceSource {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  period: string | null;
  paymentTerms: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  siret: string | null;
  vatRate: number;
  subtotalHt: number;
  vatAmount: number;
  totalTtc: number;
  client: { companyName: string; email: string | null; billingAddress: string | null; postalCode: string | null; city: string | null; siret: string | null; siren: string | null };
  quote: { quoteNumber: string } | null;
  site: { name: string; address: string } | null;
  items: { description: string; quantity: number; unit: QuoteItemUnit; unitPriceHt: number; totalHt: number }[];
}

// Unités UN/ECE (recommandation 20), imposées par la norme.
const UNIT_CODES: Record<QuoteItemUnit, string> = {
  HOUR: "HUR",
  DAY: "DAY",
  INTERVENTION: "C62",
  SQUARE_METER: "MTK",
  FLAT_RATE: "C62",
  MONTH: "MON",
  OTHER: "C62",
};

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2);
const num = (n: number) => String(Math.round(n * 10000) / 10000);

export const LATE_FEE_NOTE = "Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement : 40 €.";
export function latePenaltyNote(c: CompanyProfile): string {
  return `Pénalités de retard exigibles dès le lendemain de l'échéance : ${c.latePenaltyText}.`;
}
export const NO_DISCOUNT_NOTE = "Pas d'escompte pour paiement anticipé.";
export const VAT_ON_DEBITS_NOTE = "Option pour le paiement de la taxe d'après les débits.";

/** Échéance : celle de la facture, sinon date d'émission + délai de paiement de l'entreprise. */
export function effectiveDueDate(invoice: { issueDate: Date; dueDate: Date | null }, c: CompanyProfile = getCompanyProfile()): Date {
  return invoice.dueDate ?? new Date(invoice.issueDate.getTime() + c.paymentDays * 86_400_000);
}

function postal(a: StructuredAddress | null) {
  return a ? { address_line1: a.line || undefined, post_code: a.postalCode, city: a.city, country_code: "FR" } : { country_code: "FR" };
}

function periodBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${period}-01`, end: `${period}-${String(last).padStart(2, "0")}` };
}

/**
 * Ce qui manque pour émettre une facture électronique conforme — en
 * français, pour l'afficher tel quel. Liste vide = prête à partir.
 */
/**
 * Ce qui manque côté entreprise émettrice, indépendamment de toute facture
 * (checklist de mise en service de l'espace Super PDP). `withVat` : le numéro
 * de TVA n'est exigé que pour une facture avec TVA.
 */
export function companyEinvoiceBlockers(c: CompanyProfile = getCompanyProfile(), withVat = true): string[] {
  const missing: string[] = [];
  if (!c.siren || !/^\d{9}$/.test(c.siren)) missing.push("SIREN de l'entreprise (variable COMPANY_SIREN ou COMPANY_SIRET)");
  if (!c.addressLine || !c.postalCode || !c.city) missing.push("adresse complète de l'entreprise (COMPANY_ADDRESS, COMPANY_POSTAL_CODE, COMPANY_CITY)");
  if (withVat && !c.vatNumber) missing.push("numéro de TVA intracommunautaire de l'entreprise (COMPANY_VAT_NUMBER)");
  return missing;
}

export function einvoiceBlockers(invoice: EinvoiceSource, c: CompanyProfile = getCompanyProfile()): string[] {
  const missing = companyEinvoiceBlockers(c, invoice.vatRate > 0);
  if (!sirenOf({ siren: invoice.client.siren, siret: invoice.siret ?? invoice.client.siret })) missing.push("SIREN ou SIRET du client (fiche client)");
  const buyer = structuredAddress(invoice.billingAddress ?? invoice.client.billingAddress, invoice.client);
  if (!buyer?.postalCode || !buyer.city) missing.push("adresse de facturation du client avec code postal et ville");
  if (invoice.items.length === 0) missing.push("au moins une ligne de facture");
  return missing;
}

export function buildEnInvoice(invoice: EinvoiceSource, c: CompanyProfile = getCompanyProfile()) {
  const buyerSiren = sirenOf({ siren: invoice.client.siren, siret: invoice.siret ?? invoice.client.siret });
  const buyerAddress = structuredAddress(invoice.billingAddress ?? invoice.client.billingAddress, invoice.client);
  const siteAddress = invoice.site ? structuredAddress(invoice.site.address) : null;
  const vatCategory = invoice.vatRate > 0 ? "S" : "E";

  const notes = [
    { note: LATE_FEE_NOTE, subject_code: "PMT" },
    { note: latePenaltyNote(c), subject_code: "PMD" },
    { note: NO_DISCOUNT_NOTE, subject_code: "AAB" },
    ...(c.vatOnDebits ? [{ note: VAT_ON_DEBITS_NOTE }] : []),
  ];

  const legalInfo = [c.legalForm ? `${c.legalForm}${c.shareCapital ? ` au capital de ${c.shareCapital}` : ""}` : undefined, c.rcs].filter(Boolean).join(" · ");

  return {
    number: invoice.invoiceNumber,
    issue_date: companyDateKey(invoice.issueDate),
    type_code: 380,
    currency_code: "EUR",
    process_control: {
      specification_identifier: "urn:cen.eu:en16931:2017",
      // Cadre de facturation (norme XP Z12-012) : S1 = prestations de services.
      business_process_type: "S1",
    },
    seller: {
      name: c.name,
      ...(legalInfo ? { additional_legal_information: legalInfo } : {}),
      postal_address: postal({ line: c.addressLine ?? "", postalCode: c.postalCode, city: c.city }),
      electronic_address: { scheme: "0225", value: c.siren ?? "" },
      legal_registration_identifier: { scheme: "0002", value: c.siren ?? "" },
      ...(c.siret ? { identifiers: [{ scheme: "0009", value: c.siret }] } : {}),
      ...(c.vatNumber ? { vat_identifier: c.vatNumber } : {}),
      ...(c.phone || c.email ? { contact: { phone_number: c.phone, email_address: c.email } } : {}),
    },
    buyer: {
      name: invoice.client.companyName,
      postal_address: postal(buyerAddress),
      ...(buyerSiren
        ? { electronic_address: { scheme: "0225", value: buyerSiren }, legal_registration_identifier: { scheme: "0002", value: buyerSiren } }
        : {}),
      ...(invoice.contactName || invoice.contactEmail || invoice.contactPhone
        ? { contact: { contact_point: invoice.contactName ?? undefined, email_address: invoice.contactEmail ?? undefined, phone_number: invoice.contactPhone ?? undefined } }
        : {}),
    },
    // Adresse d'intervention (nouvelle mention obligatoire quand elle diffère
    // de l'adresse de facturation) : le chantier.
    ...(siteAddress ? { deliver_to_address: postal(siteAddress), delivery_information: { deliver_to_name: invoice.site!.name } } : {}),
    ...(invoice.period ? { invoicing_period: { start_date: periodBounds(invoice.period).start, end_date: periodBounds(invoice.period).end } } : {}),
    ...(invoice.quote ? { contract_reference: invoice.quote.quoteNumber } : {}),
    lines: invoice.items.map((item, index) => ({
      identifier: String(index + 1),
      invoiced_quantity: num(item.quantity),
      invoiced_quantity_code: UNIT_CODES[item.unit],
      net_amount: money(item.totalHt),
      item_information: { name: item.description.slice(0, 200), ...(item.description.length > 200 ? { description: item.description } : {}) },
      price_details: { item_net_price: num(item.unitPriceHt) },
      vat_information: { invoiced_item_vat_category_code: vatCategory, invoiced_item_vat_rate: num(invoice.vatRate) },
    })),
    notes,
    vat_break_down: [
      {
        vat_category_code: vatCategory,
        vat_category_rate: num(invoice.vatRate),
        vat_category_taxable_amount: money(invoice.subtotalHt),
        vat_category_tax_amount: money(invoice.vatAmount),
        ...(vatCategory === "E" ? { vat_exemption_reason: "TVA non applicable, art. 293 B du CGI" } : {}),
      },
    ],
    totals: {
      sum_invoice_lines_amount: money(invoice.subtotalHt),
      total_without_vat: money(invoice.subtotalHt),
      total_vat_amount: { value: money(invoice.vatAmount), currency_code: "EUR" },
      total_with_vat: money(invoice.totalTtc),
      amount_due_for_payment: money(invoice.totalTtc),
    },
    payment_due_date: companyDateKey(effectiveDueDate(invoice, c)),
    payment_terms: invoice.paymentTerms?.trim() || `Paiement à ${c.paymentDays} jours par virement.`,
    ...(c.iban
      ? {
          payment_instructions: {
            payment_means_type_code: "58", // virement SEPA
            remittance_information: invoice.invoiceNumber,
            credit_transfers: [{ payment_account_identifier: { scheme: "", value: c.iban }, payment_account_name: c.name, ...(c.bic ? { payment_service_provider_identifier: c.bic } : {}) }],
          },
        }
      : {}),
  };
}

export type EnInvoice = ReturnType<typeof buildEnInvoice>;
