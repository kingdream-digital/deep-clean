import sharp from "sharp";

/**
 * Couleur la plus présente d'un logo, hors fond et hors gris (transparent,
 * blanc, noir…) : proposée à l'entreprise comme couleur de ses documents.
 * Null pour un logo en noir et blanc. Calcul sur une miniature échantillonnée
 * sans lissage : les couleurs restent exactes.
 */
export async function logoAccentColor(image: Buffer): Promise<string | null> {
  const { data } = await sharp(image)
    .resize(96, 96, { fit: "inside", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  // 1. Teintes voisines regroupées (8 niveaux par canal) : le groupe le plus fourni l'emporte.
  const groups = new Map<number, Map<number, number>>();
  const counts = new Map<number, number>();
  let opaque = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (data[i + 3]! < 160) continue;
    opaque += 1;
    const max = Math.max(r, g, b);
    const saturation = max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
    if (max < 40 || saturation < 0.25) continue;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const exact = (r << 16) | (g << 8) | b;
    const colors = groups.get(key) ?? new Map<number, number>();
    colors.set(exact, (colors.get(exact) ?? 0) + 1);
    groups.set(key, colors);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let bestKey: number | null = null;
  for (const [key, count] of counts) if (bestKey === null || count > counts.get(bestKey)!) bestKey = key;
  if (bestKey === null || counts.get(bestKey)! < Math.max(8, opaque * 0.01)) return null;
  // 2. Dans ce groupe, la couleur exacte la plus fréquente.
  let best = 0;
  let bestCount = 0;
  for (const [color, count] of groups.get(bestKey)!) if (count > bestCount) [best, bestCount] = [color, count];
  return `#${best.toString(16).padStart(6, "0").toUpperCase()}`;
}
