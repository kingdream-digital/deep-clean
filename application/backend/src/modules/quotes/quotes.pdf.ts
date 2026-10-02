import PDFDocument from "pdfkit";
import { companyDateLabel } from "../../utils/companyTime";
import { env } from "../../config/env";
import { BRAND, CONTENT_WIDTH, FOOTER_Y, PAGE_LEFT, PAGE_RIGHT, drawHeader, ensureSpace, finalizePagination } from "../../utils/pdfBrand";
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
  client: { companyName: string };
  items: QuotePdfItem[];
  // Volontairement absent de cette interface : `internalNotes` n'est jamais
  // lu ici (cahier des charges §9/§15 : "Les notes internes ne doivent
  // JAMAIS apparaître dans le PDF client").
}

const currencyFmt = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
// Date d'émission : instant, lu en heure de Paris.
const dateFmt = (d: Date) => companyDateLabel(d);
// Échéance / validité : jour calendaire saisi (minuit UTC), lu tel quel.
const calendarDateFmt = (d: Date) => d.toLocaleDateString("fr-FR", { timeZone: "UTC" });

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

  // Bloc "méta" (dates) à gauche, client à droite — deux colonnes côte à côte.
  const metaY = doc.y;
  doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(9);
  doc.text(`Date d'émission : ${dateFmt(quote.issueDate)}`, PAGE_LEFT, metaY, { width: 250 });
  if (quote.validUntil) {
    doc.text(`Valable jusqu'au : ${calendarDateFmt(quote.validUntil)}`, PAGE_LEFT, doc.y + 2, { width: 250 });
  }
  if (quote.siteAddress) {
    doc.text(`Chantier : ${quote.siteAddress}`, PAGE_LEFT, doc.y + 2, { width: 250 });
  }

  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(10).text("CLIENT", PAGE_LEFT + 300, metaY, { width: 215 });
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.inkSecondary);
  doc.text(quote.client.companyName, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.contactName) doc.text(quote.contactName, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.billingAddress) doc.text(quote.billingAddress, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.contactEmail) doc.text(quote.contactEmail, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.contactPhone) doc.text(quote.contactPhone, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (quote.siret) doc.text(`SIRET : ${quote.siret}`, PAGE_LEFT + 300, doc.y, { width: 215 });

  doc.y = Math.max(doc.y, metaY + 90) + 10;

  if (quote.description) {
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9.5).text(quote.description, PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.y += 10;
  }

  let headerY = doc.y;
  drawItemsHeaderRow(doc, headerY);
  doc.y = headerY + 22;

  quote.items.forEach((item, index) => {
    // Hauteur variable selon la présence d'une ligne de fréquence en dessous.
    const rowHeight = item.frequency === "ONE_TIME" ? 20 : 32;
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
    doc.text(currencyFmt.format(item.unitPriceHt), COL.price, y + 5, { width: COL_W.price, align: "right" });
    doc.text(item.discount > 0 ? `-${item.discount}%` : "—", COL.discount, y + 5, { width: COL_W.discount, align: "right" });
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").text(currencyFmt.format(item.totalHt), COL.total, y + 5, { width: COL_W.total - 8, align: "right" });

    if (item.frequency !== "ONE_TIME") {
      doc
        .fillColor(BRAND.accentDeep)
        .font("Helvetica")
        .fontSize(8)
        .text(
          `${FREQUENCY_LABELS[item.frequency]}${item.occurrencesPerMonth ? ` · ${item.occurrencesPerMonth} / mois` : ""} — soit ${currencyFmt.format(item.monthlyAmountHt)} HT / mois`,
          COL.desc + 8,
          y + 18,
          { width: CONTENT_WIDTH - 16 }
        );
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

  totalLine("Sous-total HT", currencyFmt.format(quote.subtotalHt));
  if (quote.discount > 0) totalLine("Remise", `- ${currencyFmt.format(quote.discount)}`);
  totalLine(`TVA (${quote.vatRate}%)`, currencyFmt.format(quote.vatAmount));
  totalLine("Total TTC", currencyFmt.format(quote.totalTtc), true);
  if (quote.monthlyAmountHt > 0) {
    totalLine("Prévisionnel mensuel HT", currencyFmt.format(quote.monthlyAmountHt));
  }
  doc.y = totalsY + 10;

  if (quote.paymentTerms) {
    ensureSpace(doc, 40, () => undefined);
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(9).text("Conditions", PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(9).text(quote.paymentTerms, PAGE_LEFT, doc.y + 2, { width: CONTENT_WIDTH });
  }

  // Mentions légales de l'entreprise émettrice — à compléter par le client
  // via les variables d'environnement COMPANY_* (voir config/env.ts) avant
  // une mise en production réelle du module commercial.
  ensureSpace(doc, 40, () => undefined);
  const legalParts = [
    env.COMPANY_LEGAL_NAME,
    env.COMPANY_ADDRESS,
    env.COMPANY_SIRET ? `SIRET ${env.COMPANY_SIRET}` : undefined,
    env.COMPANY_VAT_NUMBER ? `TVA ${env.COMPANY_VAT_NUMBER}` : undefined,
    env.COMPANY_PHONE,
    env.COMPANY_EMAIL,
  ].filter(Boolean);
  doc
    .fillColor(BRAND.inkTertiary)
    .font("Helvetica")
    .fontSize(7.5)
    .text(legalParts.join(" · "), PAGE_LEFT, doc.y + 10, { width: CONTENT_WIDTH });

  finalizePagination(doc);
  doc.end();
  return done;
}
