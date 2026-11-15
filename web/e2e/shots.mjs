// Parcourt chaque ecran dans un vrai navigateur, releve les erreurs de console et enregistre des captures.
// Usage : node e2e/shots.mjs <dossier de sortie> [largeur] [hauteur]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const out = process.argv[2] ?? "e2e/output";
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
const base = process.env.BASE_URL ?? "http://localhost:3210";
const pages = (process.env.PAGES ?? "/,/dashboard,/map,/calendar,/trends,/anomalies,/compare,/statistics,/reports,/methodology").split(",");

mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: "fr-FR" });
// THEME=light|dark : force le theme memorise avant le chargement de chaque page.
if (process.env.THEME) await context.addInitScript((t) => localStorage.setItem("firepulse.theme", t), process.env.THEME);
let failures = 0;

for (const route of pages) {
  const page = await context.newPage();
  const problems = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 300)}`);
  });
  page.on("pageerror", (e) => problems.push(`exception: ${String(e).slice(0, 300)}`));
  page.on("requestfailed", (r) => problems.push(`requete echouee: ${r.url()} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => {
    if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
  });
  // "networkidle" n'est jamais atteint sur les ecrans avec carte (le script du worker reste compte comme en cours).
  await page.goto(base + route, { waitUntil: "load", timeout: 90_000 });
  await page.waitForFunction(() => document.querySelectorAll(".skeleton").length === 0, null, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(route === "/map" || route === "/dashboard" ? 3000 : 1200);
  // Defilement complet : declenche les apparitions a l'entree dans la fenetre avant la capture pleine page.
  if (route !== "/map") {
    await page.evaluate(async () => {
      for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(900);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) problems.push(`debordement horizontal de ${overflow}px`);
  const skeletons = await page.locator(".skeleton").count();
  if (skeletons > 0) problems.push(`${skeletons} zone(s) encore en chargement`);
  const name = `${process.env.THEME ?? "default"}_${width}_${route === "/" ? "home" : route.slice(1)}`;
  await page.screenshot({ path: path.join(out, `${name}.png`), fullPage: route !== "/map" });
  console.log(`${route.padEnd(14)} ${problems.length ? "PROBLEMES" : "ok"}`);
  for (const p of problems) console.log(`   - ${p}`);
  failures += problems.length;
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
