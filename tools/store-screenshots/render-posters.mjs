// Rend chaque affiche HTML d'un dossier en PNG 1290 × 2796 (capture iPhone 6,9").
// Appelé par posters.py : node render-posters.mjs <dossier des affiches>
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2]);
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox", "--allow-file-access-from-files"] });
const page = await browser.newPage({ viewport: { width: 1290, height: 2796 }, deviceScaleFactor: 1 });
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
  await page.goto("file://" + path.join(dir, file), { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const out = path.join(dir, file.replace(/\.html$/, ".png"));
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1290, height: 2796 } });
  console.log("✓", path.basename(out));
}
await browser.close();
