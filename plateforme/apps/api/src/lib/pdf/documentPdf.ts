import PDFDocument from "pdfkit";
import { formatDayLong, formatEuro, formatQuantity, formatVatRate, unitShort, type Unit, type VatBreakdownEntry } from "@aussitot/shared";
import type { ClientSnapshot, SellerSnapshot } from "../../modules/sales/snapshots.ts";

/**
 * PDF des devis, factures et avoirs — sobre et lisible, aux couleurs de
 * l'entreprise (logo et couleur choisis dans ses réglages). Contient toutes
 * les mentions obligatoires françaises ; seules les polices standard du PDF
 * sont utilisées (fichiers légers, lisibles partout).
 */

export type PdfDocumentKind = "QUOTE" | "INVOICE" | "CREDIT_NOTE";

export interface PdfLine {
  description: string;
  quantity: number;
  unit: Unit;
  unitPriceCents: number;
  vatRateBps: number;
  discountBps: number;
  totalHtCents: number;
}

export interface PdfDocumentData {
  kind: PdfDocumentKind;
  number: string;
  title: string | null;
  issueDate: string;
  /** Devis : date de validité. Facture : échéance. */
  secondaryDate: string | null;
  seller: SellerSnapshot;
  client: ClientSnapshot;
  lines: PdfLine[];
  subtotalCents: number;
  vatBreakdown: VatBreakdownEntry[];
  totalCents: number;
  vatExempt: boolean;
  notes: string | null;
  amountPaidCents?: number;
  paidOn?: string | null;
  quoteNumber?: string | null;
  creditedInvoiceNumber?: string | null;
  servicePeriod?: string | null;
  siteLabel?: string | null;
  logo?: Buffer | null;
}

const INK = "#0F172A";
const MUTED = "#64748B";
const LINE = "#E2E8F0";
const SOFT = "#F8FAFC";
const DEFAULT_ACCENT = "#2347F5";
const LEFT = 48;
const RIGHT = 547; // 595 - 48
const WIDTH = RIGHT - LEFT;
const BOTTOM = 842 - 70;

const TITLES: Record<PdfDocumentKind, string> = { QUOTE: "DEVIS", INVOICE: "FACTURE", CREDIT_NOTE: "AVOIR" };

const euro = (cents: number) => formatEuro(cents, { plain: true });
const day = (d: string) => formatDayLong(d, { weekday: false });

function legalFooter(seller: SellerSnapshot): string {
  const name = seller.legalName ?? seller.name;
  const parts = [
    seller.legalForm ? `${name}, ${seller.legalForm}${seller.shareCapital ? ` au capital de ${seller.shareCapital}` : ""}` : name,
    seller.siren ? `SIREN ${seller.siren}` : null,
    seller.rcs ? seller.rcs : null,
    seller.vatNumber ? `TVA ${seller.vatNumber}` : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

export async function renderDocumentPdf(data: PdfDocumentData): Promise<Buffer> {
  const accent = data.seller.brandColor ?? DEFAULT_ACCENT;
  const doc = new PDFDocument({
    size: "A4",
    margins: { top: 48, bottom: 48, left: LEFT, right: 595 - RIGHT },
    bufferPages: true,
    info: { Title: `${TITLES[data.kind]} ${data.number}`, Author: data.seller.name, Creator: "Aussitôt" },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ---- En-tête -------------------------------------------------------------
  let headerBottom = 48;
  if (data.logo) {
    try {
      doc.image(data.logo, LEFT, 44, { fit: [160, 56] });
      headerBottom = 44 + 56;
    } catch {
      /* logo illisible : on continue sans */
    }
  } else {
    doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text(data.seller.name, LEFT, 52, { width: 260 });
    headerBottom = doc.y;
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(22)
    .fillColor(accent)
    .text(TITLES[data.kind], 300, 44, { width: RIGHT - 300, align: "right", characterSpacing: 1.5 });
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(`N° ${data.number}`, 300, doc.y + 2, { width: RIGHT - 300, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`Émis le ${day(data.issueDate)}`, 300, doc.y + 2, { width: RIGHT - 300, align: "right" });
  let y = Math.max(headerBottom, doc.y) + 24;

  // ---- Émetteur / client ---------------------------------------------------
  const colW = (WIDTH - 20) / 2;
  const sellerLines = [
    ...data.seller.addressLines,
    [data.seller.phone, data.seller.email].filter(Boolean).join(" · "),
    data.seller.siret ? `SIRET ${data.seller.siret}` : data.seller.siren ? `SIREN ${data.seller.siren}` : "",
  ].filter(Boolean);
  doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text("ÉMETTEUR", LEFT, y, { characterSpacing: 0.8 });
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(INK)
    .text(data.seller.legalName ?? data.seller.name, LEFT, y + 13, { width: colW });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(INK)
    .text(sellerLines.join("\n"), LEFT, doc.y + 2, { width: colW, lineGap: 1.5 });
  const sellerBottom = doc.y;

  const clientX = LEFT + colW + 20;
  const clientLines = [
    data.client.contactName ? `À l'attention de ${data.client.contactName}` : "",
    ...data.client.addressLines,
    data.client.kind === "COMPANY" && data.client.siret
      ? `SIRET ${data.client.siret}`
      : data.client.kind === "COMPANY" && data.client.siren
        ? `SIREN ${data.client.siren}`
        : "",
    data.client.vatNumber ? `TVA ${data.client.vatNumber}` : "",
  ].filter(Boolean);
  const clientTextHeight =
    doc
      .font("Helvetica-Bold")
      .fontSize(10.5)
      .heightOfString(data.client.name, { width: colW - 28 }) +
    doc
      .font("Helvetica")
      .fontSize(9)
      .heightOfString(clientLines.join("\n") || " ", { width: colW - 28, lineGap: 1.5 }) +
    30;
  doc
    .roundedRect(clientX, y - 4, colW, clientTextHeight + 10, 8)
    .fillColor(SOFT)
    .fill();
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor(MUTED)
    .text("CLIENT", clientX + 14, y + 6, { characterSpacing: 0.8 });
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor(INK)
    .text(data.client.name, clientX + 14, y + 19, { width: colW - 28 });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(INK)
    .text(clientLines.join("\n"), clientX + 14, doc.y + 2, { width: colW - 28, lineGap: 1.5 });
  y = Math.max(sellerBottom, y + clientTextHeight + 6) + 18;

  // ---- Informations clés ---------------------------------------------------
  const infos: [string, string][] = [["Date d'émission", day(data.issueDate)]];
  if (data.secondaryDate) infos.push([data.kind === "QUOTE" ? "Valable jusqu'au" : "Échéance", day(data.secondaryDate)]);
  if (data.quoteNumber) infos.push(["Devis", data.quoteNumber]);
  if (data.creditedInvoiceNumber) infos.push(["Avoir sur la facture", data.creditedInvoiceNumber]);
  if (data.servicePeriod) infos.push(["Période", data.servicePeriod]);
  const cellW = WIDTH / Math.max(infos.length, 3);
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.6).strokeColor(LINE).stroke();
  infos.forEach(([label, value], i) => {
    doc
      .font("Helvetica")
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(label.toUpperCase(), LEFT + i * cellW, y + 8, { width: cellW - 8, characterSpacing: 0.5 });
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(INK)
      .text(value, LEFT + i * cellW, y + 20, { width: cellW - 8 });
  });
  y += 42;
  doc.moveTo(LEFT, y).lineTo(RIGHT, y).lineWidth(0.6).strokeColor(LINE).stroke();
  y += 16;

  if (data.title) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(data.title, LEFT, y, { width: WIDTH });
    y = doc.y + 4;
  }
  if (data.siteLabel) {
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`Lieu d'intervention : ${data.siteLabel}`, LEFT, y, { width: WIDTH });
    y = doc.y + 6;
  }
  y += 6;

  // ---- Lignes --------------------------------------------------------------
  const cols = {
    desc: { x: LEFT + 10, w: 232 },
    qty: { x: LEFT + 250, w: 62 },
    price: { x: LEFT + 318, w: 70 },
    vat: { x: LEFT + 392, w: 40 },
    total: { x: LEFT + 436, w: WIDTH - 446 },
  };
  const drawHeader = (top: number) => {
    doc.roundedRect(LEFT, top, WIDTH, 22, 5).fillColor(SOFT).fill();
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(MUTED);
    doc.text("DÉSIGNATION", cols.desc.x, top + 7, { width: cols.desc.w, characterSpacing: 0.5 });
    doc.text("QUANTITÉ", cols.qty.x, top + 7, { width: cols.qty.w, align: "right", characterSpacing: 0.5 });
    doc.text("PU HT", cols.price.x, top + 7, { width: cols.price.w, align: "right", characterSpacing: 0.5 });
    doc.text("TVA", cols.vat.x, top + 7, { width: cols.vat.w, align: "right", characterSpacing: 0.5 });
    doc.text("TOTAL HT", cols.total.x, top + 7, { width: cols.total.w, align: "right", characterSpacing: 0.5 });
    return top + 28;
  };
  y = drawHeader(y);
  for (const line of data.lines) {
    const descHeight = doc.font("Helvetica").fontSize(9).heightOfString(line.description, { width: cols.desc.w });
    const discountNote = line.discountBps ? `Remise ${formatVatRate(line.discountBps)}` : null;
    const rowHeight = Math.max(20, descHeight + (discountNote ? 12 : 0) + 10);
    if (y + rowHeight > BOTTOM) {
      doc.addPage();
      y = drawHeader(48);
    }
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(INK)
      .text(line.description, cols.desc.x, y + 4, { width: cols.desc.w });
    if (discountNote)
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(discountNote, cols.desc.x, doc.y + 1, { width: cols.desc.w });
    doc.font("Helvetica").fontSize(9).fillColor(INK);
    doc.text(`${formatQuantity(line.quantity, { plain: true })} ${unitShort(line.unit, Math.abs(line.quantity))}`, cols.qty.x, y + 4, {
      width: cols.qty.w,
      align: "right",
    });
    doc.text(euro(line.unitPriceCents), cols.price.x, y + 4, { width: cols.price.w, align: "right" });
    doc
      .fillColor(MUTED)
      .text(data.vatExempt ? "—" : formatVatRate(line.vatRateBps), cols.vat.x, y + 4, { width: cols.vat.w, align: "right" });
    doc
      .font("Helvetica-Bold")
      .fillColor(INK)
      .text(euro(line.totalHtCents), cols.total.x, y + 4, { width: cols.total.w, align: "right" });
    y += rowHeight;
    doc
      .moveTo(LEFT + 10, y)
      .lineTo(RIGHT - 10, y)
      .lineWidth(0.4)
      .strokeColor(LINE)
      .stroke();
  }

  // ---- Totaux --------------------------------------------------------------
  const totalsRows: [string, string][] = [["Total HT", euro(data.subtotalCents)]];
  if (!data.vatExempt) {
    for (const v of data.vatBreakdown) totalsRows.push([`TVA ${formatVatRate(v.rateBps)} sur ${euro(v.baseCents)}`, euro(v.vatCents)]);
  }
  const totalsHeight = totalsRows.length * 16 + 40 + (data.amountPaidCents ? 34 : 0);
  if (y + totalsHeight + 20 > BOTTOM) {
    doc.addPage();
    y = 48;
  }
  y += 14;
  const tx = LEFT + WIDTH * 0.48;
  const tw = RIGHT - tx;
  for (const [label, value] of totalsRows) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(label, tx, y, { width: tw * 0.62 });
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(INK)
      .text(value, tx + tw * 0.62, y, { width: tw * 0.38, align: "right" });
    y += 16;
  }
  doc
    .roundedRect(tx - 8, y + 2, tw + 8, 30, 6)
    .fillColor(accent)
    .fill();
  doc
    .font("Helvetica-Bold")
    .fontSize(10.5)
    .fillColor("#FFFFFF")
    .text(data.vatExempt ? "Total" : "Total TTC", tx + 4, y + 12, { width: tw * 0.5 });
  doc.text(euro(data.totalCents), tx + tw * 0.4, y + 12, { width: tw * 0.6 - 8, align: "right" });
  y += 42;
  if (data.amountPaidCents) {
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text("Déjà réglé", tx, y, { width: tw * 0.62 });
    doc.fillColor(INK).text(euro(data.amountPaidCents), tx + tw * 0.62, y, { width: tw * 0.38, align: "right" });
    y += 15;
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(INK)
      .text("Reste à payer", tx, y, { width: tw * 0.62 });
    doc.text(euro(data.totalCents - data.amountPaidCents), tx + tw * 0.62, y, { width: tw * 0.38, align: "right" });
    y += 19;
  }
  if (data.vatExempt) {
    doc
      .font("Helvetica-Oblique")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text("TVA non applicable, art. 293 B du CGI", tx - 8, y, { width: tw + 8, align: "right" });
    y = doc.y + 6;
  }
  if (data.paidOn) {
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#15803D")
      .text(`Facture acquittée le ${day(data.paidOn)}`, LEFT, y, { width: WIDTH });
    y = doc.y + 8;
  }

  // ---- Notes et conditions -------------------------------------------------
  const block = (title: string, body: string) => {
    const h =
      doc
        .font("Helvetica")
        .fontSize(8.5)
        .heightOfString(body, { width: WIDTH - 28, lineGap: 1.5 }) + 34;
    if (y + h > BOTTOM) {
      doc.addPage();
      y = 48;
    }
    doc.roundedRect(LEFT, y, WIDTH, h, 8).lineWidth(0.6).strokeColor(LINE).stroke();
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(accent)
      .text(title.toUpperCase(), LEFT + 14, y + 11, { characterSpacing: 0.6 });
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(INK)
      .text(body, LEFT + 14, y + 25, { width: WIDTH - 28, lineGap: 1.5 });
    y += h + 10;
  };

  if (data.notes) block("Informations", data.notes);

  if (data.kind === "QUOTE") {
    block(
      "Bon pour accord",
      "Pour accepter ce devis, retournez-le daté et signé, précédé de la mention manuscrite « Bon pour accord ».\n\nDate :                                   Signature et cachet :",
    );
  } else if (data.kind === "INVOICE") {
    const isB2B = data.client.kind === "COMPANY";
    const terms = [
      data.secondaryDate ? `Paiement attendu au plus tard le ${day(data.secondaryDate)}.` : null,
      data.seller.iban
        ? `Règlement par virement : IBAN ${data.seller.iban.replace(/(.{4})/g, "$1 ").trim()}${data.seller.bic ? ` · BIC ${data.seller.bic}` : ""} — référence ${data.number}.`
        : null,
      `En cas de retard de paiement : pénalités au ${data.seller.latePenaltyText ?? "taux d'intérêt appliqué par la Banque centrale européenne à son opération de refinancement la plus récente, majoré de 10 points"}.`,
      isB2B ? "Indemnité forfaitaire pour frais de recouvrement en cas de retard : 40 € (art. L441-10 du Code de commerce)." : null,
      "Pas d'escompte pour paiement anticipé.",
    ].filter(Boolean);
    block("Conditions de paiement", terms.join("\n"));
  }

  // ---- Pied de page (toutes les pages) -------------------------------------
  const footer = legalFooter(data.seller);
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Le pied de page est sous la marge basse : sans cela, PDFKit ouvrirait une page vide.
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(7).fillColor(MUTED);
    doc.text(footer, LEFT, 842 - 40, { width: WIDTH - 60, lineBreak: false, height: 10, ellipsis: true });
    doc.text(`Page ${i + 1} / ${range.count}`, RIGHT - 60, 842 - 40, { width: 60, align: "right", lineBreak: false });
  }

  doc.end();
  return done;
}
