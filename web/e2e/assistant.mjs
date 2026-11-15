// Parcours de l'assistant Hot-Spot AI dans Chrome. Usage : node e2e/assistant.mjs (serveur sur :3210).
// Les tests A-04 a A-06 remplacent la reponse reseau de /api/assistant par une reponse fixe :
// ils verifient l'execution des actions dans l'interface, pas la qualite du modele.
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3210";
const results = [];
process.on("unhandledRejection", () => {});

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(id, name, fn) {
  try {
    const note = await fn();
    results.push({ id, name, status: "REUSSI", note: note ?? "" });
  } catch (error) {
    results.push({ id, name, status: "ECHEC", note: String(error.message ?? error).split("\n")[0].slice(0, 240) });
  }
  const r = results[results.length - 1];
  console.log(`${r.id.padEnd(6)} ${r.status.padEnd(7)} ${r.name.padEnd(64)} ${r.note}`);
}

const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });

async function open(route, { welcomed = true, viewport = { width: 1440, height: 900 }, available = null } = {}) {
  const context = await browser.newContext({ viewport, locale: "fr-FR", acceptDownloads: true });
  if (welcomed) await context.addInitScript(() => window.localStorage.setItem("hotspot.welcomed", "1"));
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  if (available === true) await page.route("**/api/assistant/status", (r) => r.fulfill({ json: { available: true, reason: null, model: "gemini-3.8-flash" } }));
  if (available === false) await page.route("**/api/assistant/status", (r) => r.fulfill({ json: { available: false, reason: "Aucun fournisseur IA n'est configuré sur ce serveur (clé GEMINI_API_KEY absente).", model: null } }));
  await page.goto(base + route, { waitUntil: "load" });
  return { page, context, errors };
}

/** Reponse fixe de l'assistant, au format du serveur. */
async function stubReply(page, reply) {
  const seen = [];
  await page.route("**/api/assistant", async (route) => {
    seen.push(JSON.parse(route.request().postData() ?? "{}"));
    await route.fulfill({ json: reply });
  });
  return seen;
}

const panel = (page) => page.getByRole("complementary", { name: "Hot-Spot AI" });

await test("A-01", "Première visite : accueil et proposition de visite guidée", async () => {
  const { page, context } = await open("/dashboard", { welcomed: false });
  await panel(page).getByText("Bienvenue dans Hot-Spot").waitFor();
  expect(await panel(page).getByRole("button", { name: "Voir la visite guidée" }).isVisible(), "bouton de visite absent");
  await panel(page).getByRole("button", { name: "Poser une question" }).click();
  expect(await page.evaluate(() => window.localStorage.getItem("hotspot.welcomed")) === "1", "l'accueil réapparaîtrait");
  await context.close();
  return "accueil affiché une fois, passable";
});

await test("A-02", "Sans fournisseur IA : état honnête et aide hors ligne utilisable", async () => {
  const { page, context } = await open("/dashboard", { available: false });
  await page.getByRole("button", { name: "Ouvrir Hot-Spot AI" }).click();
  await panel(page).getByText("Assistant IA indisponible").waitFor();
  expect(await page.locator("#assistant-input").isDisabled(), "la saisie reste active sans service");
  expect((await page.locator("#assistant-input").getAttribute("placeholder")).includes("non configuré"), "placeholder trompeur");
  await panel(page).getByRole("button", { name: "Comment fonctionne la carte ?" }).click();
  await panel(page).getByRole("button", { name: "Ouvrir la carte" }).click();
  await page.waitForURL("**/map");
  await context.close();
  return "saisie désactivée, FAQ dépliée, raccourci vers la carte exécuté";
});

await test("A-03", "Visite guidée : étapes, actions proposées, mise en évidence, reprise", async () => {
  const { page, context } = await open("/dashboard");
  await page.getByRole("button", { name: "Visite guidée", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: /Bienvenue dans Hot-Spot/ });
  await dialog.waitFor();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("heading", { name: /Choisir le territoire/ }).waitFor();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("heading", { name: /Choisir une période/ }).waitFor();
  await page.getByRole("button", { name: "Juin à septembre 2025" }).click();
  await page.getByRole("button", { name: "Période", exact: true }).filter({ hasText: "Juin à septembre 2025" }).waitFor();
  // L'element cible est entoure : le cadre est positionne sur le selecteur de periode.
  const ring = await page.evaluate(() => {
    const target = document.querySelector('[data-tour="period-picker"]').getBoundingClientRect();
    const frame = [...document.querySelectorAll("div[aria-hidden].fixed")].find((d) => d.style.top);
    const f = frame?.getBoundingClientRect();
    return f ? Math.abs(f.left + 6 - target.left) < 3 && Math.abs(f.top + 6 - target.top) < 3 : false;
  });
  expect(ring, "cadre de mise en évidence mal placé");
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.getByRole("button", { name: "Suivant" }).click();
  await page.waitForURL("**/map");
  await page.getByRole("heading", { name: /Afficher la carte/ }).waitFor();
  await page.keyboard.press("Escape");
  expect(await page.getByRole("dialog", { name: /Afficher la carte/ }).count() === 0, "Échap ne ferme pas la visite");
  await context.close();
  return "5 étapes parcourues, période appliquée par la visite, changement de page automatique";
});

await test("A-04", "Actions de l'assistant appliquées avec les vraies fonctions (réponse simulée)", async () => {
  const { page, context } = await open("/dashboard", { available: true });
  const seen = await stubReply(page, {
    text: "J'ai sélectionné le **Haut-Ogooué** de janvier à juin 2025 et affiché la carte, VIIRS seul.",
    actions: [
      { type: "set_zone", zone: { kind: "province", index: 1 }, label: "Haut-Ogooué" },
      { type: "set_period", from: "2025-01-01", to: "2025-06-30" },
      { type: "set_map_view", mode: "points", sensors: ["snpp", "noaa20"] },
    ],
    sources: [],
  });
  await page.getByRole("button", { name: "Ouvrir Hot-Spot AI" }).click();
  await page.locator("#assistant-input").fill("Montre le Haut-Ogooué de janvier à juin 2025, VIIRS seulement");
  const detections = page.waitForResponse((r) => r.url().includes("/api/detections") && r.url().includes("zone=province%3A1") && r.url().includes("sats=snpp%2Cnoaa20") && r.url().includes("to=2025-06-30"));
  await page.keyboard.press("Enter");
  await page.waitForURL("**/map");
  await detections;
  expect(seen[0].context.page === "dashboard" && seen[0].context.zone.kind === "country", "contexte non transmis");
  expect(seen[0].messages.at(-1).text.includes("Haut-Ogooué"), "message non transmis");
  const text = await panel(page).innerText();
  expect(text.includes("Zone : Haut-Ogooué") && text.includes("Période :") && text.includes("Carte :"), "accusés d'action absents");
  expect(await page.getByRole("button", { name: "Zone d'analyse", exact: true }).innerText().then((t) => t.includes("Haut-Ogooué")), "zone non appliquée");
  await context.close();
  return "zone, période et filtres de carte appliqués ; carte rechargée avec les nouveaux filtres";
});

await test("A-05", "Export : rien n'est téléchargé sans confirmation (réponse simulée)", async () => {
  const { page, context } = await open("/dashboard", { available: true });
  await stubReply(page, { text: "L'export est prêt.", actions: [{ type: "export", kind: "detections", format: "csv", label: "Détections CSV, Gabon, du 2025-01-01 au 2025-12-31" }], sources: [] });
  let downloads = 0;
  page.on("download", () => downloads++);
  await page.getByRole("button", { name: "Ouvrir Hot-Spot AI" }).click();
  await page.locator("#assistant-input").fill("Exporte les résultats actuels");
  await page.keyboard.press("Enter");
  await panel(page).getByText("Export préparé").waitFor();
  await page.waitForTimeout(800);
  expect(downloads === 0, "téléchargement lancé sans confirmation");
  const download = page.waitForEvent("download");
  await panel(page).getByRole("button", { name: "Télécharger" }).click();
  const file = await download;
  expect(/hotspot_detections_country_2025-01-01_2025-12-31\.csv/.test(file.suggestedFilename()), `fichier inattendu : ${file.suggestedFilename()}`);
  await panel(page).getByText("Téléchargement lancé.").waitFor();
  await context.close();
  return `confirmation exigée, puis ${file.suggestedFilename()}`;
});

await test("A-06", "Mise en évidence d'un élément et contexte de page (réponse simulée)", async () => {
  const { page, context } = await open("/calendar", { available: true });
  const seen = await stubReply(page, { text: "Le pas de temps se choisit ici.", actions: [{ type: "highlight", target: "calendar-granularity", caption: "Choisissez ici mois, semaine, jour ou année" }], sources: [] });
  await page.getByRole("button", { name: "Ouvrir Hot-Spot AI" }).click();
  await page.locator("#assistant-input").fill("Comment passer en vue journalière ?");
  await page.keyboard.press("Enter");
  await page.getByText("Choisissez ici mois, semaine, jour ou année").first().waitFor();
  expect(seen[0].context.page === "calendar" && seen[0].context.calendar?.granularity === "month", "contexte du calendrier absent");
  await context.close();
  return "élément entouré avec sa légende ; contexte « calendrier, vue mensuelle » transmis";
});

await test("A-07", "Erreur du service : message clair, pas de réponse inventée", async () => {
  const { page, context } = await open("/dashboard", { available: true });
  await page.route("**/api/assistant", (r) => r.fulfill({ status: 429, json: { error: "Vous avez envoyé beaucoup de messages en peu de temps. Patientez quelques minutes." } }));
  await page.getByRole("button", { name: "Ouvrir Hot-Spot AI" }).click();
  await page.locator("#assistant-input").fill("Bonjour");
  await page.keyboard.press("Enter");
  await panel(page).getByText("Patientez quelques minutes").waitFor();
  await context.close();
  return "erreur 429 affichée telle quelle";
});

await test("A-08", "Question venue de l'accueil : pré-remplie, non envoyée", async () => {
  const { page, context } = await open("/dashboard?ask=Compare%20MODIS%20et%20VIIRS", { welcomed: false, available: true });
  await panel(page).waitFor();
  await page.waitForFunction(() => document.querySelector("#assistant-input")?.value === "Compare MODIS et VIIRS");
  expect(!page.url().includes("ask="), "le paramètre reste dans l'adresse");
  await context.close();
  return "saisie pré-remplie, adresse nettoyée";
});

await test("A-09", "Téléphone : panneau plein écran, fermeture", async () => {
  const { page, context } = await open("/dashboard", { viewport: { width: 390, height: 844 } });
  await page.getByRole("button", { name: "Ouvrir Hot-Spot AI" }).click();
  const box = await panel(page).boundingBox();
  expect(box.width >= 388, `panneau trop étroit : ${box.width}`);
  await panel(page).getByRole("button", { name: "Fermer l'assistant" }).click();
  expect((await panel(page).count()) === 0, "panneau toujours ouvert");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow <= 1, `débordement ${overflow}px`);
  await context.close();
  return "plein écran, fermeture, pas de débordement";
});

await browser.close();
const failed = results.filter((r) => r.status !== "REUSSI").length;
console.log(`\n${results.length - failed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
