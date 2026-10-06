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

// `node render.js` : version écran 16:9.
// `node render.js a4` : version papier A4 paysage (impression, porte-folio).
// Même contenu et même mise en page : la page est simplement plus haute
// (rapport A4, 1920 × 1358), le fond la couvre entièrement et le contenu
// 16:9 est centré dans la hauteur, le numéro de page restant en bas.
const A4 = process.argv[2] === "a4";
const PAGE_W = 1920;
const PAGE_H = A4 ? Math.round(1920 / Math.SQRT2) : 1080;
const OUT_PDF = path.resolve(__dirname, A4 ? "Deep-Clean-Presentation-KingDream-A4-impression.pdf" : "Deep-Clean-Presentation-KingDream.pdf");
const TMP_DIR = path.resolve(__dirname, A4 ? ".render-a4" : ".render");

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: PAGE_W, height: PAGE_H }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto("file://" + path.resolve(__dirname, "index.html"), { waitUntil: "networkidle" });
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await page.evaluate(() => document.fonts.ready);
  if (A4) {
    await page.evaluate((height) => {
      const offset = Math.round((height - 1080) / 2);
      for (const section of document.querySelectorAll("section.page")) {
        const inner = document.createElement("div");
        inner.style.cssText = `position:absolute;left:0;top:${offset}px;width:1920px;height:1080px;`;
        const folio = section.querySelector(":scope > .folio");
        while (section.firstChild) inner.appendChild(section.firstChild);
        section.appendChild(inner);
        section.style.height = `${height}px`;
        if (folio) { section.appendChild(folio); folio.style.bottom = "56px"; }
      }
    }, PAGE_H);
  }
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

  // Assemblage : une page PDF par image, sans marge. En A4, la page fait
  // exactement 297 × 210 mm pour s'imprimer à 100 %, sans mise à l'échelle.
  const W = A4 ? "297mm" : `${PAGE_W}px`;
  const H = A4 ? "210mm" : `${PAGE_H}px`;
  const pdfPage = await browser.newPage();
  const html = `<!DOCTYPE html><html><head><style>
    @page { size: ${W} ${H}; margin: 0; }
    html, body { margin: 0; padding: 0; }
    img { display: block; width: ${W}; height: ${H}; page-break-after: always; }
  </style></head><body>${files.map((f) => `<img src="file://${f}">`).join("")}</body></html>`;
  const htmlPath = path.join(TMP_DIR, "assemble.html");
  fs.writeFileSync(htmlPath, html);
  await pdfPage.goto("file://" + htmlPath, { waitUntil: "networkidle" });
  await pdfPage.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))));
  await pdfPage.pdf({ path: OUT_PDF, width: W, height: H, printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });

  await browser.close();
  console.log(`done · ${files.length} pages`);
})().catch((e) => { console.error(e); process.exit(1); });
