const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  // deviceScaleFactor plus élevé : tout ce que Chromium doit rastériser pour
  // l'export PDF (ombres à flou large notamment) part d'une densité de pixels
  // plus fine, donc un rendu net plutôt que pixelisé/aplati sur les
  // visionneuses PDF qui zooment (mobile en particulier).
  const context = await browser.newContext({ deviceScaleFactor: 2 });
  const page = await context.newPage();
  const filePath = "file://" + path.resolve(__dirname, "index.html");
  await page.goto(filePath, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.pdf({
    path: path.resolve(__dirname, "Deep-Clean-Presentation-KingDream.pdf"),
    format: "A4",
    printBackground: true,
    margin: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  await browser.close();
  console.log("done");
})().catch((e) => { console.error(e); process.exit(1); });
