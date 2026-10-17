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

// Volet public (accueil sans compte, premier écran de l'application) : les
// captures utilisées par les affiches (posters/). La demande de devis est
// réellement envoyée au serveur de démonstration. Aucun prix ni aucune remise
// dans les captures (App Store, règle 2.3.7).
async function scrollToText(page, text, offset) {
  await page.evaluate(({ text, offset }) => {
    const el = [...document.querySelectorAll("div,span")].find((e) => e.children.length === 0 && (e.textContent || "").trim() === text && e.getBoundingClientRect().width > 0);
    if (!el) return;
    let p = el.parentElement;
    while (p && !(p.scrollHeight > p.clientHeight + 50 && getComputedStyle(p).overflowY !== "visible")) p = p.parentElement;
    if (p) p.scrollTop += el.getBoundingClientRect().top - offset;
  }, { text, offset });
  await page.waitForTimeout(900);
}

if (want("P")) {
  {
    const { page, context } = await session(browser, null);
    await page.waitForTimeout(1200);
    await shot(page, "public-accueil");
    await page.mouse.move(215, 500);
    await page.mouse.wheel(0, 470);
    await page.waitForTimeout(1000);
    await shot(page, "public-services");
    await page.mouse.wheel(0, 560);
    await page.waitForTimeout(1000);
    await shot(page, "public-services-bas");
    await context.close();
  }
  {
    const { page, context } = await session(browser, null);
    await page.mouse.move(215, 500);
    await page.mouse.wheel(0, 470);
    await page.waitForTimeout(1000);
    await page.getByLabel(/^Nettoyage en profondeur :/).first().click();
    await page.waitForTimeout(1500);
    await shot(page, "public-service");
    await scrollToText(page, "Pièce par pièce", 80);
    await shot(page, "public-service-pieces");
    await tapVisible(page, "Demander un devis pour ce service");
    await page.waitForTimeout(800);
    await page.getByPlaceholder("Surface, état, disponibilités…").fill("Appartement de 70 m², avant un état des lieux.");
    for (const [placeholder, value] of [["06 12 34 56 78", "06 12 34 56 78"], ["vous@exemple.fr", "claire.martin@exemple.fr"], ["04100", "04100"], ["Manosque", "Manosque"]]) {
      await page.getByPlaceholder(placeholder, { exact: true }).last().fill(value);
    }
    const unnamed = page.locator("input:visible:not([placeholder])");
    await unnamed.nth(0).fill("Claire");
    await unnamed.nth(1).fill("Martin");
    await page.getByText(/J'accepte que DEEP CLEAN/).last().click({ force: true });
    await page.evaluate(() => document.querySelectorAll("input,textarea").forEach((e) => { e.spellcheck = false; e.blur(); }));
    await page.mouse.move(215, 500);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(700);
    await shot(page, "public-devis-rempli");
    await tapVisible(page, "Envoyer ma demande");
    await page.waitForTimeout(2500);
    await shot(page, "public-envoye");
    await context.close();
  }
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
