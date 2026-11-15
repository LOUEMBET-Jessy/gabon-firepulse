// Test de lecture reel : chaque MP4 est lu par le lecteur HTML5 de Chrome (chargement, son, lecture, saut a la fin).
// Usage : node film/tools/playtest.mjs film/hotspot-film.mp4 film/hotspot-film-sous-titres.mp4
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "web", "package.json"));
const { chromium } = require("playwright-core");
const files = process.argv.slice(2).map((f) => path.resolve(f));

// Serveur local avec requetes partielles (Range), comme un vrai hebergement video.
const server = http.createServer((req, res) => {
  const file = files.find((f) => req.url === "/" + path.basename(f));
  if (!file) return res.writeHead(404).end();
  const size = fs.statSync(file).size;
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { "Content-Type": "video/mp4", "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": size, "Accept-Ranges": "bytes" });
    fs.createReadStream(file).pipe(res);
  }
});
await new Promise((r) => server.listen(8766, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage();
let failed = 0;
for (const f of files) {
  const name = path.basename(f);
  await page.setContent(`<video id="v" src="http://127.0.0.1:8766/${name}" muted playsinline preload="auto"></video>`);
  const r = await page.evaluate(async () => {
    const v = document.getElementById("v");
    const once = (ev) => new Promise((ok, ko) => {
      v.addEventListener(ev, ok, { once: true });
      v.addEventListener("error", () => ko(new Error(`erreur média ${v.error?.code} ${v.error?.message ?? ""}`)), { once: true });
    });
    // Les metadonnees peuvent etre deja chargees : on n'attend l'evenement que si necessaire.
    if (v.error) throw new Error(`erreur média ${v.error.code} ${v.error.message ?? ""}`);
    if (v.readyState < 1) await once("loadedmetadata");
    const info = { duration: v.duration, width: v.videoWidth, height: v.videoHeight, audio: (v.audioTracks?.length ?? null) };
    await v.play();
    await new Promise((ok) => setTimeout(ok, 2500));
    info.playedTo = v.currentTime;
    info.frames = v.getVideoPlaybackQuality?.().totalVideoFrames ?? null;
    info.dropped = v.getVideoPlaybackQuality?.().droppedVideoFrames ?? null;
    v.currentTime = v.duration - 1.5;
    await once("seeked");
    await new Promise((ok) => setTimeout(ok, 1800));
    info.ended = v.ended || v.currentTime >= v.duration - 0.1;
    return info;
  }).catch((e) => ({ error: String(e) }));
  const ok = !r.error && r.width === 1920 && r.height === 1080 && r.playedTo > 1.5 && r.ended && r.duration <= 90;
  if (!ok) failed++;
  console.log(`${ok ? "LECTURE OK" : "ÉCHEC"}  ${name}  ${JSON.stringify(r)}`);
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
