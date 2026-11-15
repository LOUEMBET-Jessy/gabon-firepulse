// Archive de la France metropolitaine : bascule de pays, chiffres identiques a l'API, exports du bon pays.
// Usage : node e2e/france.mjs (BASE_URL facultatif).
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3210";
const results = [];
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });
const api = async (path) => (await fetch(base + path)).json();
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
async function test(id, title, fn) {
  try {
    const note = await fn();
    results.push("ok");
    console.log(`${id.padEnd(6)} REUSSI  ${title.padEnd(60)} ${note ?? ""}`);
  } catch (error) {
    results.push("ko");
    console.log(`${id.padEnd(6)} ECHEC   ${title.padEnd(60)} ${String(error.message ?? error).split("\n")[0]}`);
  }
}
async function open(route) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  await context.addInitScript(() => {
    window.localStorage.setItem("hotspot.welcomed", "1");
    window.localStorage.setItem("hotspot.globe.seen", "1");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().split("\n")[0]));
  await page.goto(base + route, { waitUntil: "load" });
  return { page, context, errors };
}

await test("FR-01", "Le sélecteur bascule la vue d'ensemble sur la France", async () => {
  const { page, context, errors } = await open("/dashboard");
  await page.getByText("Médiane des mêmes dates").waitFor({ timeout: 30_000 });
  const wait = page.waitForResponse((r) => r.url().includes("/api/overview") && r.url().includes("country=FRA"));
  await page.getByRole("radiogroup", { name: "Pays analysé" }).getByRole("radio", { name: "France" }).click();
  await wait;
  await page.waitForTimeout(1200);
  const expected = await api("/api/overview?zone=country&from=2025-01-01&to=2025-12-31&country=FRA");
  const block = await page.locator("text=cellules-jour actives").first().locator("xpath=..").innerText();
  const shown = Number(block.replace(/[^\d]/g, "").slice(0, String(Math.round(expected.harmonized)).length));
  expect(shown === Math.round(expected.harmonized), `affiché ${shown}, API ${Math.round(expected.harmonized)}`);
  expect((await page.getByRole("button", { name: "Zone d'analyse", exact: true }).innerText()).includes("France métropolitaine"), "zone non basculée");
  expect(errors.length === 0, errors.join(" | "));
  await context.close();
  return `indice France 2025 : ${shown}, comme l'API`;
});

await test("FR-02", "Le choix du pays suit la navigation et les exports", async () => {
  const { page, context } = await open("/dashboard");
  await page.getByRole("radiogroup", { name: "Pays analysé" }).getByRole("radio", { name: "France" }).click();
  await page.waitForTimeout(800);
  await page.goto(base + "/calendar", { waitUntil: "load" });
  const csv = page.getByRole("link", { name: /Série mensuelle/ });
  await csv.waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => a.href.includes("kind=monthly") && a.href.includes("country=FRA")), null, { timeout: 15_000 });
  const lead = await page.locator("main").innerText();
  expect(/pour France métropolitaine/.test(lead), "calendrier pas en France après rechargement");
  await context.close();
  return "calendrier rendu en France après rechargement, export « country=FRA »";
});

await test("FR-03", "Une région française devient zone d'analyse", async () => {
  const { page, context } = await open("/dashboard");
  await page.getByRole("radiogroup", { name: "Pays analysé" }).getByRole("radio", { name: "France" }).click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Zone d'analyse", exact: true }).click();
  const wait = page.waitForResponse((r) => r.url().includes("/api/overview") && r.url().includes("country=FRA") && r.url().includes("province%3A"));
  await page.getByRole("dialog", { name: "Choisir la zone d'analyse" }).getByRole("button", { name: /Nouvelle-Aquitaine/ }).click();
  await wait;
  await page.waitForTimeout(800);
  expect((await page.getByText("pour Nouvelle-Aquitaine").count()) > 0, "titre sans la région");
  await context.close();
  return "Nouvelle-Aquitaine appliquée à la vue d'ensemble";
});

await browser.close();
const failed = results.filter((r) => r !== "ok").length;
console.log(`\n${results.length - failed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
