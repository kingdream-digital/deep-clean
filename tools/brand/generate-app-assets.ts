// Génère les visuels de l'application à partir des tracés vectoriels du logo
// officiel (mobile/src/components/brandArtwork.ts) — jamais à la main, pour
// qu'ils restent fidèles à la charte : marine #1F2D69, bleu #2A4F8E, bleu
// vagues #5A9CC4, bleu goutte #1E9CC6, blanc.
//
// Lancer depuis la racine du dépôt :
//   application/backend/node_modules/.bin/tsx tools/brand/generate-app-assets.ts
//
// Produit :
// - application/mobile/assets/splash-icon.png        écran de lancement (médaillon + halo, fond transparent)
// - application/mobile/assets/android-icon-monochrome.png  icône thématique Android 13+ (silhouette blanche)
// - application/mobile/assets/brand/notification-icon.png  petite icône des notifications Android
// - application/presentation/store/google-banniere-1024x500.png  bannière de la fiche Google Play
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BRAND_ART, TAGLINE_VIEWBOX, TITLE_VIEWBOX } from "../../application/mobile/src/components/brandArtwork";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
// sharp est déjà une dépendance du serveur : pas de nouvelle installation.
const sharp = createRequire(path.join(root, "application/backend/package.json"))("sharp") as typeof import("sharp");

const NAVY = "#1F2D69";
const MID = "#2A4F8E";
const LIGHT = "#5A9CC4";
const DROP = "#1E9CC6";

const E = BRAND_ART.emblem;

/** Médaillon complet, centré en (cx, cy), de diamètre extérieur `d`. */
function emblem(cx: number, cy: number, d: number): string {
  const outer = E.ringR + E.ringWidth / 2;
  const scale = d / 2 / outer;
  return `<g transform="translate(${cx - E.cx * scale} ${cy - E.cy * scale}) scale(${scale})">
    <circle cx="${E.cx}" cy="${E.cy}" r="${E.ringR}" fill="#FFFFFF"/>
    <path d="${E.waveNavy}" fill="${NAVY}" fill-rule="evenodd"/>
    <path d="${E.waveMid}" fill="${MID}" fill-rule="evenodd"/>
    <path d="${E.waveLight}" fill="${LIGHT}" fill-rule="evenodd"/>
    <path d="${E.drop}" fill="${DROP}" fill-rule="evenodd"/>
    <circle cx="${E.cx}" cy="${E.cy}" r="${E.ringR}" fill="none" stroke="${NAVY}" stroke-width="${E.ringWidth}"/>
  </g>`;
}

/** Silhouette blanche du médaillon (cercle, vagues, goutte) pour les icônes teintées par le système. */
function emblemSilhouette(cx: number, cy: number, d: number): string {
  const outer = E.ringR + E.ringWidth / 2;
  const scale = d / 2 / outer;
  return `<g transform="translate(${cx - E.cx * scale} ${cy - E.cy * scale}) scale(${scale})" fill="#FFFFFF">
    <path d="${E.waveNavy}" fill-rule="evenodd"/>
    <path d="${E.waveMid}" fill-rule="evenodd"/>
    <path d="${E.waveLight}" fill-rule="evenodd"/>
    <path d="${E.drop}" fill-rule="evenodd"/>
    <circle cx="${E.cx}" cy="${E.cy}" r="${E.ringR}" fill="none" stroke="#FFFFFF" stroke-width="${E.ringWidth * 1.4}"/>
  </g>`;
}

function title(x: number, y: number, width: number): string {
  const s = width / TITLE_VIEWBOX.w;
  return `<g transform="translate(${x - TITLE_VIEWBOX.x * s} ${y - TITLE_VIEWBOX.y * s}) scale(${s})">
    <path d="${BRAND_ART.title.deep}" fill="${NAVY}" fill-rule="evenodd"/>
    <path d="${BRAND_ART.title.clean}" fill="${DROP}" fill-rule="evenodd"/>
  </g>`;
}

function tagline(x: number, y: number, width: number, color: string): string {
  const s = width / TAGLINE_VIEWBOX.w;
  return `<g transform="translate(${x - TAGLINE_VIEWBOX.x * s} ${y - TAGLINE_VIEWBOX.y * s}) scale(${s})">
    <path d="${BRAND_ART.tagline.d}" fill="${color}" fill-rule="evenodd"/>
  </g>`;
}

async function png(svg: string, out: string, size?: { width: number; height: number }) {
  let img = sharp(Buffer.from(svg), { density: 72 });
  if (size) img = img.resize(size.width, size.height);
  await img.png({ compressionLevel: 9 }).toFile(path.join(root, out));
  console.log("✓", out);
}

async function main() {
  // Écran de lancement : posé sur fond blanc (app.json), comme l'icône et
  // l'animation d'ouverture BrandIntro qui suit — halo bleu goutte discret.
  await png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
      <circle cx="512" cy="512" r="500" fill="${DROP}" fill-opacity="0.06"/>
      <circle cx="512" cy="512" r="448" fill="${DROP}" fill-opacity="0.08"/>
      ${emblem(512, 512, 800)}
    </svg>`,
    "application/mobile/assets/splash-icon.png"
  );

  // Icône thématique Android : silhouette dans la zone sûre (≈ 61 %).
  await png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${emblemSilhouette(512, 512, 560)}</svg>`,
    "application/mobile/assets/android-icon-monochrome.png"
  );

  // Icône des notifications Android : blanche sur transparent, 96 × 96.
  await png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 384 384">${emblemSilhouette(192, 192, 360)}</svg>`,
    "application/mobile/assets/brand/notification-icon.png",
    { width: 96, height: 96 }
  );

  // Bannière Google Play 1024 × 500 : logo officiel complet à gauche,
  // promesse de l'application à droite, fond clair de la charte.
  await png(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#FFFFFF"/>
          <stop offset="1" stop-color="#E8F3FA"/>
        </linearGradient>
      </defs>
      <rect width="1024" height="500" fill="url(#bg)"/>
      ${emblem(258, 196, 250)}
      ${title(72, 342, 372)}
      ${tagline(104, 418, 308, MID)}
      <text font-family="Inter" font-weight="700" font-size="40" fill="${NAVY}">
        <tspan x="504" y="186">Planning, missions</tspan>
        <tspan x="504" y="238">et pointage de l'équipe,</tspan>
        <tspan x="504" y="290">au même endroit.</tspan>
      </text>
      <text x="504" y="342" font-family="Inter" font-weight="600" font-size="24" fill="${DROP}">L'application des équipes Deep Clean</text>
    </svg>`,
    "application/presentation/store/google-banniere-1024x500.png"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
