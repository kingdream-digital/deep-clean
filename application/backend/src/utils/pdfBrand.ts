import fs from "node:fs";
import { companyDateLabel, companyTimeKey } from "./companyTime";
import path from "node:path";

// Logo pré-redimensionné/recadré (voir src/assets/brand/README pour la
// commande sharp utilisée) : ~8 Ko, pour que le PDF reste léger même avec le
// logo intégré sur chaque page — jamais le fichier source (1254×1254, ~400 Ko).
const LOGO_PATH = path.join(__dirname, "../assets/brand/logo-mark.png");
export const logoExists = fs.existsSync(LOGO_PATH);

// Palette reprise de mobile/src/theme/colors.ts (thème clair) : même identité
// visuelle que l'application, jamais des couleurs choisies indépendamment.
export const BRAND = {
  accent: "#0E7490",
  accentDeep: "#0B5A70",
  ink: "#101322",
  inkSecondary: "#5B6472",
  inkTertiary: "#8891A0",
  border: "#E6E9EF",
  rowAlt: "#F4F7F9",
  white: "#FFFFFF",
  danger: "#B42318",
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
    doc.image(LOGO_PATH, PAGE_LEFT, 34, { height: 28 });
  }
  const textX = logoExists ? PAGE_LEFT + 34 : PAGE_LEFT;
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
export function drawFooter(doc: PDFKit.PDFDocument, pageLabel: string): void {
  doc.moveTo(PAGE_LEFT, FOOTER_Y).lineTo(PAGE_RIGHT, FOOTER_Y).strokeColor(BRAND.border).lineWidth(1).stroke();
  doc
    .fillColor(BRAND.inkTertiary)
    .font("Helvetica")
    .fontSize(8)
    .text("Deep Clean — document à usage interne, généré automatiquement.", PAGE_LEFT, FOOTER_Y + 8, {
      width: CONTENT_WIDTH / 2,
    });
  doc.text(pageLabel, PAGE_LEFT, FOOTER_Y + 8, { width: CONTENT_WIDTH, align: "right" });
}

/**
 * Numérotation finale ("Page X sur Y") sur toutes les pages déjà générées —
 * le nombre total de pages n'est connu qu'une fois tout le contenu écrit
 * (document construit avec `bufferPages: true`), donc appelé juste avant
 * `doc.end()`, jamais pendant l'écriture du contenu.
 */
export function finalizePagination(doc: PDFKit.PDFDocument): void {
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(i);
    drawFooter(doc, `Page ${i + 1} sur ${pageRange.count}`);
  }
}

/** Si la prochaine ligne ne tient plus au-dessus du pied de page, saute à une nouvelle page et relance `redrawSectionHeader`. */
export function ensureSpace(doc: PDFKit.PDFDocument, neededHeight: number, redrawSectionHeader: () => void): void {
  if (doc.y + neededHeight > FOOTER_Y) {
    doc.addPage();
    redrawSectionHeader();
  }
}
