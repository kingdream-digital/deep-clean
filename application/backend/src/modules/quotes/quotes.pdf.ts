import PDFDocument from "pdfkit";
import { companyDateLabel } from "../../utils/companyTime";
import { companyFooterLine, getCompanyProfile, sellerBlockLines, sirenOf } from "../einvoicing/companyProfile";
import { BRAND, CONTENT_WIDTH, FOOTER_Y, PAGE_LEFT, PAGE_RIGHT, drawHeader, ensureSpace, finalizePagination, formatEuroPdf } from "../../utils/pdfBrand";
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

const COL = { desc: PAGE_LEFT, unit: PAGE_LEFT + 210, qty: PAGE_LEFT + 275, price: PAGE_LEFT + 325, discount: PAGE_LEFT + 400, total: PAGE_LEFT + 450 };
const COL_W = { desc: 205, unit: 60, qty: 45, price: 70, discount: 45, total: 65 };

function drawItemsHeaderRow(doc: PDFKit.PDFDocument, y: number): void {
  doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 20).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(8.5);
  doc.text("PRESTATION", COL.desc + 8, y + 6, { width: COL_W.desc });
  doc.text("UNITÉ", COL.unit, y + 6, { width: COL_W.unit, align: "right" });
  doc.text("QTÉ", COL.qty, y + 6, { width: COL_W.qty, align: "right" });
  doc.text("PU HT", COL.price, y + 6, { width: COL_W.price, align: "right" });
  doc.text("REMISE", COL.discount, y + 6, { width: COL_W.discount, align: "right" });
  doc.text("TOTAL HT", COL.total, y + 6, { width: COL_W.total - 8, align: "right" });
}

/**
 * PDF du devis envoyé au client final (cahier des charges §15) — logo,
 * coordonnées de l'entreprise, numéro/dates, client, prestations, totaux,
 * conditions, mentions légales. Ne lit jamais `internalNotes` (voir
 * QuotePdfData ci-dessus) : impossible d'exposer par erreur une note interne.
 */
export async function buildQuotePdf(quote: QuotePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const title = `Devis ${quote.quoteNumber}`;
  const subtitle = quote.subject ?? quote.client.companyName;
  doc.on("pageAdded", () => drawHeader(doc, title, subtitle));
  drawHeader(doc, title, subtitle);

  const company = getCompanyProfile();

  // Émetteur (identité légale complète) à gauche, client à droite.
  const topY = doc.y;
  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(10).text("ÉMETTEUR", PAGE_LEFT, topY, { width: 250 });
  doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.inkSecondary);
  for (const line of sellerBlockLines(company)) doc.text(line, PAGE_LEFT, doc.y, { width: 250 });
  const leftBottom = doc.y;

  const clientSiren = sirenOf({ siren: quote.client.siren, siret: quote.siret ?? quote.client.siret });
  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(10).text("CLIENT", PAGE_LEFT + 300, topY, { width: 215 });
  doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.inkSecondary);
  doc.text(quote.client.companyName, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.contactName) doc.text(quote.contactName, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.billingAddress) doc.text(quote.billingAddress, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.contactEmail) doc.text(quote.contactEmail, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.contactPhone) doc.text(quote.contactPhone, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.siret) doc.text(`SIRET : ${quote.siret}`, PAGE_LEFT + 300, doc.y, { width: 215 });
  else if (clientSiren) doc.text(`SIREN : ${clientSiren}`, PAGE_LEFT + 300, doc.y, { width: 215 });

  doc.y = Math.max(leftBottom, doc.y) + 12;
  const metaY = doc.y;
  doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(9);
  doc.text(`Date d'émission : ${dateFmt(quote.issueDate)}`, PAGE_LEFT, metaY, { width: 250 });
  if (quote.validUntil) {
    doc.text(`Valable jusqu'au : ${calendarDateFmt(quote.validUntil)}`, PAGE_LEFT, doc.y + 2, { width: 250 });
  }
  const leftMetaBottom = doc.y;
  doc.text("Nature : prestations de services", PAGE_LEFT + 300, metaY, { width: 215 });
  if (quote.siteAddress) doc.text(`Lieu d'intervention : ${quote.siteAddress}`, PAGE_LEFT + 300, doc.y + 2, { width: 215 });
  doc.y = Math.max(leftMetaBottom, doc.y) + 14;

  if (quote.description) {
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9.5).text(quote.description, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.y += 10;
  }

  let headerY = doc.y;
  drawItemsHeaderRow(doc, headerY);
  doc.y = headerY + 22;

  quote.items.forEach((item, index) => {
    // Hauteur mesurée : un libellé long passe sur plusieurs lignes, la ligne
    // de fréquence se place alors juste en dessous (jamais par-dessus).
    const frequencyText =
      item.frequency === "ONE_TIME"
        ? null
        : `${FREQUENCY_LABELS[item.frequency]}${item.occurrencesPerMonth ? ` · ${item.occurrencesPerMonth} / mois` : ""} — soit ${formatEuroPdf(item.monthlyAmountHt)} HT / mois`;
    const descHeight = doc.font("Helvetica").fontSize(9).heightOfString(item.description, { width: COL_W.desc - 8 });
    const freqHeight = frequencyText ? doc.fontSize(8).heightOfString(frequencyText, { width: CONTENT_WIDTH - 16 }) : 0;
    const rowHeight = Math.max(20, 5 + descHeight + (frequencyText ? 3 + freqHeight : 0) + 6);
    ensureSpace(doc, rowHeight, () => {
      headerY = doc.y;
      drawItemsHeaderRow(doc, headerY);
      doc.y = headerY + 22;
    });

    const y = doc.y;
    if (index % 2 === 1) {
      doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, rowHeight).fill(BRAND.rowAlt);
    }
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9);
    doc.text(item.description, COL.desc + 8, y + 5, { width: COL_W.desc - 8 });
    doc.fillColor(BRAND.inkSecondary);
    doc.text(UNIT_LABELS[item.unit], COL.unit, y + 5, { width: COL_W.unit, align: "right" });
    doc.text(String(item.quantity), COL.qty, y + 5, { width: COL_W.qty, align: "right" });
    doc.text(formatEuroPdf(item.unitPriceHt), COL.price, y + 5, { width: COL_W.price, align: "right" });
    doc.text(item.discount > 0 ? `-${item.discount}%` : "—", COL.discount, y + 5, { width: COL_W.discount, align: "right" });
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").text(formatEuroPdf(item.totalHt), COL.total, y + 5, { width: COL_W.total - 8, align: "right" });

    if (frequencyText) {
      doc
        .fillColor(BRAND.accentDeep)
        .font("Helvetica")
        .fontSize(8)
        .text(frequencyText, COL.desc + 8, y + 5 + descHeight + 3, { width: CONTENT_WIDTH - 16 });
    }

    doc.y = y + rowHeight;
  });

  ensureSpace(doc, 110, () => {
    headerY = doc.y;
  });

  doc.moveTo(PAGE_LEFT, doc.y + 4).lineTo(PAGE_RIGHT, doc.y + 4).strokeColor(BRAND.border).lineWidth(1).stroke();
  let totalsY = doc.y + 14;
  const totalsX = PAGE_RIGHT - 220;

  function totalLine(label: string, value: string, bold = false) {
    doc
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fontSize(bold ? 11 : 9.5)
      .fillColor(bold ? BRAND.ink : BRAND.inkSecondary)
      .text(label, totalsX, totalsY, { width: 130 })
      .text(value, totalsX + 130, totalsY, { width: 90, align: "right" });
    totalsY += bold ? 18 : 14;
  }

  totalLine("Sous-total HT", formatEuroPdf(quote.subtotalHt));
  if (quote.discount > 0) totalLine("Remise", `- ${formatEuroPdf(quote.discount)}`);
  totalLine(`TVA (${quote.vatRate}%)`, formatEuroPdf(quote.vatAmount));
  // Contrat récurrent : le total d'un passage n'est pas ce que le client
  // paiera — le montant mensuel, en dessous, est mis en avant.
  totalLine(quote.monthlyAmountHt > 0 ? "Total TTC d'un passage" : "Total TTC", formatEuroPdf(quote.totalTtc), quote.monthlyAmountHt === 0);
  if (quote.monthlyAmountHt > 0) {
    // Contrat récurrent : ce que le client paiera chaque mois.
    totalLine("Montant mensuel HT", formatEuroPdf(quote.monthlyAmountHt));
    totalLine("Montant mensuel TTC", formatEuroPdf(Math.round(quote.monthlyAmountHt * (1 + quote.vatRate / 100) * 100) / 100), true);
  }
  doc.y = totalsY + 10;

  const conditions = [
    quote.paymentTerms?.trim() || `Paiement à ${company.paymentDays} jours par virement, à réception de facture.`,
    quote.validUntil ? `Offre valable jusqu'au ${calendarDateFmt(quote.validUntil)}.` : undefined,
    "Pénalités de retard : " + company.latePenaltyText + " ; indemnité forfaitaire pour frais de recouvrement : 40 €.",
  ].filter(Boolean) as string[];
  const conditionsText = conditions.join("\n");
  ensureSpace(doc, doc.font("Helvetica").fontSize(8.5).heightOfString(conditionsText, { width: CONTENT_WIDTH }) + 110, () => undefined);
  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(9).text("Conditions", PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
  doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(8.5).text(conditionsText, PAGE_LEFT, doc.y + 3, { width: CONTENT_WIDTH, lineGap: 1.5 });

  // Bon pour accord : signature du client.
  const signY = doc.y + 16;
  doc.roundedRect(PAGE_RIGHT - 240, signY, 240, 70, 6).strokeColor(BRAND.border).lineWidth(1).stroke();
  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(9).text("Bon pour accord", PAGE_RIGHT - 230, signY + 8, { width: 220 });
  doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(8).text("Date, nom, signature et cachet du client", PAGE_RIGHT - 230, signY + 21, { width: 220 });
  doc.y = signY + 78;

  finalizePagination(doc, companyFooterLine(company));
  doc.end();
  return done;
}
