import PDFDocument from "pdfkit";
import { companyDateLabel } from "../../utils/companyTime";
import { companyFooterLine, getCompanyProfile, sellerBlockLines, sirenOf } from "../einvoicing/companyProfile";
import { LATE_FEE_NOTE, NO_DISCOUNT_NOTE, VAT_ON_DEBITS_NOTE, effectiveDueDate, latePenaltyNote } from "../einvoicing/enInvoice";
import { BRAND, CONTENT_WIDTH, PAGE_LEFT, PAGE_RIGHT, ensureSpace, finalizePagination, formatEuroPdf } from "../../utils/pdfBrand";
import { drawCommercialHeader, drawInfoStrip, drawNoteBox, drawPaidStamp, drawParties, drawTableHeader, drawTotals } from "../../utils/pdfCommercial";
import type { QuoteItemUnit } from "@prisma/client";

interface InvoicePdfItem {
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  totalHt: number;
}

interface InvoicePdfData {
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date | null;
  paymentTerms: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  siret: string | null;
  // Mois facturé (« AAAA-MM ») — facture mensuelle.
  period: string | null;
  subtotalHt: number;
  vatRate: number;
  vatAmount: number;
  totalTtc: number;
  client: { companyName: string; siren?: string | null; siret?: string | null };
  quote: { quoteNumber: string } | null;
  site: { name: string; address?: string } | null;
  paidAt?: Date | null;
  items: InvoicePdfItem[];
  // `internalNotes` n'est volontairement pas dans cette interface — jamais lu
  // ici, même règle que quotes.pdf.ts.
}

// Date d'émission : instant, lu en heure de Paris.
const dateFmt = (d: Date) => companyDateLabel(d);
// Échéance / validité : le moment choisi dans l'app, lu en heure de Paris.
const calendarDateFmt = (d: Date) => companyDateLabel(d);

const UNIT_LABELS: Record<QuoteItemUnit, string> = {
  HOUR: "heure",
  DAY: "jour",
  INTERVENTION: "intervention",
  SQUARE_METER: "m²",
  FLAT_RATE: "forfait",
  MONTH: "mois",
  OTHER: "autre",
};

const COL = { desc: PAGE_LEFT + 12, unit: PAGE_LEFT + 245, qty: PAGE_LEFT + 310, price: PAGE_LEFT + 360, total: PAGE_LEFT + 440 };
const COL_W = { desc: 225, unit: 60, qty: 45, price: 75, total: 63 };
const HEADER_COLUMNS = [
  { label: "PRESTATION", x: COL.desc, width: COL_W.desc },
  { label: "UNITÉ", x: COL.unit, width: COL_W.unit, align: "right" as const },
  { label: "QTÉ", x: COL.qty, width: COL_W.qty, align: "right" as const },
  { label: "PU HT", x: COL.price, width: COL_W.price, align: "right" as const },
  { label: "TOTAL HT", x: COL.total, width: COL_W.total, align: "right" as const },
];

function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}

/** PDF de la facture envoyée au client final, aux couleurs du logo. */
export async function buildInvoicePdf(invoice: InvoicePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const company = getCompanyProfile();
  const dueDate = effectiveDueDate(invoice, company);
  doc.on("pageAdded", () => drawCommercialHeader(doc, "FACTURE", invoice.invoiceNumber, invoice.client.companyName));
  drawCommercialHeader(doc, "FACTURE", invoice.invoiceNumber, `Émise le ${dateFmt(invoice.issueDate)}`);

  const clientSiren = sirenOf({ siren: invoice.client.siren, siret: invoice.siret ?? invoice.client.siret });
  drawParties(doc, sellerBlockLines(company), {
    name: invoice.client.companyName,
    lines: [
      invoice.contactName ? `À l'attention de ${invoice.contactName}` : undefined,
      invoice.billingAddress ?? undefined,
      invoice.contactEmail ?? undefined,
      invoice.siret ? `SIRET ${invoice.siret}` : clientSiren ? `SIREN ${clientSiren}` : undefined,
    ].filter(Boolean) as string[],
  });

  drawInfoStrip(doc, [
    { label: "Date d'émission", value: dateFmt(invoice.issueDate) },
    { label: "Échéance", value: calendarDateFmt(dueDate) },
    ...(invoice.period ? [{ label: "Mois facturé", value: periodLabel(invoice.period) }] : []),
    { label: "Nature", value: "Prestations de services" },
    ...(invoice.quote ? [{ label: "Devis", value: invoice.quote.quoteNumber }] : []),
  ]);
  if (invoice.site) {
    doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(8.5)
      .text(`Lieu d'intervention : ${invoice.site.name}${invoice.site.address ? ` — ${invoice.site.address}` : ""}`, PAGE_LEFT, doc.y - 6, { width: CONTENT_WIDTH });
    doc.y += 10;
  }

  let headerY = doc.y;
  drawTableHeader(doc, headerY, HEADER_COLUMNS);
  doc.y = headerY + 24;

  invoice.items.forEach((item, index) => {
    // Hauteur mesurée : un libellé long passe sur plusieurs lignes sans
    // chevaucher la ligne suivante.
    const descHeight = doc.font("Helvetica").fontSize(9).heightOfString(item.description, { width: COL_W.desc });
    const rowHeight = Math.max(24, 8 + descHeight + 8);
    ensureSpace(doc, rowHeight, () => {
      headerY = doc.y;
      drawTableHeader(doc, headerY, HEADER_COLUMNS);
      doc.y = headerY + 24;
    });
    const y = doc.y;
    if (index % 2 === 1) doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, rowHeight).fill(BRAND.rowAlt);
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9).text(item.description, COL.desc, y + 8, { width: COL_W.desc });
    doc.fillColor(BRAND.inkSecondary);
    doc.text(UNIT_LABELS[item.unit], COL.unit, y + 8, { width: COL_W.unit, align: "right" });
    doc.text(String(item.quantity).replace(".", ","), COL.qty, y + 8, { width: COL_W.qty, align: "right" });
    doc.text(formatEuroPdf(item.unitPriceHt), COL.price, y + 8, { width: COL_W.price, align: "right" });
    doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").text(formatEuroPdf(item.totalHt), COL.total, y + 8, { width: COL_W.total, align: "right" });
    doc.y = y + rowHeight;
  });
  doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(BRAND.border).lineWidth(1).stroke();

  ensureSpace(doc, 110, () => undefined);
  drawTotals(
    doc,
    [
      { label: "Total HT", value: formatEuroPdf(invoice.subtotalHt) },
      { label: `TVA ${String(invoice.vatRate).replace(".", ",")} %`, value: formatEuroPdf(invoice.vatAmount) },
    ],
    { label: "Total TTC", value: formatEuroPdf(invoice.totalTtc) }
  );

  if (invoice.paidAt) drawPaidStamp(doc, `Facture acquittée le ${calendarDateFmt(invoice.paidAt)}`);

  // Conditions de paiement et mentions obligatoires (Code de commerce
  // L441-9 et L441-10, CGI art. 242 nonies A).
  drawNoteBox(
    doc,
    "Conditions de paiement",
    [
      `Échéance : ${calendarDateFmt(dueDate)}. ${invoice.paymentTerms?.trim() || `Paiement à ${company.paymentDays} jours par virement.`}`,
      company.iban ? `Virement : IBAN ${company.iban}${company.bic ? ` · BIC ${company.bic}` : ""} · référence ${invoice.invoiceNumber}` : undefined,
      latePenaltyNote(company),
      LATE_FEE_NOTE,
      NO_DISCOUNT_NOTE,
      company.vatOnDebits ? VAT_ON_DEBITS_NOTE : undefined,
    ].filter(Boolean) as string[]
  );

  doc.fillColor(BRAND.accent).font("Helvetica-Bold").fontSize(9.5).text("Merci pour votre confiance.", PAGE_LEFT, doc.y + 2, { width: CONTENT_WIDTH, align: "center" });

  finalizePagination(doc, companyFooterLine(company));
  doc.end();
  return done;
}
