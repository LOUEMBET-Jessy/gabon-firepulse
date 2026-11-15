// Historique 2000 a aujourd'hui : archive prolongee par l'API FIRMS (pipeline/recent.py), Gabon et France.
// Usage : node e2e/history.mjs (BASE_URL facultatif). Necessite l'archive prolongee.
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
    console.log(`${id.padEnd(6)} REUSSI  ${title.padEnd(62)} ${note ?? ""}`);
  } catch (error) {
    results.push("ko");
    console.log(`${id.padEnd(6)} ECHEC   ${title.padEnd(62)} ${String(error.message ?? error).split("\n")[0]}`);
  }
}
async function open(route, filters) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-FR" });
  if (filters) await context.addCookies([{ name: "hotspot_filters", value: encodeURIComponent(JSON.stringify(filters)), url: base }]);
  await context.addInitScript(() => {
    window.localStorage.setItem("hotspot.welcomed", "1");
    window.localStorage.setItem("hotspot.globe.seen", "1");
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && errors.push(m.text().split("\n")[0]));
  await page.goto(base + route, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".skeleton").length === 0, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  return { page, context, errors };
}

for (const country of ["GAB", "FRA"]) {
  const meta = await api(`/api/metadata?country=${country}`);
  const last = meta.coverage.lastDate;
  const name = meta.countryName;

  await test(`H-${country}1`, `${name} : l'archive couvre 2000 à ${last}`, async () => {
    expect(last >= "2026-11-01", `couverture arrêtée au ${last}`);
    expect(meta.recent && meta.recent.provisionalFrom, "début des données provisoires inconnu");
    return `du ${meta.coverage.firstDate} au ${last}, provisoire depuis le ${meta.recent.provisionalFrom}`;
  });

  await test(`H-${country}2`, `${name} : « Tout l'historique » jusqu'à 2026 sur la vue d'ensemble`, async () => {
    const { page, context, errors } = await open("/dashboard", { country, zone: { kind: "country" }, from: "2025-01-01", to: "2025-12-31" });
    await page.getByRole("button", { name: "Période", exact: true }).click();
    const wait = page.waitForResponse((r) => r.url().includes("/api/overview") && r.url().includes(`to=${last}`));
    await page.getByRole("button", { name: "Tout l'historique" }).click();
    await wait;
    await page.waitForTimeout(1500);
    const expected = await api(`/api/overview?zone=country&from=2000-11-01&to=${last}&country=${country}`);
    const block = await page.locator("text=cellules-jour actives").first().locator("xpath=..").innerText();
    const shown = Number(block.replace(/[^\d]/g, "").slice(0, String(Math.round(expected.harmonized)).length));
    expect(shown === Math.round(expected.harmonized), `affiché ${shown}, API ${Math.round(expected.harmonized)}`);
    const banner = await page.locator("main").innerText();
    expect(/Données provisoires depuis le/.test(banner), "bandeau provisoire absent");
    expect(errors.length === 0, errors.join(" | "));
    await context.close();
    return `indice 2000-2026 : ${shown} cellules-jour`;
  });

  await test(`H-${country}3`, `${name} : 2026 dans le calendrier et les tendances`, async () => {
    const { page, context, errors } = await open("/calendar", { country, zone: { kind: "country" }, from: "2026-01-01", to: last });
    const cal = await api(`/api/calendar?zone=country&country=${country}`);
    const months2026 = cal.months.filter((m) => m.year === 2026);
    expect(months2026.length >= 10, `${months2026.length} mois 2026 dans l'API`);
    const cells = await page.locator('[role="gridcell"][aria-label*="2026"]').count();
    expect(cells >= 10, `${cells} cases 2026 dans le calendrier`);
    const aug = months2026.find((m) => m.month === 8);
    await page.goto(base + "/trends", { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const year2026 = cal.years.find((y) => y.year === 2026);
    expect(year2026 && !year2026.complete, "2026 devrait être une année incomplète");
    expect(errors.length === 0, errors.join(" | "));
    await context.close();
    return `${months2026.length} mois 2026, août 2026 : ${Math.round(aug?.harmonized ?? 0)} cellules-jour (${aug?.assessment.status}), année 2026 incomplète : ${Math.round(year2026.harmonized)}`;
  });
}

await browser.close();
const failed = results.filter((r) => r !== "ok").length;
console.log(`\n${results.length - failed} réussi(s), ${failed} échec(s)`);
process.exit(failed ? 1 : 0);
