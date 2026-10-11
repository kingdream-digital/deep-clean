/**
 * Couleurs de marque des entreprises clientes : quelle que soit la couleur
 * choisie dans les réglages, les documents restent lisibles (contrastes
 * WCAG), le texte s'adapte à la couleur et non l'inverse.
 */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative (WCAG 2) d'une couleur « #RRGGBB ». */
export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r ?? 0) + 0.7152 * channel(g ?? 0) + 0.0722 * channel(b ?? 0);
}

/** Rapport de contraste entre deux couleurs (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Texte à poser sur un aplat de cette couleur : blanc si assez contrasté (≥ 4,5:1), sinon encre foncée. */
export function readableTextOn(hex: string, dark = "#0F172A"): string {
  return contrastRatio(hex, "#FFFFFF") >= 4.5 ? "#FFFFFF" : dark;
}

/** Couleur utilisable pour du TEXTE sur fond blanc (grand titre : ≥ 3:1), sinon encre foncée. */
export function brandTextOnWhite(hex: string, dark = "#0F172A"): string {
  return contrastRatio(hex, "#FFFFFF") >= 3 ? hex : dark;
}

/** Couleurs proposées dans les réglages (toutes lisibles avec du texte blanc). */
export const BRAND_COLOR_PRESETS = ["#2347F5", "#4338CA", "#0E7490", "#15803D", "#B45309", "#B91C1C", "#BE185D", "#334155"] as const;
