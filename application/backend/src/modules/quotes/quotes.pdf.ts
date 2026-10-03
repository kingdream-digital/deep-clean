import PDFDocument from "pdfkit";
import { companyDateLabel } from "../../utils/companyTime";
import { companyFooterLine, getCompanyProfile, sellerBlockLines, sirenOf } from "../einvoicing/companyProfile";
import { BRAND, CONTENT_WIDTH, FOOTER_Y, PAGE_LEFT, PAGE_RIGHT, ensureSpace, finalizePagination, formatEuroPdf } from "../../utils/pdfBrand";
import { drawCommercialHeader, drawInfoStrip, drawNoteBox, drawParties, drawTableHeader, drawTotals } from "../../utils/pdfCommercial";
import type { QuoteFollowUpMethod, QuoteItemFrequency, QuoteItemUnit } from "@prisma/client";

interface QuotePdfItem {
  description: string;
  quantity: number;
  unit: QuoteItemUnit;
  unitPriceHt: number;
  discount: number;
  totalHt: number;
  frequency: QuoteItemFrequency;
  occurrencesPerMonth: number | null;
  monthlyAmountHt: number;
}

interface QuotePdfData {
  quoteNumber: string;
  issueDate: Date;
  validUntil: Date | null;
  subject: string | null;
  description: string | null;
  paymentTerms: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingAddress: string | null;
  siteAddress: string | null;
  siret: string | null;
  subtotalHt: number;
  discount: number;
  vatRate: number;
  vatAmount: number;
  totalTtc: number;
  monthlyAmountHt: number;
  client: { companyName: string; siren?: string | null; siret?: string | null };
  items: QuotePdfItem[];
  // Volontairement absent de cette interface : `internalNotes` n'est jamais
  // lu ici (cahier des charges §9/§15 : "Les notes internes ne doivent
  // JAMAIS apparaître dans le PDF client").
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

const FREQUENCY_LABELS: Record<QuoteItemFrequency, string> = {
  ONE_TIME: "Ponctuelle",
  DAILY: "Quotidienne",
  MULTIPLE_PER_WEEK: "Plusieurs fois par semaine",
  WEEKLY: "Hebdomadaire",
  MULTIPLE_PER_MONTH: "Plusieurs fois par mois",
  MONTHLY: "Mensuelle",
  CUSTOM: "Personnalisée",
};

const COL = { desc: PAGE_LEFT + 12, unit: PAGE_LEFT + 222, qty: PAGE_LEFT + 285, price: PAGE_LEFT + 330, discount: PAGE_LEFT + 400, total: PAGE_LEFT + 445 };
const COL_W = { desc: 205, unit: 58, qty: 40, price: 66, discount: 42, total: 58 };
const HEADER_COLUMNS = [
  { label: "PRESTATION", x: COL.desc, width: COL_W.desc },
  { label: "UNITÉ", x: COL.unit, width: COL_W.unit, align: "right" as const },
  { label: "QTÉ", x: COL.qty, width: COL_W.qty, align: "right" as const },
  { label: "PU HT", x: COL.price, width: COL_W.price, align: "right" as const },
  { label: "REMISE", x: COL.discount, width: COL_W.discount, align: "right" as const },
  { label: "TOTAL HT", x: COL.total, width: COL_W.total, align: "right" as const },
];

/**
 * PDF du devis envoyé au client final, aux couleurs du logo. Ne lit jamais
 * `internalNotes` (voir QuotePdfData ci-dessus) : impossible d'exposer par
 * erreur une note interne.
 */
export async function buildQuotePdf(quote: QuotePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const company = getCompanyProfile();
  doc.on("pageAdded", () => drawCommercialHeader(doc, "DEVIS", quote.quoteNumber, quote.client.companyName));
  drawCommercialHeader(doc, "DEVIS", quote.quoteNumber, quote.subject ?? `Émis le ${dateFmt(quote.issueDate)}`);

  const clientSiren = sirenOf({ siren: quote.client.siren, siret: quote.siret ?? quote.client.siret });
  drawParties(doc, sellerBlockLines(company), {
    name: quote.client.companyName,
    lines: [
      quote.contactName ? `À l'attention de ${quote.contactName}` : undefined,
      quote.billingAddress ?? undefined,
      [quote.contactPhone, quote.contactEmail].filter(Boolean).join(" · ") || undefined,
      quote.siret ? `SIRET ${quote.siret}` : clientSiren ? `SIREN ${clientSiren}` : undefined,
    ].filter(Boolean) as string[],
  });

  drawInfoStrip(doc, [
    { label: "Date d'émission", value: dateFmt(quote.issueDate) },
    ...(quote.validUntil ? [{ label: "Valable jusqu'au", value: calendarDateFmt(quote.validUntil) }] : []),
    { label: "Nature", value: "Prestations de services" },
    ...(quote.siteAddress ? [{ label: "Lieu d'intervention", value: quote.siteAddress }] : []),
  ]);

  if (quote.description) {
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9.5).text(quote.description, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.y += 12;
  }

  let headerY = doc.y;
  drawTableHeader(doc, headerY, HEADER_COLUMNS);
  doc.y = headerY + 24;

  quote.items.forEach((item, index) => {
    // Hauteur mesurée : un libellé long passe sur plusieurs lignes, la ligne
    // de fréquence se place alors juste en dessous (jamais par-dessus).
    const frequencyText =
      item.frequency === "ONE_TIME"
        ? null
        : `${FREQUENCY_LABELS[item.frequency]}${item.occurrencesPerMonth ? ` · ${String(item.occurrencesPerMonth).replace(".", ",")} passage${item.occurrencesPerMonth > 1 ? "s" : ""} / mois` : ""} — soit ${formatEuroPdf(item.monthlyAmountHt)} HT / mois`;
    const descHeight = doc.font("Helvetica").fontSize(9).heightOfString(item.description, { width: COL_W.desc });
    const freqHeight = frequencyText ? doc.font("Helvetica-Bold").fontSize(7.5).heightOfString(frequencyText, { width: CONTENT_WIDTH - 24 }) : 0;
    const rowHeight = Math.max(24, 8 + descHeight + (frequencyText ? 4 + freqHeight : 0) + 8);
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
    doc.text(item.discount > 0 ? `-${item.discount} %` : "—", COL.discount, y + 8, { width: COL_W.discount, align: "right" });
    doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").text(formatEuroPdf(item.totalHt), COL.total, y + 8, { width: COL_W.total, align: "right" });
    if (frequencyText) {
      doc.fillColor(BRAND.accent).font("Helvetica-Bold").fontSize(7.5).text(frequencyText, COL.desc, y + 8 + descHeight + 4, { width: CONTENT_WIDTH - 24 });
    }
    doc.y = y + rowHeight;
  });
  doc.moveTo(PAGE_LEFT, doc.y).lineTo(PAGE_RIGHT, doc.y).strokeColor(BRAND.border).lineWidth(1).stroke();

  ensureSpace(doc, 150, () => undefined);
  const recurring = quote.monthlyAmountHt > 0;
  const monthlyTtc = Math.round(quote.monthlyAmountHt * (1 + quote.vatRate / 100) * 100) / 100;
  const baseRows = [
    { label: recurring ? "Total HT d'un passage" : "Total HT", value: formatEuroPdf(quote.subtotalHt) },
    ...(quote.discount > 0 ? [{ label: "Remise", value: `- ${formatEuroPdf(quote.discount)}` }] : []),
    { label: `TVA ${String(quote.vatRate).replace(".", ",")} %`, value: formatEuroPdf(quote.vatAmount) },
  ];
  if (recurring) {
    // Contrat récurrent : ce que le client paiera chaque mois est mis en avant.
    drawTotals(doc, [...baseRows, { label: "Total TTC d'un passage", value: formatEuroPdf(quote.totalTtc) }, { label: "Montant mensuel HT", value: formatEuroPdf(quote.monthlyAmountHt) }], {
      label: "Par mois TTC",
      value: formatEuroPdf(monthlyTtc),
    });
  } else {
    drawTotals(doc, baseRows, { label: "Total TTC", value: formatEuroPdf(quote.totalTtc) });
  }

  drawNoteBox(
    doc,
    "Conditions",
    [
      quote.paymentTerms?.trim() || `Paiement à ${company.paymentDays} jours par virement, à réception de facture.`,
      quote.validUntil ? `Offre valable jusqu'au ${calendarDateFmt(quote.validUntil)}.` : undefined,
      `Pénalités de retard : ${company.latePenaltyText} ; indemnité forfaitaire pour frais de recouvrement : 40 €.`,
    ].filter(Boolean) as string[]
  );

  // Bon pour accord : signature du client.
  if (doc.y + 92 > FOOTER_Y) doc.addPage();
  const signY = doc.y + 4;
  doc.roundedRect(PAGE_RIGHT - 250, signY, 250, 80, 8).lineWidth(1.2).strokeColor(BRAND.accent).stroke();
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(9.5).text("Bon pour accord", PAGE_RIGHT - 238, signY + 10, { width: 226 });
  doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(8).text("Date, nom, signature et cachet du client, précédés de la mention « Bon pour accord »", PAGE_RIGHT - 238, signY + 24, { width: 226 });
  doc.fillColor(BRAND.accent).font("Helvetica-Bold").fontSize(9.5).text("Merci pour votre confiance.", PAGE_LEFT, signY + 34, { width: 220 });
  doc.y = signY + 90;

  finalizePagination(doc, companyFooterLine(company));
  doc.end();
  return done;
}
