// Observatoire temps reel : donnees NASA FIRMS reelles (reseau requis). Usage : node e2e/live.mjs (BASE_URL facultatif).
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
async function open() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  await context.addInitScript(() => {
    window.localStorage.setItem("hotspot.welcomed", "1");
    window.localStorage.setItem("hotspot.globe.seen", "1");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + "/map", { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelector("canvas.maplibregl-canvas")?.clientHeight > 100, null, { timeout: 30_000 });
  const ready = page.waitForResponse((r) => r.url().includes("/api/live"), { timeout: 120_000 });
  await page.getByRole("radio", { name: "Temps réel" }).click();
  await ready;
  await page.waitForTimeout(1500);
  return { page, context, errors };
}

await test("L-01", "Le temps réel affiche les détections FIRMS servies par l'API", async () => {
  const { page, context, errors } = await open();
  const expected = await api("/api/live?territories=GAB,FRA&days=7&sats=terra,aqua,snpp,noaa20,noaa21");
  const status = await page.getByRole("status").first().innerText();
  const shown = Number(status.replace(/\s/g, "").match(/^(\d+)/)[1]);
  expect(shown === expected.counts.total, `affiché ${shown}, API ${expected.counts.total}`);
  expect(/synchro/.test(status), "date de synchronisation absente");
  const feeds = await page.getByRole("region", { name: "Synchronisation NASA FIRMS" }).innerText();
  expect(/MODIS Terra et Aqua, Gabon/.test(feeds) && /NOAA-21, France/.test(feeds), "état des flux incomplet");
  expect(errors.length === 0, errors.join(" | "));
  await context.close();
  return `${shown} détections (Gabon ${expected.counts.byTerritory.GAB ?? 0}, France ${expected.counts.byTerritory.FRA ?? 0}), flux : ${expected.feeds.map((f) => `${f.territory}/${f.feed}=${f.status}`).join(" ")}`;
});

await test("L-02", "Filtres pays et satellite : le compte suit l'API", async () => {
  const { page, context } = await open();
  const panel = page.getByRole("complementary", { name: "Filtres de la carte" });
  await panel.getByRole("checkbox", { name: /^Gabon/ }).click();
  const terra = panel.getByRole("checkbox", { name: /MODIS Terra/ });
  const wait = page.waitForResponse((r) => r.url().includes("/api/live") && r.url().includes("territories=FRA&") && !r.url().includes("terra"), { timeout: 60_000 });
  await terra.click();
  await wait;
  await page.waitForTimeout(800);
  const expected = await api("/api/live?territories=FRA&days=7&sats=aqua,snpp,noaa20,noaa21");
  const status = await page.getByRole("status").first().innerText();
  const shown = Number(status.replace(/\s/g, "").match(/^(\d+)/)[1]);
  expect(shown === expected.counts.total, `affiché ${shown}, API ${expected.counts.total}`);
  await context.close();
  return `France sans Terra : ${shown}`;
});

await test("L-03", "La France et ses régions, puis une détection et sa fiche", async () => {
  const { page, context } = await open();
  await page.getByRole("group", { name: "Pays observés" }).getByRole("button", { name: /^France/ }).click();
  const card = page.getByRole("complementary", { name: "Fiche du territoire observé" });
  await card.getByText("Régions").waitFor();
  const text = await card.innerText();
  expect(/France métropolitaine/.test(text), "fiche France absente");
  await page.waitForTimeout(2500);
  const box = await page.locator("canvas.maplibregl-canvas").boundingBox();
  let opened = false;
  for (let gy = 0.15; gy < 0.9 && !opened; gy += 0.035) for (let gx = 0.42; gx < 0.98 && !opened; gx += 0.025) {
    await page.mouse.click(box.x + box.width * gx, box.y + box.height * gy);
    opened = await page.getByRole("complementary", { name: "Fiche de détection récente" }).isVisible().catch(() => false);
  }
  if (!opened) {
    await context.close();
    return "fiche France affichée ; aucune détection cliquable à l'écran pour ces données";
  }
  const detail = await page.getByRole("complementary", { name: "Fiche de détection récente" }).innerText();
  expect(/Acquisition \(UTC\)/.test(detail) && /Dernière synchronisation/.test(detail) && /Confiance native/.test(detail), "champs manquants");
  expect(/Ni incendie confirmé/.test(detail), "mise en garde absente");
  await context.close();
  return "fiche France, puis fiche d'une détection avec acquisition, capteur, confiance et synchronisation";
});

await browser.close();
const failed = results.filter((r) => r !== "ok").length;
console.log(`\n${results.length - failed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
