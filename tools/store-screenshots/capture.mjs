import { chromium } from "playwright";

const BASE = "http://localhost:8099";
const API = "http://localhost:4100/api/v1";
const PASSWORD = "DemoClean2026!";
const OUT = process.env.OUT;
const NOW = new Date("2026-10-16T06:40:00Z"); // vendredi 16 octobre, 8 h 40 à Paris
// Écran utile d'un iPhone 6,9" (430 × 932 pt) moins la barre d'état (54) et
// l'indicateur d'accueil (34), recomposés ensuite autour de la capture.
const VIEWPORT = { width: 430, height: 844 };

async function apiUser(username) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: PASSWORD }) });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j));
  return j.user;
}

export async function session(browser, username) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 3, locale: "fr-FR", timezoneId: "Europe/Paris", colorScheme: "light" });
  await context.clock.setFixedTime(NOW);
  const user = username ? await apiUser(username) : null;
  await context.addInitScript((id) => {
    try {
      localStorage.setItem("deepclean.introDay", "2026-10-16");
      if (id) localStorage.setItem(`deepclean.onboardingSeen.${id}`, "1");
    } catch {}
  }, user?.id ?? null);
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  if (username) {
    await page.getByPlaceholder("jdupont").fill(username);
    await page.getByPlaceholder("••••••••••").fill(PASSWORD);
    await page.getByText("Se connecter", { exact: true }).click();
    await page.waitForTimeout(3500);
    try { await page.getByText("Passer", { exact: true }).click({ timeout: 1200, force: true }); await page.waitForTimeout(500); } catch {}
  }
  return { context, page };
}

export async function tapVisible(page, text, { exact = true } = {}) {
  const point = await page.evaluate(({ text, exact }) => {
    const all = [...document.querySelectorAll("div,span")].filter((el) => {
      const t = (el.textContent || "").trim();
      if (!(exact ? t === text : t.includes(text))) return false;
      if (el.children.length > 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    });
    for (const el of all) {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (hit && (hit === el || el.contains(hit) || hit.contains(el))) return { x, y };
    }
    return null;
  }, { text, exact });
  if (!point) throw new Error(`Texte visible introuvable : ${text}`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(1500);
}

export async function shot(page, name) {
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("✓", name);
}

export async function launch() {
  return chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
}
