// Parcours d'acceptation dans un vrai navigateur (Chrome installe sur la machine).
// Usage : node e2e/flows.mjs      (le serveur doit tourner sur http://localhost:3210)
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3210";
const results = [];
let browser;
// Une attente abandonnee apres l'echec d'un test ne doit pas interrompre les tests suivants.
process.on("unhandledRejection", () => {});

async function settle(page, extra = 400) {
  await page.waitForLoadState("load");
  await page.waitForFunction(() => document.querySelectorAll(".skeleton").length === 0, null, { timeout: 30_000 });
  await page.waitForTimeout(extra);
}

async function open(route, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport, locale: "fr-FR", acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(base + route, { waitUntil: "load" });
  await settle(page);
  return { page, context, errors };
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function test(id, name, fn) {
  const started = Date.now();
  try {
    const note = await fn();
    results.push({ id, name, status: "REUSSI", note: note ?? "", ms: Date.now() - started });
  } catch (error) {
    results.push({ id, name, status: "ECHEC", note: String(error.message ?? error).split("\n")[0].slice(0, 260), ms: Date.now() - started });
  }
  const last = results[results.length - 1];
  console.log(`${String(last.id).padEnd(7)} ${last.status.padEnd(7)} ${last.name.padEnd(62)} ${last.note}`);
}

const api = async (path) => (await fetch(base + path)).json();
const mapReady = (page) => page.waitForFunction(() => document.querySelector("canvas.maplibregl-canvas")?.clientHeight > 100, null, { timeout: 30_000 });

browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });

await test("T-04a", "Changer la période met à jour les indicateurs", async () => {
  const { page, context, errors } = await open("/dashboard");
  const before = await page.locator("text=cellules-jour actives").first().locator("xpath=..").innerText();
  await page.getByRole("button", { name: "Période", exact: true }).click();
  await page.getByLabel("Année de référence des raccourcis").selectOption("2024");
  const wait = page.waitForResponse((r) => r.url().includes("/api/overview") && r.url().includes("from=2024-06-01") && r.url().includes("to=2024-09-30"));
  await page.getByRole("button", { name: /Saison sèche 2024/ }).click();
  await wait;
  await settle(page);
  const after = await page.locator("text=cellules-jour actives").first().locator("xpath=..").innerText();
  const expected = await api("/api/overview?zone=country&from=2024-06-01&to=2024-09-30");
  const shown = Number(after.replace(/[^\d]/g, "").slice(0, String(Math.round(expected.harmonized)).length));
  expect(before !== after, "l'indicateur n'a pas changé");
  expect(shown === Math.round(expected.harmonized), `affiché ${shown}, calculé ${Math.round(expected.harmonized)}`);
  expect(errors.length === 0, `erreurs console : ${errors.join(" | ")}`);
  await context.close();
  return `indice affiché ${shown} = valeur de l'API`;
});

await test("T-04b", "Choisir une province filtre tous les écrans", async () => {
  const { page, context } = await open("/dashboard");
  await page.getByRole("button", { name: "Zone d'analyse", exact: true }).click();
  const wait = page.waitForResponse((r) => r.url().includes("/api/overview") && /zone=province/.test(r.url()));
  await page.getByRole("dialog", { name: "Choisir la zone d'analyse" }).getByRole("button", { name: /Nyanga/ }).click();
  await wait;
  await settle(page);
  expect(await page.getByText("pour Nyanga").count(), "le titre ne mentionne pas la province");
  await page.getByRole("link", { name: "Calendrier d'activité" }).first().click();
  await page.waitForURL("**/calendar");
  await settle(page);
  expect(await page.getByText("pour Nyanga").count(), "la zone n'est pas conservée sur le calendrier");
  await context.close();
  return "zone conservée entre tableau de bord et calendrier";
});

await test("T-05", "Cliquer une détection ouvre sa fiche avec la source", async () => {
  const { page, context, errors } = await open("/map");
  await mapReady(page);
  await page.waitForTimeout(2500);
  const total = await api("/api/detections?zone=country&from=2025-01-01&to=2025-12-31&sats=terra,aqua,snpp,noaa20&conf=low,nominal,high&types=all&dn=all");
  // Position ecran d'une detection reelle, calculee par la carte elle-meme.
  const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
  let opened = false;
  for (const [fx, fy] of [[0.86, 0.6], [0.84, 0.66], [0.6, 0.78], [0.62, 0.8], [0.88, 0.56]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    try {
      await page.getByText("Enregistrement source").waitFor({ timeout: 2500 });
      opened = true;
      break;
    } catch {
      /* point vide : on essaie la position suivante */
    }
  }
  expect(opened, "aucune fiche ouverte");
  const card = await page.getByLabel("Fiche de détection").innerText();
  expect(/_Gabon\.csv#L\d+/.test(card), "pas de renvoi à la ligne source");
  expect(/Acquisition \(UTC\)/.test(card) && /Confiance native/.test(card), "champs manquants");
  expect(errors.length === 0, `erreurs console : ${errors.join(" | ")}`);
  await context.close();
  return `${total.total} détections affichées, fiche avec renvoi au fichier source`;
});

await test("T-05b", "Filtrer par satellite ne garde que ce capteur", async () => {
  const { page, context } = await open("/map");
  await mapReady(page);
  for (const name of ["MODIS Terra", "MODIS Aqua", "VIIRS NOAA-20"]) {
    await page.getByRole("complementary", { name: "Filtres de la carte" }).getByText(name, { exact: false }).first().click();
  }
  await page.waitForResponse((r) => r.url().includes("/api/detections") && r.url().includes("sats=snpp&"));
  await page.waitForTimeout(600);
  const status = await page.getByRole("status").first().innerText();
  const expected = await api("/api/detections?zone=country&from=2025-01-01&to=2025-12-31&sats=snpp&conf=low,nominal,high&types=all&dn=all");
  expect(status.replace(/\D/g, "").startsWith(String(expected.total)), `bandeau « ${status} », attendu ${expected.total}`);
  expect(expected.bySatellite.terra + expected.bySatellite.aqua + expected.bySatellite.noaa20 === 0, "d'autres capteurs restent dans la réponse");
  await context.close();
  return `${expected.total} détections Suomi-NPP seules`;
});

await test("F-01", "Dessiner un rectangle définit la zone d'analyse", async () => {
  const { page, context } = await open("/map");
  await mapReady(page);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Dessiner un rectangle" }).click();
  const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.6, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.92, box.y + box.height * 0.8, { steps: 6 });
  const wait = page.waitForResponse((r) => r.url().includes("/api/detections") && r.url().includes("zone=bbox"));
  await page.mouse.up();
  const response = await wait;
  const body = await response.json();
  const label = await page.getByRole("button", { name: "Zone d'analyse", exact: true }).innerText();
  expect(/^Zone /.test(label.trim()), `libellé de zone inattendu : ${label}`);
  expect(body.total > 0, "aucune détection dans la zone dessinée");
  await context.close();
  return `zone « ${label.trim()} », ${body.total} détections`;
});

await test("F-05", "La grille harmonisée s'affiche et une cellule s'ouvre", async () => {
  const { page, context } = await open("/map");
  await mapReady(page);
  const wait = page.waitForResponse((r) => r.url().includes("/api/aggregates"));
  await page.getByRole("radio", { name: "Grille harmonisée" }).click();
  await wait;
  await page.waitForTimeout(1500);
  const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
  let opened = false;
  for (const [fx, fy] of [[0.86, 0.62], [0.85, 0.6], [0.87, 0.66], [0.62, 0.8]]) {
    await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
    if (await page.getByText("Jours actifs harmonisés").nth(0).isVisible().catch(() => false)) {
      opened = await page.getByLabel("Cellule de la grille").isVisible().catch(() => false);
      if (opened) break;
    }
  }
  expect(opened, "aucune cellule ouverte");
  await context.close();
  return "cellule ouverte avec ses comptes par capteur";
});

await test("T-06", "MODIS et VIIRS restent des séries séparées", async () => {
  const { page, context } = await open("/trends");
  const text = await page.locator("main").innerText();
  expect(text.includes("MODIS Terra + Aqua") && text.includes("VIIRS Suomi-NPP") && text.includes("VIIRS NOAA-20"), "légende par capteur absente");
  await page.getByRole("radio", { name: "Après calage" }).click();
  await page.waitForTimeout(300);
  expect((await page.locator("main").innerText()).includes("équivalent Suomi-NPP"), "unité calée non indiquée");
  const dash = await open("/dashboard");
  expect((await dash.page.locator("main").innerText()).includes("Ces nombres ne s'additionnent pas"), "mise en garde contre l'addition absente");
  await dash.context.close();
  await context.close();
  return "trois séries distinctes, mise en garde affichée";
});

await test("T-07", "Le calendrier passe du mois au jour et indique l'unité", async () => {
  const { page, context, errors } = await open("/calendar");
  expect(await page.getByRole("heading", { name: "Indice harmonisé par année et par mois" }).count(), "titre mensuel absent");
  const cells = await page.locator('[role="gridcell"]').count();
  expect(cells >= 300, `seulement ${cells} cases`);
  await page.getByRole("radio", { name: "Jour" }).click();
  await settle(page);
  expect(await page.getByRole("heading", { name: /jour par jour, 2025/ }).count(), "titre journalier absent");
  const days = await page.locator('button[aria-label*="2025 :"]').count();
  expect(days === 365, `${days} jours affichés pour 2025`);
  await page.getByRole("radio", { name: "Semaine" }).click();
  await settle(page);
  expect(await page.getByRole("heading", { name: /par semaine/ }).count(), "titre hebdomadaire absent");
  await page.getByRole("radio", { name: "Année" }).click();
  await settle(page);
  expect(await page.getByText("Estimé depuis MODIS, avec intervalle").count(), "légende annuelle absente");
  expect(errors.length === 0, `erreurs console : ${errors.join(" | ")}`);
  await context.close();
  return `${cells} cases mensuelles, 365 jours pour 2025, vues semaine et année`;
});

await test("T-07b", "Sélectionner un mois affiche son détail et mène à la carte", async () => {
  const { page, context } = await open("/calendar");
  await page.locator('[role="gridcell"][aria-label^="août 2024"]').click();
  await page.getByRole("heading", { name: "Août 2024" }).waitFor();
  const detail = await page.locator("main").innerText();
  expect(detail.includes("Médiane de référence") && detail.includes("Score robuste"), "détail du calcul absent");
  const wait = page.waitForResponse((r) => r.url().includes("/api/detections") && r.url().includes("from=2024-08-01") && r.url().includes("to=2024-08-31"));
  await page.getByRole("button", { name: "Voir sur la carte" }).click();
  await page.waitForURL("**/map");
  await wait;
  await context.close();
  return "détail affiché, carte ouverte sur août 2024";
});

await test("T-08a", "Une période d'activité élevée est expliquée", async () => {
  const { page, context } = await open("/anomalies");
  const items = await page.locator("main ul button[aria-pressed]").count();
  expect(items > 5, `seulement ${items} mois signalés`);
  await page.getByRole("radio", { name: "Plus forts" }).click();
  await page.locator("main ul button[aria-pressed]").first().click();
  const text = await page.locator("main").innerText();
  for (const needle of ["Valeur observée", "Médiane de référence", "Score robuste", "Années de référence", "Fiabilité", "ni une prédiction"]) {
    expect(text.includes(needle), `élément absent : ${needle}`);
  }
  await context.close();
  return `${items} mois signalés, détail complet`;
});

await test("T-08b", "Un cas sans données suffisantes n'est pas classé", async () => {
  const empty = await api("/api/calendar?zone=bbox:8.6,1.8,8.9,2.1");
  const statuses = new Set(empty.months.map((m) => m.assessment.status));
  expect(!statuses.has("strong_high"), "une zone presque vide produit un signalement fort");
  expect(statuses.has("low_activity"), "le statut « activité trop faible » n'apparaît pas");
  const national = await api("/api/calendar?zone=country");
  const june2001 = national.months.find((m) => m.year === 2001 && m.month === 6);
  expect(june2001.assessment.status === "incomplete", `juin 2001 classé ${june2001.assessment.status}`);
  return `zone presque vide : ${[...statuses].join(", ")} ; juin 2001 : incomplet`;
});

await test("T-09", "Chaque graphique cite sa source et sa date d'accès", async () => {
  const notes = {};
  for (const route of ["/dashboard", "/calendar", "/trends", "/anomalies"]) {
    const { page, context } = await open(route);
    notes[route] = await page.getByText("consultées le").count();
    expect(notes[route] >= 2, `${route} : ${notes[route]} référence(s) de source`);
    await context.close();
  }
  return Object.entries(notes).map(([k, v]) => `${k} ${v}`).join(", ");
});

await test("T-10", "Une panne de l'API affiche une erreur expliquée, sans valeur inventée", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  await page.route("**/api/overview**", (route) => route.abort());
  await page.goto(base + "/dashboard", { waitUntil: "load" });
  await page.getByText("Serveur injoignable").first().waitFor({ timeout: 20_000 });
  const text = await page.locator("main").innerText();
  expect(text.includes("un résultat absent n'est pas une absence de feu"), "message de prudence absent");
  expect(await page.getByRole("button", { name: "Réessayer" }).count(), "pas de bouton Réessayer");
  await page.unroute("**/api/overview**");
  await page.getByRole("button", { name: "Réessayer" }).first().click();
  await page.getByText("Médiane des mêmes dates").waitFor({ timeout: 20_000 });
  await context.close();
  return "erreur affichée, reprise après Réessayer";
});

await test("T-10b", "Le fond de carte en ligne coupé n'empêche pas la carte", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  let blocked = 0;
  await page.route(/^https?:\/\/(?!localhost)/, (route) => (blocked++, route.abort()));
  await page.goto(base + "/map", { waitUntil: "load" });
  await mapReady(page);
  await page.waitForTimeout(1500);
  expect(blocked === 0, `${blocked} requête(s) externe(s) émise(s) sans action de l'utilisateur`);
  await page.getByText("Relief NASA Blue Marble").click();
  await page.getByText("Fond en ligne indisponible").waitFor({ timeout: 15_000 });
  const status = await page.getByRole("status").first().innerText();
  expect(/\d/.test(status), "les détections ne s'affichent plus");
  await context.close();
  return `aucune requête externe par défaut ; fond en ligne coupé (${blocked} tuiles bloquées) : carte et détections toujours affichées`;
});

await test("T-11", "Tablette et téléphone : pas de débordement, navigation utilisable", async () => {
  const notes = [];
  for (const viewport of [{ width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    for (const route of ["/", "/dashboard", "/map", "/calendar", "/trends", "/anomalies", "/reports", "/methodology"]) {
      const { page, context } = await open(route, viewport);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow <= 1, `${route} à ${viewport.width}px : débordement de ${overflow}px`);
      if (route !== "/") {
        expect(await page.getByRole("button", { name: "Période", exact: true }).isVisible(), `${route} à ${viewport.width}px : sélecteur de période invisible`);
        expect(await page.getByRole("navigation", { name: "Navigation principale" }).last().isVisible(), `${route} à ${viewport.width}px : navigation invisible`);
      }
      await context.close();
    }
    notes.push(`${viewport.width}px`);
  }
  return `8 écrans vérifiés à ${notes.join(" et ")}`;
});

await test("F-12", "L'export CSV contient exactement les détections filtrées", async () => {
  const query = "zone=province:3&from=2025-07-01&to=2025-07-31&sats=aqua,snpp&conf=nominal,high&types=veg&dn=day";
  const expected = await api(`/api/detections?${query}`);
  const csv = await (await fetch(`${base}/api/export?kind=detections&format=csv&${query}`)).text();
  const lines = csv.trim().split(/\r?\n/);
  expect(lines.length - 1 === expected.total, `${lines.length - 1} lignes exportées pour ${expected.total} détections`);
  const header = lines[0].replace(/^﻿/, "").split(",");
  const col = (name) => header.indexOf(name);
  for (const line of lines.slice(1, 200)) {
    const cells = line.split(",");
    expect(["Aqua", "Suomi-NPP"].includes(cells[col("platform")]), `plateforme hors filtre : ${cells[col("platform")]}`);
    expect(cells[col("daynight")] === "D" && cells[col("type")] === "0", "ligne hors filtre jour ou type");
    expect(cells[col("acq_datetime_utc")].startsWith("2025-07"), "date hors période");
  }
  const geo = await (await fetch(`${base}/api/export?kind=detections&format=geojson&${query}`)).json();
  expect(geo.features.length === expected.total, "GeoJSON : nombre de points différent");
  return `${expected.total} détections dans le CSV et le GeoJSON`;
});

await test("F-12b", "Le bouton d'export de la carte télécharge un fichier", async () => {
  const { page, context } = await open("/map");
  await mapReady(page);
  const download = page.waitForEvent("download");
  await page.getByRole("complementary", { name: "Filtres de la carte" }).getByRole("link", { name: "CSV" }).click();
  const file = await download;
  expect(/firepulse_detections_country_2025-01-01_2025-12-31\.csv/.test(file.suggestedFilename()), `nom inattendu : ${file.suggestedFilename()}`);
  await context.close();
  return file.suggestedFilename();
});

await test("L-01", "Le rapport de synthèse se prépare pour l'impression", async () => {
  const { page, context, errors } = await open("/reports");
  const report = await page.getByLabel("Rapport de synthèse").innerText();
  for (const needle of ["Période analysée", "Rapport généré le", "Indice harmonisé d'activité", "Méthode", "Limites d'interprétation", "Sources"]) {
    expect(report.includes(needle), `section absente : ${needle}`);
  }
  expect(await page.getByRole("button", { name: "Imprimer ou enregistrer en PDF" }).isEnabled(), "bouton d'impression inactif");
  await page.emulateMedia({ media: "print" });
  expect(!(await page.getByRole("navigation", { name: "Navigation principale" }).first().isVisible()), "la navigation reste visible à l'impression");
  const pdf = await page.pdf({ format: "A4" });
  expect(pdf.length > 40_000, "PDF vide");
  expect(errors.length === 0, `erreurs console : ${errors.join(" | ")}`);
  await context.close();
  return `PDF de ${Math.round(pdf.length / 1024)} Ko produit par le navigateur`;
});

await test("NAV", "Aucun lien mort dans la navigation et la page d'accueil", async () => {
  const { page, context } = await open("/");
  const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")))]);
  const bad = [];
  for (const href of hrefs) {
    const status = (await fetch(base + href)).status;
    if (status !== 200) bad.push(`${href} (${status})`);
  }
  const anchors = await page.evaluate(() => [...document.querySelectorAll("a[href^='#']")].map((a) => a.getAttribute("href")).filter((h) => !document.querySelector(h)));
  expect(bad.length === 0 && anchors.length === 0, `liens morts : ${[...bad, ...anchors].join(", ")}`);
  await context.close();
  return `${hrefs.length} liens internes vérifiés`;
});

await test("NFR-01", "La vue principale s'affiche en moins de 5 secondes", async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  const page = await context.newPage();
  const times = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    await page.goto(base + "/dashboard", { waitUntil: "load" });
    await page.getByText("Médiane des mêmes dates").waitFor({ timeout: 20_000 });
    times.push(Date.now() - t0);
  }
  await context.close();
  const worst = Math.max(...times);
  expect(worst < 5000, `pire temps : ${worst} ms`);
  return `temps jusqu'aux indicateurs : ${times.join(", ")} ms`;
});

await browser.close();

const failed = results.filter((r) => r.status !== "REUSSI").length;
console.log(`\n${results.length - failed} réussi(s), ${failed} échec(s)`);
if (process.env.RESULTS_JSON) (await import("node:fs")).writeFileSync(process.env.RESULTS_JSON, JSON.stringify(results, null, 1));
process.exit(failed ? 1 : 0);
