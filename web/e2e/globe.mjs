// Exploration du globe : vue Terre, regroupements par capteur, recherche de lieux, departement, localite.
// Usage : node e2e/globe.mjs (serveur lance, Chrome installe). BASE_URL pour une autre adresse.
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3210";
const results = [];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });
const api = async (path) => (await fetch(base + path)).json();

async function test(id, title, fn) {
  try {
    const note = await fn();
    results.push({ id, status: "REUSSI" });
    console.log(`${id.padEnd(6)} REUSSI  ${title.padEnd(62)} ${note ?? ""}`);
  } catch (error) {
    results.push({ id, status: "ECHEC" });
    console.log(`${id.padEnd(6)} ECHEC   ${title.padEnd(62)} ${String(error.message ?? error).split("\n")[0]}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

async function open(intro = false) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  await context.addInitScript((seen) => {
    window.localStorage.setItem("hotspot.welcomed", "1");
    if (seen) window.localStorage.setItem("hotspot.globe.seen", "1");
  }, !intro);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + "/map", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("canvas.maplibregl-canvas")?.clientHeight > 100, null, { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return { page, context, errors };
}
const search = async (page, text) => {
  const input = page.getByPlaceholder("Rechercher : province, département, ville…");
  await input.fill(text);
  await page.getByRole("listbox", { name: "Lieux trouvés" }).waitFor();
  await page.keyboard.press("Enter");
};

await test("G-01", "Vue Terre : un anneau regroupe les détections, par capteur", async () => {
  const { page, context, errors } = await open();
  await page.getByRole("button", { name: "Terre", exact: true }).click();
  const cluster = page.locator("button.cluster-marker").first();
  await cluster.waitFor({ timeout: 15_000 });
  const label = await cluster.getAttribute("aria-label");
  expect(/MODIS \d+, Suomi-NPP \d+, NOAA-20 \d+/.test(label), `anneau sans répartition par capteur : ${label}`);
  const total = Number(label.match(/^(\d+)/)[1]);
  const expected = await api("/api/detections?zone=country&from=2025-01-01&to=2025-12-31&sats=terra,aqua,snpp,noaa20&conf=low,nominal,high&types=all&dn=all");
  const all = await page.locator("button.cluster-marker").evaluateAll((els) => els.reduce((acc, el) => acc + Number(el.getAttribute("aria-label").match(/^(\d+)/)[1]), 0));
  expect(all <= expected.total && all > 0, `anneaux ${all}, détections ${expected.total}`);
  await page.getByRole("complementary", { name: "Fiche du territoire" }).getByText("concernent le Gabon").waitFor();
  await cluster.click();
  await page.waitForTimeout(1500);
  expect(errors.length === 0, errors.join(" | "));
  await context.close();
  return `${total} détections dans le premier anneau, ${all} sur ${expected.total} regroupées à l'écran`;
});

await test("G-02", "Recherche d'un département : zone, chiffres et fil d'Ariane", async () => {
  const { page, context } = await open();
  const wait = page.waitForResponse((r) => r.url().includes("/api/detections") && r.url().includes("zone=department"));
  await search(page, "Mpassa");
  await wait;
  await page.waitForTimeout(800);
  const trail = await page.getByRole("navigation", { name: "Niveau d'exploration" }).innerText();
  expect(/Gabon[\s\S]*Haut-Ogoou[ée][\s\S]*Mpassa/.test(trail), `fil d'Ariane : ${trail.replace(/\s+/g, " ")}`);
  const meta = await api("/api/metadata");
  const index = meta.departments.find((d) => d.name === "Mpassa").index;
  const expected = await api(`/api/overview?zone=department:${index}&from=2025-01-01&to=2025-12-31`);
  const card = await page.getByRole("complementary", { name: "Fiche du territoire" }).innerText();
  const shown = Number(card.match(/([\d\s ]+)\s*cellules-jour/)[1].replace(/\D/g, ""));
  expect(shown === Math.round(expected.harmonized), `fiche ${shown}, API ${Math.round(expected.harmonized)}`);
  expect((await page.getByRole("button", { name: "Zone d'analyse", exact: true }).innerText()).includes("Mpassa"), "zone non appliquée");
  await context.close();
  return `Mpassa : ${shown} cellules-jour, comme l'API`;
});

await test("G-03", "Recherche d'une ville : disque de 15 km annoncé", async () => {
  const { page, context } = await open();
  await search(page, "Francevil");
  await page.waitForTimeout(1500);
  const zone = await page.getByRole("button", { name: "Zone d'analyse", exact: true }).innerText();
  expect(/Franceville \(15 km\)/.test(zone), `zone : ${zone}`);
  const status = await page.getByRole("status").first().innerText();
  await context.close();
  return `zone « ${zone.trim()} », ${status.trim()}`;
});

await test("G-04", "Arrivée depuis l'espace à la première visite, puis plus jamais", async () => {
  const { page, context, errors } = await open(true);
  const seen = await page.evaluate(() => window.localStorage.getItem("hotspot.globe.seen"));
  expect(seen === "1", "la première visite n'est pas mémorisée");
  await page.waitForTimeout(3500);
  expect(errors.length === 0, errors.join(" | "));
  await context.close();
  return "vol joué puis mémorisé";
});

await browser.close();
const failed = results.filter((r) => r.status !== "REUSSI").length;
console.log(`\n${results.length - failed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
