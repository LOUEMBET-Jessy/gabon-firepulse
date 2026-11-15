// Rendu du film image par image : la composition (film/composition) est servie en local, Chrome dessine
// chaque instant avec window.renderFrame(t), puis une capture JPEG est enregistree.
//
// Usage :
//   node film/tools/render.mjs <dossier composition de travail> <dossier images> [--stills 3.2,14,30]
//   (sans --stills : toutes les images de 0 a la duree du film, 30 par seconde)
// Le dossier de travail contient clips/, assets/, data.json, timing.json, envelopes.json ;
// index.html et film.js y sont copies depuis film/composition a chaque rendu.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "web", "package.json"));
const { chromium } = require("playwright-core");

const [work, frames] = process.argv.slice(2).map((p) => path.resolve(p));
const stillsArg = process.argv.indexOf("--stills");
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(",").map(Number) : null;
for (const f of ["index.html", "film.js"]) fs.copyFileSync(path.join("film", "composition", f), path.join(work, f));
fs.copyFileSync(path.join("film", "composition", "data.json"), path.join(work, "data.json"));
fs.mkdirSync(frames, { recursive: true });

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png" };
const server = http.createServer((req, res) => {
  const file = path.join(work, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(work) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(8765, "127.0.0.1", r));

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.log("erreur page :", String(e).slice(0, 300)));
await page.goto("http://127.0.0.1:8765/index.html", { waitUntil: "load" });
await page.evaluate(() => window.filmReady);
const { FPS, DURATION } = await page.evaluate(() => window.FILM);

const times = stills ?? Array.from({ length: Math.round(DURATION * FPS) }, (_, i) => i / FPS);
const t0 = Date.now();
for (let i = 0; i < times.length; i++) {
  await page.evaluate((t) => window.renderFrame(t), times[i]);
  const name = stills ? `still-${String(times[i]).replace(".", "_")}.jpg` : `${String(i + 1).padStart(5, "0")}.jpg`;
  await page.screenshot({ path: path.join(frames, name), type: "jpeg", quality: 94 });
  if (!stills && i % 300 === 0) console.log(`${i}/${times.length} images (${Math.round((Date.now() - t0) / 1000)} s)`);
}
console.log(`${times.length} image(s) en ${Math.round((Date.now() - t0) / 1000)} s`);
await browser.close();
server.close();
