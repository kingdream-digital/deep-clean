import { chromium } from "playwright";
export const BASE_URL = "http://localhost:8081";
export const API = "http://localhost:4000/api/v1";
export const PASSWORD = "DemoClean2026!";
export const MOBILE = { width: 390, height: 844 };

export async function apiLogin(username) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password: PASSWORD }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${username}: ${JSON.stringify(j)}`);
  return { token: j.token ?? j.accessToken, user: j.user };
}

export async function launch() {
  return chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
}

export async function newPage(browser, { colorScheme = "light", viewport = MOBILE } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 3, colorScheme, locale: "fr-FR" });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.log("  [pageerror]", e.message));
  return page;
}

export async function login(page, username) {
  const { user } = await apiLogin(username);
  await page.addInitScript((id) => {
    try { window.localStorage.setItem(`deepclean.onboardingSeen.${id}`, "1"); } catch {}
  }, user.id);
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByPlaceholder("jdupont").fill(username);
  await page.getByPlaceholder("••••••••••").fill(PASSWORD);
  await page.getByText("Se connecter", { exact: true }).click();
  await page.waitForTimeout(3000);
  try { await page.getByText("Passer", { exact: true }).click({ timeout: 1500, force: true }); await page.waitForTimeout(600); } catch {}
  return user;
}

export async function tapTab(page, name) {
  await page.getByRole("tab", { name }).click({ force: true, timeout: 8000 });
  await page.waitForTimeout(1300);
}

export async function tapText(page, text, opts = {}) {
  const locator = page.getByText(text, opts).first();
  try { await locator.click({ timeout: 6000 }); }
  catch {
    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 300); await page.waitForTimeout(150);
      try { await locator.click({ force: true, timeout: 1200 }); break; } catch {}
    }
  }
  await page.waitForTimeout(1300);
}

export async function shot(page, file) {
  await page.waitForTimeout(500);
  await page.screenshot({ path: file });
  console.log("✓", file);
}

/**
 * Clique le texte RÉELLEMENT visible à l'écran. React Navigation garde les
 * écrans précédents montés dans le DOM : un `getByText(...).first()` tombe
 * souvent sur l'occurrence d'un écran inactif, invisible pour l'utilisateur
 * mais bien présente pour le sélecteur. On ne retient donc que le candidat
 * qui recevrait vraiment le clic (elementFromPoint).
 */
export async function tapVisible(page, text, { exact = true } = {}) {
  const point = await page.evaluate(
    ({ text, exact }) => {
      const matches = [...document.querySelectorAll("div,span")].filter((el) => {
        const t = (el.textContent || "").trim();
        if (!(exact ? t === text : t.includes(text))) return false;
        if (el.children.length > 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
      });
      for (const el of matches) {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        if (!hit) continue;
        if (hit === el || el.contains(hit) || hit.contains(el)) return { x, y };
      }
      return null;
    },
    { text, exact }
  );
  if (!point) throw new Error(`Texte visible introuvable : « ${text} »`);
  await page.mouse.click(point.x, point.y);
  await page.waitForTimeout(1400);
}
