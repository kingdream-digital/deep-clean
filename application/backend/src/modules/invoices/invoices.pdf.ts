import PDFDocument from "pdfkit";
import { companyDateLabel } from "../../utils/companyTime";
import { env } from "../../config/env";
import { BRAND, CONTENT_WIDTH, PAGE_LEFT, PAGE_RIGHT, drawHeader, ensureSpace, finalizePagination, formatEuroPdf } from "../../utils/pdfBrand";
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
  client: { companyName: string };
  quote: { quoteNumber: string } | null;
  site: { name: string } | null;
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

const COL = { desc: PAGE_LEFT, unit: PAGE_LEFT + 240, qty: PAGE_LEFT + 305, price: PAGE_LEFT + 360, total: PAGE_LEFT + 450 };
const COL_W = { desc: 235, unit: 60, qty: 50, price: 85, total: 65 };

function drawItemsHeaderRow(doc: PDFKit.PDFDocument, y: number): void {
  doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, 20).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(8.5);
  doc.text("PRESTATION", COL.desc + 8, y + 6, { width: COL_W.desc });
  doc.text("UNITÉ", COL.unit, y + 6, { width: COL_W.unit, align: "right" });
  doc.text("QTÉ", COL.qty, y + 6, { width: COL_W.qty, align: "right" });
  doc.text("PU HT", COL.price, y + 6, { width: COL_W.price, align: "right" });
  doc.text("TOTAL HT", COL.total, y + 6, { width: COL_W.total - 8, align: "right" });
}

/** PDF de la facture envoyée au client final (même identité visuelle que le devis). */
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y!, m! - 1, 1)));
}

export async function buildInvoicePdf(invoice: InvoicePdfData): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const title = `Facture ${invoice.invoiceNumber}`;
  const subtitle = invoice.client.companyName;
  doc.on("pageAdded", () => drawHeader(doc, title, subtitle));
  drawHeader(doc, title, subtitle);

  const metaY = doc.y;
  doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(9);
  doc.text(`Date d'émission : ${dateFmt(invoice.issueDate)}`, PAGE_LEFT, metaY, { width: 250 });
  if (invoice.period) doc.text(`Mois facturé : ${periodLabel(invoice.period)}`, PAGE_LEFT, doc.y + 2, { width: 250 });
  if (invoice.dueDate) doc.text(`Échéance : ${calendarDateFmt(invoice.dueDate)}`, PAGE_LEFT, doc.y + 2, { width: 250 });
  if (invoice.quote) doc.text(`Devis associé : ${invoice.quote.quoteNumber}`, PAGE_LEFT, doc.y + 2, { width: 250 });
  if (invoice.site) doc.text(`Chantier : ${invoice.site.name}`, PAGE_LEFT, doc.y + 2, { width: 250 });

  doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(10).text("CLIENT", PAGE_LEFT + 300, metaY, { width: 215 });
  doc.font("Helvetica").fontSize(9).fillColor(BRAND.inkSecondary);
  doc.text(invoice.client.companyName, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (invoice.contactName) doc.text(invoice.contactName, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (invoice.billingAddress) doc.text(invoice.billingAddress, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (invoice.contactEmail) doc.text(invoice.contactEmail, PAGE_LEFT + 300, doc.y, { width: 215 });
  if (invoice.siret) doc.text(`SIRET : ${invoice.siret}`, PAGE_LEFT + 300, doc.y, { width: 215 });

  doc.y = Math.max(doc.y, metaY + 90) + 10;

  let headerY = doc.y;
  drawItemsHeaderRow(doc, headerY);
  doc.y = headerY + 22;

  invoice.items.forEach((item, index) => {
    // Hauteur mesurée : un libellé long passe sur plusieurs lignes sans
    // chevaucher la ligne suivante.
    const descHeight = doc.font("Helvetica").fontSize(9).heightOfString(item.description, { width: COL_W.desc - 8 });
    const rowHeight = Math.max(20, 5 + descHeight + 6);
    ensureSpace(doc, rowHeight, () => {
      headerY = doc.y;
      drawItemsHeaderRow(doc, headerY);
      doc.y = headerY + 22;
    });

    const y = doc.y;
    if (index % 2 === 1) doc.rect(PAGE_LEFT, y, CONTENT_WIDTH, rowHeight).fill(BRAND.rowAlt);
    doc.fillColor(BRAND.ink).font("Helvetica").fontSize(9);
    doc.text(item.description, COL.desc + 8, y + 5, { width: COL_W.desc - 8 });
    doc.fillColor(BRAND.inkSecondary);
    doc.text(UNIT_LABELS[item.unit], COL.unit, y + 5, { width: COL_W.unit, align: "right" });
    doc.text(String(item.quantity), COL.qty, y + 5, { width: COL_W.qty, align: "right" });
    doc.text(formatEuroPdf(item.unitPriceHt), COL.price, y + 5, { width: COL_W.price, align: "right" });
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").text(formatEuroPdf(item.totalHt), COL.total, y + 5, { width: COL_W.total - 8, align: "right" });
    doc.y = y + rowHeight;
  });

  ensureSpace(doc, 90, () => undefined);
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

  totalLine("Sous-total HT", formatEuroPdf(invoice.subtotalHt));
  totalLine(`TVA (${invoice.vatRate}%)`, formatEuroPdf(invoice.vatAmount));
  totalLine("Total TTC", formatEuroPdf(invoice.totalTtc), true);
  doc.y = totalsY + 10;

  if (invoice.paymentTerms) {
    ensureSpace(doc, 40, () => undefined);
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(9).text("Conditions de paiement", PAGE_LEFT, doc.y, { width: CONTENT_WIDTH });
    doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(9).text(invoice.paymentTerms, PAGE_LEFT, doc.y + 2, { width: CONTENT_WIDTH });
  }

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
