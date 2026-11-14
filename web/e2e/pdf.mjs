// Produit le PDF du rapport de synthese tel que le navigateur l'imprime. Usage : node e2e/pdf.mjs <fichier.pdf>
import { chromium } from "playwright-core";

const out = process.argv[2] ?? "rapport.pdf";
const base = process.env.BASE_URL ?? "http://localhost:3210";
const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL ?? "chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "fr-FR" });
await page.goto(base + "/reports", { waitUntil: "load" });
await page.waitForFunction(() => document.querySelectorAll(".skeleton").length === 0);
await page.waitForTimeout(1200);
await page.emulateMedia({ media: "print" });
await page.waitForTimeout(600);
await page.pdf({ path: out, format: "A4", printBackground: true });
await browser.close();
console.log("PDF ecrit :", out);
