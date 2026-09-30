// Outil de capture des écrans réels de l'application pour la présentation
// (application/presentation) — complète render.js : ce script régénère les
// captures dans shots/, render.js les assemble ensuite dans le PDF.
//
// Usage : node capture.js
// Prérequis : backend démarré sur http://localhost:4000, web Expo sur
// http://localhost:8090, base de données peuplée via
// `npx tsx prisma/seedPresentationDemo.ts` (dossier application/backend).
const { chromium } = require("playwright");
const path = require("path");

const BASE_URL = "http://localhost:8081";
const OUT = (name) => path.resolve(__dirname, "shots", name);
const PASSWORD = "DemoClean2026!";

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1600, height: 960 };

// Id réels des comptes de démo (prisma/seedPresentationDemo.ts) — la visite
// guidée se relance à chaque nouvel écran tant qu'elle n'est pas marquée vue
// PAR UTILISATEUR (voir onboarding/onboardingStorage.ts, clé
// "deepclean.onboardingSeen.<userId>" dans le localStorage du navigateur).
// Cliquer "Passer" une fois ne suffit pas (ça ne ferme que l'étape en cours,
// pas tout le parcours) et son overlay plein écran reste alors monté et
// intercepte les clics même sur des écrans visuellement normaux. On marque
// directement le tutoriel comme vu avant le tout premier rendu, plutôt que
// de le refermer à chaque écran.
const USER_IDS = {
  mdupont: "eda2d732-ea2d-4bd4-9892-86dd6fe39d66",
  jlefevre: "374551c7-0472-4976-be2e-bf41a58c6c3d",
  ytraore: "dfd9224d-6786-4ca4-9be6-d56f03df57e5",
};

async function login(page, username) {
  const userId = USER_IDS[username];
  if (userId) {
    await page.addInitScript((id) => {
      try {
        window.localStorage.setItem(`deepclean.onboardingSeen.${id}`, "1");
      } catch {
        /* stockage indisponible, tant pis */
      }
    }, userId);
  }
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await page.getByPlaceholder("jdupont").fill(username);
  await page.getByPlaceholder("••••••••••").fill(PASSWORD);
  await page.getByText("Se connecter", { exact: true }).click();
  await page.waitForTimeout(2500);
  // Filet de sécurité si jamais un compte inconnu se connecte malgré tout.
  try {
    await page.getByText("Passer", { exact: true }).click({ timeout: 3000, force: true });
    await page.waitForTimeout(800);
  } catch {
    /* pas de visite guidée en cours, rien à fermer. */
  }
}

async function tapTab(page, name) {
  await page.getByRole("tab", { name }).click({ force: true, timeout: 8000 });
  await page.waitForTimeout(1200);
}

async function tapText(page, text, opts = {}) {
  const locator = page.getByText(text, opts).first();
  try {
    // Sans force au premier essai : les vérifications natives de Playwright
    // (élément stable/visible) évitent de cliquer sur des coordonnées
    // obsolètes juste après un changement d'écran — un `force:true`
    // systématique avait déjà provoqué un clic sur le mauvais élément une
    // fois la mise en page terminée après coup.
    await locator.click({ timeout: 8000 });
  } catch {
    // Les ScrollView de React Native Web ignorent scrollIntoView() : on
    // descend la page à la molette avant de retenter.
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(150);
      try {
        await locator.click({ force: true, timeout: 1500 });
        break;
      } catch {
        /* continue de défiler */
      }
    }
  }
  await page.waitForTimeout(1200);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });

  // ============================================================ MOBILE — RH (Marie Dupont)
  if (process.env.SKIP_MOBILE !== "1") {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await login(page, "mdupont");

    await page.screenshot({ path: OUT("home.png") });
    console.log("✓ home.png");

    // Chantier "Coworking Le Phare" (créé depuis le devis accepté) — via le
    // raccourci "Chantiers" de l'accueil plutôt que par l'onglet Menu : ce
    // dernier expose un vrai bug de superposition tactile (un calque
    // plein écran invisible y intercepte les clics), hors sujet ici et sans
    // rapport avec cet outil de capture.
    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(500);
    await tapText(page, "Chantiers", { exact: true });
    await page.waitForTimeout(1500);
    await tapText(page, "Coworking Le Phare", { exact: true });
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT("site-objectifs.png") });
    console.log("✓ site-objectifs.png");

    await tapTab(page, "Accueil");
    await page.waitForTimeout(800);

    await tapTab(page, "Planning");
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT("planning-tour.png") });
    console.log("✓ planning-tour.png");

    await tapTab(page, "Missions");
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT("missions.png") });
    console.log("✓ missions.png");

    await tapTab(page, "Messagerie");
    await page.waitForTimeout(800);
    await page.screenshot({ path: OUT("notifications.png") });
    console.log("✓ notifications.png");

    await tapTab(page, "Menu");
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT("menu-direction.png") });
    console.log("✓ menu-direction.png (RH)");

    await tapText(page, "Commercial", { exact: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: OUT("commercial-dashboard.png") });
    console.log("✓ commercial-dashboard.png");

    await tapText(page, "Devis", { exact: true });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: OUT("commercial-quotes.png") });
    console.log("✓ commercial-quotes.png");

    // Le devis accepté (Coworking Le Phare) est le plus riche à montrer —
    // sous l'onglet "Acceptés", pas "En cours" (l'onglet par défaut).
    await tapText(page, "Acceptés", { exact: true });
    await page.waitForTimeout(1500);
    await tapText(page, "DEV-2026-0004");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: OUT("commercial-quote-detail.png") });
    console.log("✓ commercial-quote-detail.png");

    await context.close();
  }

  // ============================================================ MOBILE — Superviseur (Yasmine Traoré)
  if (process.env.SKIP_MOBILE !== "1") {
    const context = await browser.newContext({ viewport: MOBILE_VIEWPORT, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await login(page, "ytraore");
    await tapTab(page, "Menu");
    await page.waitForTimeout(600);
    await page.screenshot({ path: OUT("menu-superviseur.png") });
    console.log("✓ menu-superviseur.png");
    await context.close();
  }

  // ============================================================ WEB — Direction (Jean Lefèvre), grand écran
  if (process.env.SKIP_WEB !== "1") {
    const context = await browser.newContext({ viewport: DESKTOP_VIEWPORT, deviceScaleFactor: 1.5 });
    const page = await context.newPage();
    await login(page, "jlefevre");
    await page.waitForTimeout(1000);

    await page.screenshot({ path: OUT("web-home.png") });
    console.log("✓ web-home.png");

    // WebSidebar (barre latérale desktop) remplace entièrement la barre
    // d'onglets native — ses lignes ne portent pas le rôle "tab", d'où
    // tapText ici plutôt que tapTab (réservé au shell mobile natif).
    await tapText(page, "Planning", { exact: true });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: OUT("web-planning.png") });
    console.log("✓ web-planning.png");

    await tapText(page, "Commercial", { exact: true });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: OUT("web-commercial.png") });
    console.log("✓ web-commercial.png");

    await tapText(page, "Factures", { exact: true });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: OUT("web-invoices.png") });
    console.log("✓ web-invoices.png");

    await tapText(page, "Chantiers", { exact: true });
    await page.waitForTimeout(1200);
    await tapText(page, "Coworking Le Phare", { exact: true });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: OUT("web-site-objectifs.png") });
    console.log("✓ web-site-objectifs.png");

    await context.close();
  }

  await browser.close();
  console.log("Terminé.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
