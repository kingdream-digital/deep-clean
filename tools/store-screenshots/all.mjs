import { launch, session, shot, tapVisible } from "./capture.mjs";
const only = process.env.ONLY;
const want = (n) => !only || only.split(",").includes(n);
const browser = await launch();

if (want("1") || want("2") || want("3") || want("6")) {
  const { page, context } = await session(browser, "lpetit");
  if (want("1")) await shot(page, "01-accueil-employe");
  if (want("2")) {
    await page.getByRole("tab", { name: "Planning" }).click({ force: true });
    await page.waitForTimeout(2000);
    await shot(page, "02-planning");
  }
  if (want("6")) {
    await page.getByRole("tab", { name: "Messagerie" }).click({ force: true });
    await page.waitForTimeout(2000);
    try { await tapVisible(page, "Messages"); } catch {}
    await page.waitForTimeout(1500);
    await shot(page, "06-messagerie-liste");
  }
  if (want("3")) {
    await page.getByRole("tab", { name: "Missions" }).click({ force: true });
    await page.waitForTimeout(2000);
    await tapVisible(page, "Désinfection salles de consultation");
    await page.waitForTimeout(2000);
    await shot(page, "03-mission");
  }
  await context.close();
}

// Volet public : l'accueil public est le premier écran de l'application.
// Offre de bienvenue DÉSACTIVÉE pendant ces captures : ni prix ni remise dans
// les captures de la fiche (App Store, règle 2.3.7).
if (want("4")) {
  const { page, context } = await session(browser, null);
  await page.getByPlaceholder("Code postal").fill("04100");
  await page.getByText("Vérifier", { exact: true }).click();
  await page.evaluate(() => document.querySelectorAll("input").forEach((e) => e.blur()));
  await page.waitForTimeout(1200);
  await shot(page, "04-decouvrir");
  await context.close();
}

if (want("5")) {
  const { page, context } = await session(browser, null);
  await tapVisible(page, "Demander un devis gratuit");
  await page.waitForTimeout(1500);
  await page.getByText("Professionnel", { exact: true }).last().click({ force: true });
  await page.waitForTimeout(400);
  const inputs = page.locator("input:visible");
  const values = ["Cabinet Martin & Associés", "Claire", "Martin", "06 12 34 56 78", "c.martin@cabinet-martin.fr", "04100", "Manosque"];
  for (let i = 0; i < values.length; i++) await inputs.nth(i).fill(values[i]);
  await page.getByText("Bureaux & espaces pro", { exact: true }).last().click({ force: true });
  await page.locator("textarea:visible").first().fill("Entretien de nos bureaux (180 m²) trois soirs par semaine, à partir de novembre.");
  await page.getByText(/J'accepte que DEEP CLEAN/).last().click({ force: true });
  await page.evaluate(() => {
    document.querySelectorAll("input,textarea").forEach((e) => { e.spellcheck = false; e.blur(); });
    // Cadre la capture du nom au bouton d'envoi.
    const scrollers = [...document.querySelectorAll("div")].filter((d) => d.scrollHeight > d.clientHeight + 50 && getComputedStyle(d).overflowY !== "visible");
    const main = scrollers.sort((a, b) => b.clientHeight - a.clientHeight)[0];
    if (main) main.scrollTop = 122;
  });
  await page.waitForTimeout(800);
  await shot(page, "05-devis");
  await context.close();
}

if (want("7")) {
  const { page, context } = await session(browser, "jlefevre");
  await page.getByRole("tab", { name: "Menu" }).click({ force: true });
  await page.waitForTimeout(1800);
  for (let i = 0; i < 10; i++) {
    try { await tapVisible(page, "Statistiques"); break; }
    catch { await page.mouse.move(215, 400); await page.mouse.wheel(0, 250); await page.waitForTimeout(400); }
  }
  await page.waitForTimeout(2500);
  await shot(page, "07-statistiques");
  await context.close();
}
await browser.close();
