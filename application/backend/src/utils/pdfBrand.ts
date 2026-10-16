import fs from "node:fs";
import { companyDateLabel, companyTimeKey } from "./companyTime";
import path from "node:path";

// Logo pré-redimensionné/recadré (voir src/assets/brand/README pour la
// commande sharp utilisée) : ~8 Ko, pour que le PDF reste léger même avec le
// logo intégré sur chaque page — jamais le fichier source (1254×1254, ~400 Ko).
// Logo officiel (goutte bleue) — vectorisé depuis le logo fourni par le
// client (sources .svg dans mobile/assets/brand).
const LOGO_PATH = path.join(__dirname, "../assets/brand/drop.png");
export const logoExists = fs.existsSync(LOGO_PATH);
export const DROP_PATH = LOGO_PATH;
export const TITLE_PATH = path.join(__dirname, "../assets/brand/title.png"); // « DEEPCLEAN », 1200 × 168
export const TAGLINE_PATH = path.join(__dirname, "../assets/brand/tagline.png"); // slogan, 1200 × 59
// Médaillon officiel (cercle, vagues, goutte), le même que l'icône de l'app.
export const EMBLEM_PATH = path.join(__dirname, "../assets/brand/emblem.png"); // 480 × 480
const hasEmblem = fs.existsSync(EMBLEM_PATH);
const hasTitle = fs.existsSync(TITLE_PATH);
const hasTagline = fs.existsSync(TAGLINE_PATH);

// Palette reprise de mobile/src/theme/colors.ts (thème clair) : même identité
// visuelle que l'application, jamais des couleurs choisies indépendamment.
export const BRAND = {
  // Couleurs du logo : bleu marine (« DEEP », cercle) et bleu clair
  // (« CLEAN », goutte).
  accent: "#1E9CC6",
  accentDeep: "#1F2D69",
  accentSoft: "#E8F4FA",
  ink: "#141A33",
  inkSecondary: "#56607A",
  inkTertiary: "#8B93A7",
  border: "#DCE4EE",
  rowAlt: "#F4F8FB",
  white: "#FFFFFF",
  danger: "#B42318",
  success: "#067647",
};

export const PAGE_LEFT = 40;
export const PAGE_RIGHT = 555; // A4 (595pt) - marge droite de 40
export const CONTENT_WIDTH = PAGE_RIGHT - PAGE_LEFT;
export const HEADER_HEIGHT = 82;
export const DOC_TOP = 128; // début du contenu sous l'en-tête de marque
// A4 fait 842pt de haut ; avec une marge de 40, PDFKit considère le bas de
// page utilisable jusqu'à 802 et déclenche un SAUT DE PAGE AUTOMATIQUE dès
// qu'un `.text()` dépasserait cette limite — même en position absolue (x, y
// explicites), même pour une simple ligne de pied de page. Un FOOTER_Y trop
// proche de cette limite faisait apparaître des pages blanches
// supplémentaires en fin de document (chaque appel `.text()` du pied de page
// déclenchait son propre saut de page) : confirmé en générant un vrai PDF et
// en l'inspectant page par page, pas en lisant le code (voir
// modules/timesheets/timesheets.export.ts, où ce bug a été trouvé et
// corrigé). 770 laisse une marge confortable sous le texte (fontSize 8, une
// ligne) avant la limite de 802.
export const FOOTER_Y = 770;

/**
 * En-tête de marque des documents internes (relevé d'heures, dossier
 * salarié) — retour explicite du client : aux couleurs de Deep Clean, avec
 * le vrai logo. Les devis et factures gardent leur propre en-tête
 * (utils/pdfCommercial.ts), validé tel quel par le client. À gauche le logo officiel
 * (médaillon + « DEEPCLEAN » + slogan), à droite le type de document, sa
 * référence (numéro ou période) et une ligne de détail ; dessous, le double
 * filet marine / bleu clair du logo. À redessiner sur chaque page (voir
 * 'pageAdded' côté appelant).
 */
export function drawBrandHeader(doc: PDFKit.PDFDocument, kind: string, reference?: string, detail?: string): void {
  const top = 34;
  if (hasEmblem) doc.image(EMBLEM_PATH, PAGE_LEFT, top - 1, { width: 56, height: 56 });
  const textX = PAGE_LEFT + (hasEmblem ? 66 : 0);
  if (hasTitle) doc.image(TITLE_PATH, textX, top + 10, { width: 170 }); // ~24 pt de haut
  else doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(22).text("DEEPCLEAN", textX, top + 9);
  if (hasTagline) doc.image(TAGLINE_PATH, textX + 1, top + 39, { width: 168 });

  // Côté droit : jamais plus large que la place laissée par le logo.
  const rightX = PAGE_LEFT + 250;
  const rightW = PAGE_RIGHT - rightX;
  const kindSize = kind.length > 18 ? 15 : kind.length > 12 ? 18 : 22;
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(kindSize).text(kind, rightX, top + 4 + (22 - kindSize) / 2, { width: rightW, align: "right", characterSpacing: 1.5, lineBreak: false });
  if (reference) doc.fillColor(BRAND.accent).font("Helvetica-Bold").fontSize(10.5).text(reference, rightX, top + 32, { width: rightW, align: "right", lineBreak: false });
  if (detail) doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(8.5).text(detail, rightX, top + 48, { width: rightW, align: "right", lineBreak: false });

  // Double filet aux deux couleurs du logo.
  const lineY = top + 70;
  doc.rect(PAGE_LEFT, lineY, CONTENT_WIDTH * 0.62, 2.5).fill(BRAND.accentDeep);
  doc.rect(PAGE_LEFT + CONTENT_WIDTH * 0.62, lineY, CONTENT_WIDTH * 0.38, 2.5).fill(BRAND.accent);
  doc.y = DOC_TOP;
}

/** Date et heure de génération, pour la ligne de détail de l'en-tête des documents internes. */
export function generatedAtLabel(now = new Date()): string {
  return `Édité le ${companyDateLabel(now)} à ${companyTimeKey(now)}`;
}

/** Titre de section : petit trait bleu clair puis intitulé marine en capitales. */
export function drawSectionTitle(doc: PDFKit.PDFDocument, title: string, note?: string): void {
  const y = doc.y;
  doc.rect(PAGE_LEFT, y + 1, 3, 12).fill(BRAND.accent);
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(10).text(title.toUpperCase(), PAGE_LEFT + 10, y + 2, { width: CONTENT_WIDTH - 10, characterSpacing: 0.8 });
  if (note) doc.fillColor(BRAND.inkTertiary).font("Helvetica").fontSize(8).text(note, PAGE_LEFT + 10, doc.y + 2, { width: CONTENT_WIDTH - 10 });
  doc.y += 8;
}

/**
 * Rangée de chiffres clés en cartes arrondies (bleu très clair, chiffre
 * marine) — la première carte, mise en avant, est en marine plein.
 */
export function drawKpiCards(doc: PDFKit.PDFDocument, items: { label: string; value: string; tone?: "danger" | "muted" }[]): void {
  if (items.length === 0) return;
  const top = doc.y;
  const gap = 10;
  const width = (CONTENT_WIDTH - gap * (items.length - 1)) / items.length;
  const height = 50;
  items.forEach((item, i) => {
    const x = PAGE_LEFT + i * (width + gap);
    const lead = i === 0;
    doc.roundedRect(x, top, width, height, 8).fill(lead ? BRAND.accentDeep : BRAND.accentSoft);
    const valueColor = lead ? BRAND.white : item.tone === "danger" ? BRAND.danger : item.tone === "muted" ? BRAND.inkTertiary : BRAND.accentDeep;
    doc.fillColor(valueColor).font("Helvetica-Bold").fontSize(15).text(item.value, x + 12, top + 10, { width: width - 24, lineBreak: false });
    doc.fillColor(lead ? "#BFE6F5" : BRAND.inkSecondary).font("Helvetica").fontSize(7.5).text(item.label.toUpperCase(), x + 12, top + 32, { width: width - 24, characterSpacing: 0.5, lineBreak: false });
  });
  doc.y = top + height + 20;
}

/** En-tête de tableau : bandeau marine, coins arrondis. */
export function drawTableHeaderBar(doc: PDFKit.PDFDocument, y: number, columns: { label: string; x: number; width: number; align?: "left" | "right" }[], height = 22): void {
  doc.roundedRect(PAGE_LEFT, y, CONTENT_WIDTH, height, 6).fill(BRAND.accentDeep);
  doc.fillColor(BRAND.white).font("Helvetica-Bold").fontSize(8);
  for (const c of columns) doc.text(c.label, c.x, y + (height - 7) / 2, { width: c.width, align: c.align ?? "left", characterSpacing: 0.5, lineBreak: false });
}

/** Pied de page — le libellé (ex. "Page 2 sur 3") est calculé par l'appelant, voir `finalizePagination`. */
export const INTERNAL_FOOTER = "Deep Clean · document interne et confidentiel, généré automatiquement.";

/**
 * Pied de page des devis et factures, laissé tel quel (retour explicite du
 * client : « le devis et la facture, c'est top ») — filet gris, texte gris.
 */
function drawCommercialFooter(doc: PDFKit.PDFDocument, pageLabel: string, footerText: string): void {
  doc.moveTo(PAGE_LEFT, FOOTER_Y).lineTo(PAGE_RIGHT, FOOTER_Y).strokeColor(BRAND.border).lineWidth(1).stroke();
  doc
    .fillColor(BRAND.inkTertiary)
    .font("Helvetica")
    .fontSize(8)
    .text(footerText.length > 105 ? `${footerText.slice(0, 104)}…` : footerText, PAGE_LEFT, FOOTER_Y + 8, {
      width: CONTENT_WIDTH * 0.8,
      lineBreak: false,
    });
  doc.text(pageLabel, PAGE_LEFT, FOOTER_Y + 8, { width: CONTENT_WIDTH, align: "right" });
}

/** Pied de page des documents internes (relevé d'heures, dossier salarié), aux couleurs du logo. */
export function drawFooter(doc: PDFKit.PDFDocument, pageLabel: string, footerText: string = INTERNAL_FOOTER): void {
  // Filet fin aux deux couleurs du logo, rappel de l'en-tête.
  doc.rect(PAGE_LEFT, FOOTER_Y, CONTENT_WIDTH * 0.62, 0.8).fill(BRAND.accentDeep);
  doc.rect(PAGE_LEFT + CONTENT_WIDTH * 0.62, FOOTER_Y, CONTENT_WIDTH * 0.38, 0.8).fill(BRAND.accent);
  if (hasEmblem) doc.image(EMBLEM_PATH, PAGE_LEFT, FOOTER_Y + 6, { width: 11, height: 11 });
  const textX = PAGE_LEFT + (hasEmblem ? 16 : 0);
  doc
    .fillColor(BRAND.inkTertiary)
    .font("Helvetica")
    .fontSize(8)
    // Une seule ligne, jamais plus : un texte qui passe à la ligne sous le
    // pied de page déclenche un saut de page (page blanche en trop).
    .text(footerText.length > 100 ? `${footerText.slice(0, 99)}…` : footerText, textX, FOOTER_Y + 8, {
      width: CONTENT_WIDTH * 0.8 - 16,
      lineBreak: false,
    });
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").text(pageLabel, PAGE_LEFT, FOOTER_Y + 8, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
}

/**
 * Numérotation finale ("Page X sur Y") sur toutes les pages déjà générées —
 * le nombre total de pages n'est connu qu'une fois tout le contenu écrit
 * (document construit avec `bufferPages: true`), donc appelé juste avant
 * `doc.end()`, jamais pendant l'écriture du contenu.
 */
export function finalizePagination(doc: PDFKit.PDFDocument, commercialFooter?: string): void {
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(i);
    const label = `Page ${i + 1} sur ${pageRange.count}`;
    // Devis et factures (identité légale de l'entreprise en pied de page) :
    // présentation d'origine ; documents internes : pied de page de marque.
    if (commercialFooter) drawCommercialFooter(doc, label, commercialFooter);
    else drawFooter(doc, label);
  }
}

/** Si la prochaine ligne ne tient plus au-dessus du pied de page, saute à une nouvelle page et relance `redrawSectionHeader`. */
export function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number, redrawSectionHeader: () => void): void {
  if (doc.y + neededHeight > FOOTER_Y) {
    doc.addPage();
    redrawSectionHeader();
  }
}

// Montant en euros pour les PDF. Le format français sépare les milliers par
// une espace fine insécable (U+202F) que les polices standard des PDF
// (Helvetica) ne contiennent pas : elle sortait en « / » (« 1 /008,00 € »)
// sur les devis et factures. Remplacée ici par une espace insécable
// classique, présente dans la police.
const euroFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
export function formatEuroPdf(amount: number): string {
  return euroFormatter.format(amount).replace(/[\u202f\u2009]/g, "\u00a0");
}
