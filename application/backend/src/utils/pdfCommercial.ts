import fs from "node:fs";
import { BRAND, CONTENT_WIDTH, DROP_PATH, FOOTER_Y, PAGE_LEFT, PAGE_RIGHT, TAGLINE_PATH, TITLE_PATH, formatEuroPdf } from "./pdfBrand";

// Mise en page commune des devis et factures envoyés aux clients, aux couleurs
// du logo Deep Clean (marine et bleu clair) : en-tête avec le logo complet,
// cartes Émetteur / Client, bandeau d'informations, tableau, bloc de totaux.

const hasDrop = fs.existsSync(DROP_PATH);
const hasTitle = fs.existsSync(TITLE_PATH);
const hasTagline = fs.existsSync(TAGLINE_PATH);

export const DOC_TOP = 128; // début du contenu sous l'en-tête

/** En-tête (à redessiner sur chaque page) : logo à gauche, type et numéro à droite. */
export function drawCommercialHeader(doc: PDFKit.PDFDocument, kind: "FACTURE" | "DEVIS", number: string, subtitle?: string): void {
  const top = 34;
  if (hasDrop) doc.image(DROP_PATH, PAGE_LEFT, top, { height: 54 });
  const textX = PAGE_LEFT + (hasDrop ? 46 : 0);
  if (hasTitle) doc.image(TITLE_PATH, textX, top + 9, { width: 178 }); // ~25 pt de haut
  else doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(22).text("DEEPCLEAN", textX, top + 8);
  if (hasTagline) doc.image(TAGLINE_PATH, textX + 1, top + 40, { width: 176 });

  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(22).text(kind, PAGE_LEFT, top + 4, { width: CONTENT_WIDTH, align: "right", characterSpacing: 2 });
  doc.fillColor(BRAND.accent).font("Helvetica-Bold").fontSize(11).text(`N° ${number}`, PAGE_LEFT, top + 32, { width: CONTENT_WIDTH, align: "right" });
  if (subtitle) {
    doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(8.5).text(subtitle, PAGE_RIGHT - 260, top + 48, { width: 260, align: "right", lineBreak: false });
  }

  // Double filet aux deux couleurs du logo.
  const lineY = top + 70;
  doc.rect(PAGE_LEFT, lineY, CONTENT_WIDTH * 0.62, 2.5).fill(BRAND.accentDeep);
  doc.rect(PAGE_LEFT + CONTENT_WIDTH * 0.62, lineY, CONTENT_WIDTH * 0.38, 2.5).fill(BRAND.accent);
  doc.y = DOC_TOP;
}

/** Deux cartes côte à côte : Émetteur et Client. Renvoie le bas des cartes. */
export function drawParties(doc: PDFKit.PDFDocument, seller: string[], client: { name: string; lines: string[] }): number {
  const top = doc.y;
  const gap = 14;
  const width = (CONTENT_WIDTH - gap) / 2;
  const measure = (lines: string[], bold?: string) => {
    let h = 26;
    if (bold) h += doc.font("Helvetica-Bold").fontSize(10).heightOfString(bold, { width: width - 24 }) + 2;
    for (const l of lines) h += doc.font("Helvetica").fontSize(8.5).heightOfString(l, { width: width - 24 }) + 1;
    return h + 10;
  };
  const height = Math.max(measure(seller.slice(1), seller[0]), measure(client.lines, client.name));

  const card = (x: number, label: string, title: string, lines: string[], filled: boolean) => {
    doc.roundedRect(x, top, width, height, 8).fill(filled ? BRAND.accentSoft : BRAND.rowAlt);
    doc.rect(x, top + 10, 3, 18).fill(filled ? BRAND.accent : BRAND.accentDeep);
    doc.fillColor(filled ? BRAND.accent : BRAND.accentDeep).font("Helvetica-Bold").fontSize(7.5).text(label, x + 12, top + 10, { width: width - 24, characterSpacing: 1.2 });
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(10).text(title, x + 12, top + 24, { width: width - 24 });
    doc.font("Helvetica").fontSize(8.5).fillColor(BRAND.inkSecondary);
    for (const l of lines) doc.text(l, x + 12, doc.y + 1, { width: width - 24 });
  };
  card(PAGE_LEFT, "ÉMETTEUR", seller[0] ?? "", seller.slice(1), false);
  card(PAGE_LEFT + width + gap, "CLIENT", client.name, client.lines, true);
  doc.y = top + height + 14;
  return doc.y;
}

/** Bandeau d'informations (dates, échéance, chantier…) en colonnes. */
export function drawInfoStrip(doc: PDFKit.PDFDocument, items: { label: string; value: string }[]): void {
  if (items.length === 0) return;
  const top = doc.y;
  const width = CONTENT_WIDTH / items.length;
  const heights = items.map((i) => doc.font("Helvetica-Bold").fontSize(9).heightOfString(i.value, { width: width - 16 }));
  const height = 26 + Math.max(...heights);
  doc.roundedRect(PAGE_LEFT, top, CONTENT_WIDTH, height, 8).lineWidth(1).strokeColor(BRAND.border).stroke();
  items.forEach((item, index) => {
    const x = PAGE_LEFT + index * width;
    if (index > 0) doc.moveTo(x, top + 8).lineTo(x, top + height - 8).strokeColor(BRAND.border).stroke();
    doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(7.5).text(item.label.toUpperCase(), x + 10, top + 8, { width: width - 16, characterSpacing: 0.6 });
    doc.fillColor(BRAND.ink).font("Helvetica-Bold").fontSize(9).text(item.value, x + 10, top + 20, { width: width - 16 });
  });
  doc.y = top + height + 16;
}

/** En-tête de tableau, marine, coins arrondis en haut. */
export function drawTableHeader(doc: PDFKit.PDFDocument, y: number, columns: { label: string; x: number; width: number; align?: "left" | "right" }[]): void {
  doc.roundedRect(PAGE_LEFT, y, CONTENT_WIDTH, 22, 6).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(8);
  for (const c of columns) doc.text(c.label, c.x, y + 7.5, { width: c.width, align: c.align ?? "left", characterSpacing: 0.5 });
}

/**
 * Bloc des totaux à droite : lignes simples puis le total mis en avant dans un
 * cartouche marine. `highlight` = la ligne principale (ex. Total TTC).
 */
export function drawTotals(doc: PDFKit.PDFDocument, rows: { label: string; value: string }[], highlight: { label: string; value: string }, extra?: { label: string; value: string }[]): void {
  const width = 240;
  const x = PAGE_RIGHT - width;
  let y = doc.y + 6;
  for (const r of rows) {
    doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(9.5).text(r.label, x + 12, y, { width: 140 });
    doc.fillColor(BRAND.ink).text(r.value, x + 140, y, { width: width - 152, align: "right" });
    y += 15;
  }
  y += 4;
  doc.roundedRect(x, y, width, 32, 8).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(11).text(highlight.label, x + 12, y + 10, { width: 120 });
  doc.fontSize(13).text(highlight.value, x + 110, y + 9, { width: width - 122, align: "right" });
  y += 32;
  for (const r of extra ?? []) {
    y += 6;
    doc.roundedRect(x, y, width, 26, 8).fill(BRAND.accentSoft);
    doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(9.5).text(r.label, x + 12, y + 8.5, { width: 140 });
    doc.fillColor(BRAND.accent).text(r.value, x + 140, y + 8.5, { width: width - 152, align: "right" });
    y += 26;
  }
  doc.y = y + 18;
}

/** Encart titré (conditions, mentions) sur fond très clair. */
export function drawNoteBox(doc: PDFKit.PDFDocument, title: string, lines: string[]): void {
  const text = lines.join("\n");
  const height = doc.font("Helvetica").fontSize(8.5).heightOfString(text, { width: CONTENT_WIDTH - 28, lineGap: 1.5 }) + 34;
  if (doc.y + height > FOOTER_Y - 10) doc.addPage();
  const top = doc.y;
  doc.roundedRect(PAGE_LEFT, top, CONTENT_WIDTH, height, 8).fill(BRAND.rowAlt);
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(9).text(title, PAGE_LEFT + 14, top + 11, { width: CONTENT_WIDTH - 28 });
  doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(8.5).text(text, PAGE_LEFT + 14, top + 26, { width: CONTENT_WIDTH - 28, lineGap: 1.5 });
  doc.y = top + height + 12;
}

/** Tampon « Facture acquittée ». */
export function drawPaidStamp(doc: PDFKit.PDFDocument, label: string): void {
  const top = doc.y;
  doc.roundedRect(PAGE_LEFT, top, 230, 28, 8).lineWidth(1.5).strokeColor(BRAND.success).stroke();
  doc.fillColor(BRAND.success).font("Helvetica-Bold").fontSize(10.5).text(label, PAGE_LEFT, top + 9, { width: 230, align: "center" });
  doc.y = top + 40;
}

export { formatEuroPdf };
