const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

// Génère le PDF de présentation à partir de index.html.
//
// Chaque page (<section class="page">) est d'abord photographiée en très haute
// définition (3840 × 2160), puis les images sont assemblées en PDF 16:9.
// L'export PDF direct de Chromium effaçait les grandes captures d'écran
// recouvertes par les téléphones (ombres floues aplaties en une seule image,
// où la capture d'ordinateur sortait blanche) : passer par des images rend
// chaque page exactement comme dans le navigateur.

const OUT_PDF = path.resolve(__dirname, "Deep-Clean-Presentation-KingDream.pdf");
const TMP_DIR = path.resolve(__dirname, ".render");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("file://" + path.resolve(__dirname, "index.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);

  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  fs.mkdirSync(TMP_DIR);
  const sections = await page.locator("section.page").all();
  const files = [];
  for (let i = 0; i < sections.length; i++) {
    const file = path.join(TMP_DIR, `page-${String(i + 1).padStart(2, "0")}.jpg`);
    await sections[i].screenshot({ path: file, type: "jpeg", quality: 90 });
    files.push(file);
  }

  // Assemblage : une page PDF de 1920 × 1080 par image, sans marge.
  const pdfPage = await browser.newPage();
  const html = `<!DOCTYPE html><html><head><style>
    @page { size: 1920px 1080px; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: 1920px; height: 1080px; page-break-after: always; }
  </style></head><body>${files.map((f) => `<img src="file://${f}">`).join("")}</body></html>`;
  const htmlPath = path.join(TMP_DIR, "assemble.html");
  fs.writeFileSync(htmlPath, html);
  await pdfPage.goto("file://" + htmlPath, { waitUntil: "networkidle" });
  await pdfPage.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await pdfPage.pdf({ path: OUT_PDF, width: "1920px", height: "1080px", printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });

  await browser.close();
  console.log(`done · ${files.length} pages`);
})().catch((e) => { console.error(e); process.exit(1); });
