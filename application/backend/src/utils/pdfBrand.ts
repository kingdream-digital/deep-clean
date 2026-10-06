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

/** En-tête de marque Deep Clean — à redessiner sur chaque page (voir 'pageAdded' côté appelant). */
export function drawHeader(doc: PDFKit.PDFDocument, title: string, subtitle: string): void {
  if (logoExists) {
    // Hauteur de dessin fixe (28pt) ; la largeur suit le ratio réel du fichier
    // (recadré non carré, voir src/assets/brand/logo-mark.png) plutôt qu'un
    // carré forcé qui l'étirerait.
    doc.image(LOGO_PATH, PAGE_LEFT, 32, { height: 32 });
  }
  const textX = logoExists ? PAGE_LEFT + 32 : PAGE_LEFT;
  doc.fillColor(BRAND.accentDeep).font("Helvetica-Bold").fontSize(17).text(title, textX, 36);
  doc.fillColor(BRAND.inkSecondary).font("Helvetica").fontSize(10).text(subtitle, textX, 57);

  const now = new Date();
  const generatedAt = `Généré le ${companyDateLabel(now)} à ${companyTimeKey(now)}`;
  doc
    .fillColor(BRAND.inkTertiary)
    .font("Helvetica")
    .fontSize(8)
    .text(generatedAt, PAGE_LEFT, 40, { width: CONTENT_WIDTH, align: "right" });

  doc.moveTo(PAGE_LEFT, HEADER_HEIGHT).lineTo(PAGE_RIGHT, HEADER_HEIGHT).strokeColor(BRAND.accent).lineWidth(1.5).stroke();
  doc.y = HEADER_HEIGHT + 20;
}

/** Pied de page — le libellé (ex. "Page 2 sur 3") est calculé par l'appelant, voir `finalizePagination`. */
export const INTERNAL_FOOTER = "Deep Clean — document à usage interne, généré automatiquement.";

export function drawFooter(doc: PDFKit.PDFDocument, pageLabel: string, footerText: string = INTERNAL_FOOTER): void {
  doc.moveTo(PAGE_LEFT, FOOTER_Y).lineTo(PAGE_RIGHT, FOOTER_Y).strokeColor(BRAND.border).lineWidth(1).stroke();
  doc
    .fillColor(BRAND.inkTertiary)
    .font("Helvetica")
    .fontSize(8)
    // Une seule ligne, jamais plus : un texte qui passe à la ligne sous le
    // pied de page déclenche un saut de page (page blanche en trop).
    .text(footerText.length > 105 ? `${footerText.slice(0, 104)}…` : footerText, PAGE_LEFT, FOOTER_Y + 8, {
      width: CONTENT_WIDTH * 0.8,
      lineBreak: false,
    });
  doc.text(pageLabel, PAGE_LEFT, FOOTER_Y + 8, { width: CONTENT_WIDTH, align: "right" });
}

/**
 * Numérotation finale ("Page X sur Y") sur toutes les pages déjà générées —
 * le nombre total de pages n'est connu qu'une fois tout le contenu écrit
 * (document construit avec `bufferPages: true`), donc appelé juste avant
 * `doc.end()`, jamais pendant l'écriture du contenu.
 */
export function finalizePagination(doc: PDFKit.PDFDocument, footerText?: string): void {
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc, `Page ${i + 1} sur ${pageRange.count}`, footerText);
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
  return euroFormatter.format(amount).replace(/[  ]/g, " ");
}
