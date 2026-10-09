// Captures de l'application pour les fiches App Store / Google Play.
//
//   node captures-stores.mjs iphone    -> 1290 x 2796 (iPhone 6,9")
//   node captures-stores.mjs android   -> 1080 x 1920 (téléphone Android, 9:16)
//
// Pilote l'application réellement en marche (API :4000, web :8081) avec le jeu
// de démonstration (comptes lpetit, csimon, kbenali, jlefevre — voir
// docs/REPRISE-SESSION.md). Les portraits de démonstration doivent être retirés
// avant (UPDATE users SET "avatarKey" = NULL) : les visuels publics ne montrent
// que des initiales. Résultat dans sortie/captures-stores/brutes/<format>/.
// Ensuite : python3 composer-visuels-stores.py sortie/captures-stores/brutes <dossier>
import { launch, newPage, login, tapTab, tapVisible, shot } from "./helpers.mjs";
import fs from "fs";

const FORMATS = {
  iphone: { viewport: { width: 430, height: 932 }, dir: "sortie/captures-stores/brutes/iphone" },   // x3 = 1290 x 2796 (iPhone 6,9")
  android: { viewport: { width: 414, height: 736 }, dsf: 1080 / 414, dir: "sortie/captures-stores/brutes/android" }, // 9:16 -> 1080 x 1920
};
const which = process.argv[2];
const { viewport, dir, dsf = 3 } = FORMATS[which];
fs.mkdirSync(dir, { recursive: true });
const browser = await launch();

async function session(username, fn) {
  const page = await newPage(browser, { viewport, dsf });
  await login(page, username);
  try { await fn(page); } finally { await page.close(); }
}
const scroll = async (page, dy) => { await page.mouse.move(viewport.width / 2, viewport.height * 0.6); await page.mouse.wheel(0, dy); await page.waitForTimeout(900); };

async function scrollToText(page, text, topMargin = 24) {
  for (let i = 0; i < 6; i++) {
    const top = await page.evaluate((t) => {
      const el = [...document.querySelectorAll("div,span")].find((e) => e.children.length === 0 && (e.textContent || "").trim() === t && e.getBoundingClientRect().height > 0);
      return el ? el.getBoundingClientRect().top : null;
    }, text);
    if (top === null) throw new Error("texte introuvable : " + text);
    if (Math.abs(top - topMargin) < 6) return;
    await scroll(page, top - topMargin);
  }
}

// 01 — Accueil employé (pointage en cours)
await session("lpetit", async (p) => { await shot(p, `${dir}/01-accueil.png`); });

// 02 — Planning de la semaine (chef d'équipe, dimanche)
await session("kbenali", async (p) => { await tapTab(p, "Planning"); await tapVisible(p, "11"); await shot(p, `${dir}/02-planning.png`); });

// 03 — Fiche de mission avec fiche de poste
await session("lpetit", async (p) => {
  await tapTab(p, "Missions");
  await tapVisible(p, "Désinfection salles de consultation");
  await shot(p, `${dir}/03-mission.png`);
});

// 04 — Mes heures
await session("csimon", async (p) => { await tapTab(p, "Menu"); await tapVisible(p, "Mes heures"); await shot(p, `${dir}/04-heures.png`); });

// 05 — Signalement d'un problème
await session("lpetit", async (p) => {
  await tapTab(p, "Missions");
  await tapVisible(p, "Désinfection salles de consultation");
  await scroll(p, 3000);
  await tapVisible(p, "Signaler un problème");
  await p.evaluate(() => document.querySelectorAll("textarea,input").forEach((e) => e.setAttribute("spellcheck", "false")));
  await p.getByPlaceholder("Ex : Sol endommagé dans le couloir.").fill("Sol endommagé dans le couloir, devant l'accueil.");
  await p.waitForTimeout(600);
  await shot(p, `${dir}/05-signalement.png`);
});

// 06 — Messagerie
await session("lpetit", async (p) => { await tapTab(p, "Messagerie"); await tapVisible(p, "Messages"); await shot(p, `${dir}/06-messagerie.png`); });

// 07 — Notifications
await session("csimon", async (p) => { await tapTab(p, "Messagerie"); await shot(p, `${dir}/07-notifications.png`); });

// 08 — Vue direction
await session("jlefevre", async (p) => { await scrollToText(p, "EN UN COUP D'ŒIL"); await shot(p, `${dir}/08-direction.png`); });

await browser.close();
