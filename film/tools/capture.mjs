// Captures reelles de l'application pour le film : Chrome pilote, 1920 x 1080, ecran enregistre par
// le screencast de Chrome (images JPEG horodatees), puis clip MP4 a 30 images/s via ffmpeg.
//
// Usage : node film/tools/capture.mjs <dossier de sortie> [clip ...]
// Variables : BASE_URL (serveur Hot-Spots, defaut http://localhost:3220), FFMPEG (chemin de ffmpeg),
//             QUESTION_WAV (question parlee, pour le clip « voice »).
// Aucune donnee inventee : chaque clip montre l'application reelle et ses donnees reelles.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(path.join(process.cwd(), "web", "package.json"));
const { chromium } = require("playwright-core");

const out = path.resolve(process.argv[2] ?? "film/captures");
const only = process.argv.slice(3);
const base = process.env.BASE_URL ?? "http://localhost:3220";
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
fs.mkdirSync(out, { recursive: true });

const filters = (country = "GAB", from = "2025-01-01", to = "2025-12-31", zone = { kind: "country" }) => ({
  name: "hotspot_filters",
  value: encodeURIComponent(JSON.stringify({ country, zone, from, to })),
  url: base,
});

/** Navigateurs ouverts : tous fermes a la fin, meme apres un echec. */
const browsers = [];

async function session({ welcomed = true, globeSeen = true, cookies = [filters()], args = [], init } = {}) {
  const browser = await chromium.launch({ channel: "chrome", args: ["--autoplay-policy=no-user-gesture-required", ...args] });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: "fr-FR", colorScheme: "light", permissions: ["microphone"] });
  await context.addCookies(cookies);
  await context.addInitScript(
    ({ welcomed, globeSeen }) => {
      try {
        window.localStorage.setItem("hotspot.theme", "light");
        if (welcomed) window.localStorage.setItem("hotspot.welcomed", "1");
        if (globeSeen) window.localStorage.setItem("hotspot.globe.seen", "1");
      } catch {}
    },
    { welcomed, globeSeen },
  );
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  browsers.push(browser);
  return { browser, page };
}

/** Enregistre l'ecran pendant `scenario`, puis assemble le clip <nom>.mp4. */
async function record(name, page, scenario) {
  const dir = path.join(out, `${name}-frames`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", async (f) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(f.data, "base64"));
    frames.push({ file, t: f.metadata.timestamp });
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  const t0 = Date.now();
  await scenario();
  await cdp.send("Page.stopScreencast").catch(() => {});
  const end = Date.now();
  if (frames.length < 2) throw new Error(`${name} : aucune image`);
  // Duree de chaque image d'apres les horodatages ; la derniere tient jusqu'a la fin du scenario.
  const lines = [];
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].t : frames[0].t + (end - t0) / 1000;
    lines.push(`file '${frames[i].file.replace(/\\/g, "/")}'`, `duration ${Math.max(0.001, next - frames[i].t).toFixed(4)}`);
  }
  lines.push(`file '${frames[frames.length - 1].file.replace(/\\/g, "/")}'`);
  const list = path.join(dir, "list.txt");
  fs.writeFileSync(list, lines.join("\n"));
  const mp4 = path.join(out, `${name}.mp4`);
  const r = spawnSync(ffmpeg, ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "scale=1920:1080:flags=lanczos,fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "slow", "-crf", "15", mp4]);
  if (r.status !== 0) throw new Error(`${name} : ffmpeg ${r.stderr}`);
  console.log(`${name.padEnd(10)} ${frames.length} images, ${((end - t0) / 1000).toFixed(1)} s -> ${path.basename(mp4)}`);
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const panel = (page) => page.getByRole("complementary", { name: "Hot-Spots AI" });

/** Saisie au rythme d'une personne. */
async function typeSlowly(page, locator, text) {
  await locator.click();
  for (const ch of text) {
    await page.keyboard.type(ch);
    await wait(38 + Math.random() * 40);
  }
}

const CLIPS = {
  // Accueil : la Terre photorealiste (globe reel de la page d'accueil), textes de la page masques et globe centre
  // pour servir de plan d'ensemble. Rotation de l'Afrique vers le Gabon, satellites en orbite.
  async hero() {
    const { browser, page } = await session();
    const clean = `header, section:first-of-type > div.pointer-events-none.mx-auto { visibility: hidden !important; }
      section:first-of-type > div.absolute.-z-10 { left: 10% !important; right: 10% !important; top: 0 !important; bottom: 0 !important; height: auto !important; }
      section:first-of-type > div[aria-hidden].-z-10.pointer-events-none:not(.starfield) { display: none !important; }`;
    await page.route("**/*", (route) => route.continue());
    await page.addInitScript((css) => document.addEventListener("DOMContentLoaded", () => {
      const s = document.createElement("style");
      s.textContent = css;
      document.head.appendChild(s);
    }), clean);
    // Premier chargement : met les tuiles Blue Marble en cache, puis enregistrement d'un chargement complet.
    await page.goto(base + "/", { waitUntil: "load" });
    await wait(7000);
    await record("hero", page, async () => {
      await page.goto(base + "/", { waitUntil: "load" });
      await wait(13_000);
    });
    await browser.close();
  },

  // La Terre seule : le vrai globe 3D de la carte (Blue Marble, atmosphere, satellites MODIS et VIIRS en orbite,
  // anneaux de detections par capteur), interface masquee, fond spatial ; rotation lente a la main.
  async earth() {
    const { browser, page } = await session();
    await page.goto(base + "/map", { waitUntil: "load" });
    await page.locator(".maplibregl-canvas").waitFor();
    await wait(6000);
    await page.getByRole("button", { name: "Terre", exact: true }).first().click();
    await wait(4000);
    await page.addStyleTag({
      content: `aside, header, nav, [data-tour="map-filters"], [data-tour="map-legend"], [data-tour="assistant-launcher"],
        .maplibregl-control-container, .pointer-events-none.absolute { display: none !important; }
        .globe-backdrop, main, body, html { background: #050b14 !important; }
        main { padding: 0 !important; }`,
    });
    await wait(1500);
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, -40);
      await wait(60);
    }
    await wait(4000);
    await record("earth", page, async () => {
      // Rotation douce vers l'est : on fait glisser le globe de droite a gauche pendant tout le plan.
      await page.mouse.move(cx + 260, cy);
      await page.mouse.down();
      for (let i = 0; i <= 300; i++) {
        await page.mouse.move(cx + 260 - i * 1.7, cy + Math.sin(i / 60) * 6);
        await wait(40);
      }
      await page.mouse.up();
      await wait(800);
    });
    await browser.close();
  },

  // Globe : depuis la vue du Gabon, retour a la Terre entiere, puis plongee vers le Haut-Ogooue (tuiles en cache).
  async globe() {
    const { browser, page } = await session();
    await page.goto(base + "/map", { waitUntil: "load" });
    await page.locator(".maplibregl-canvas").waitFor();
    await wait(6000);
    await page.getByRole("button", { name: "Terre", exact: true }).first().click();
    await wait(4500);
    await page.getByRole("button", { name: "Gabon", exact: true }).first().click().catch(() => {});
    await wait(4500);
    await page.getByRole("button", { name: "Terre", exact: true }).first().click();
    await wait(3500);
    await record("globe", page, async () => {
      await wait(600);
      const search = page.getByPlaceholder(/Rechercher/);
      await typeSlowly(page, search, "Haut-Ogooué");
      await wait(500);
      await page.getByRole("listbox", { name: "Lieux trouvés" }).getByRole("button").first().click();
      await wait(6500);
    });
    await browser.close();
  },

  // Exploration jusqu'a une ville : recherche, vol, emprise des pixels sur Sentinel-2, fiche d'une detection.
  async explore() {
    const { browser, page } = await session();
    await page.goto(base + "/map", { waitUntil: "load" });
    await page.locator(".maplibregl-canvas").waitFor();
    await wait(4000);
    await record("explore", page, async () => {
      await wait(800);
      const search = page.getByPlaceholder(/Rechercher/);
      await typeSlowly(page, search, "Franceville");
      await wait(900);
      await page.getByRole("listbox", { name: "Lieux trouvés" }).getByRole("button").first().click();
      await wait(5500);
      await page.getByRole("radio", { name: "Haute résolution" }).click();
      await wait(3500);
      // Clic sur une detection au centre de la vue, s'il y en a une.
      const box = await page.locator(".maplibregl-canvas").boundingBox();
      await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.5);
      await wait(3000);
    });
    await browser.close();
  },

  // Fonds de carte : Terre, image du jour, plan ; grille harmonisee.
  async basemaps() {
    const { browser, page } = await session();
    await page.goto(base + "/map", { waitUntil: "load" });
    await page.locator(".maplibregl-canvas").waitFor();
    await wait(5000);
    // Grille harmonisee sur l'imagerie « Terre », puis passage a la haute resolution Sentinel-2.
    await record("basemaps", page, async () => {
      await wait(1200);
      await page.getByRole("radio", { name: "Grille harmonisée" }).first().click();
      await wait(2600);
      await page.getByRole("radio", { name: "Haute résolution" }).click();
      await wait(3200);
    });
    await browser.close();
  },

  // Calendrier historique : 26 ans, mois par mois.
  async calendar() {
    const { browser, page } = await session();
    await page.goto(base + "/calendar", { waitUntil: "load" });
    await wait(3000);
    await record("calendar", page, async () => {
      for (let y = 0; y <= 520; y += 4) {
        await page.mouse.wheel(0, 4);
        await wait(16);
      }
      await wait(1200);
      const cells = page.locator("[data-tour='calendar-grid'] button");
      if (await cells.count()) await cells.nth(Math.min(80, (await cells.count()) - 1)).hover();
      await wait(2000);
    });
    await browser.close();
  },

  // Comparaison des capteurs : detections brutes, cellules-jour, apres calage.
  async compare() {
    const { browser, page } = await session();
    await page.goto(base + "/compare", { waitUntil: "load" });
    await wait(2500);
    await page.evaluate(() => window.scrollTo(0, 560));
    await wait(1200);
    await record("compare", page, async () => {
      await wait(1500);
      await page.getByRole("radio", { name: /Cellules-jour/ }).first().click();
      await wait(2200);
      await page.getByRole("radio", { name: /Après calage/ }).first().click();
      await wait(2800);
    });
    await browser.close();
  },

  // Tendances : totaux annuels harmonises.
  async trends() {
    const { browser, page } = await session();
    await page.goto(base + "/trends", { waitUntil: "load" });
    await wait(3000);
    await record("trends", page, async () => {
      for (let y = 0; y <= 360; y += 3) {
        await page.mouse.wheel(0, 3);
        await wait(16);
      }
      await wait(2500);
    });
    await browser.close();
  },

  // Visite guidee : accueil de premiere visite, puis les premieres etapes.
  async tour() {
    const { browser, page } = await session({ welcomed: false });
    await page.goto(base + "/dashboard", { waitUntil: "load" });
    await panel(page).getByText("Bienvenue dans Hot-Spots").waitFor();
    await wait(1500);
    await record("tour", page, async () => {
      await wait(1200);
      await panel(page).getByRole("button", { name: "Voir la visite guidée" }).click();
      for (let i = 0; i < 3; i++) {
        await wait(2600);
        const next = page.getByRole("button", { name: /Suivant|Continuer/ }).first();
        if (await next.isVisible().catch(() => false)) await next.click();
      }
      await wait(2200);
    });
    await browser.close();
  },

  // Conversation ecrite : vraie question, vraie reponse en flux, sources citees.
  async chat() {
    const { browser, page } = await session();
    await page.goto(base + "/dashboard", { waitUntil: "load" });
    await wait(2500);
    await record("chat", page, async () => {
      await page.getByRole("button", { name: "Ouvrir Hot-Spots AI" }).click();
      await wait(1000);
      await typeSlowly(page, page.locator("#assistant-input"), "Cette période est-elle inhabituelle ?");
      await page.keyboard.press("Enter");
      await panel(page).getByText(/Chiffres lus dans/).waitFor({ timeout: 90_000 });
      await wait(3500);
    });
    await browser.close();
  },

  // Action reelle : l'assistant regle la zone et la periode, puis ouvre la carte.
  async action() {
    const { browser, page } = await session();
    await page.goto(base + "/dashboard", { waitUntil: "load" });
    await wait(2500);
    await record("action", page, async () => {
      await page.getByRole("button", { name: "Ouvrir Hot-Spots AI" }).click();
      await wait(800);
      await typeSlowly(page, page.locator("#assistant-input"), "Montre le Haut-Ogooué pendant la saison sèche 2024 sur la carte");
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/map/, { timeout: 90_000 });
      await wait(7000);
    });
    await browser.close();
  },

  // Conversation vocale : question parlee (micro simule par un fichier WAV), transcription, reponse lue.
  async voice() {
    const wav = process.env.QUESTION_WAV;
    if (!wav) throw new Error("QUESTION_WAV manquant");
    const { browser, page } = await session({
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${wav}`],
      init: () => {
        window.localStorage.setItem("hotspot.voice.engine", "server");
        window.__spoken = [];
        const speak = window.speechSynthesis.speak.bind(window.speechSynthesis);
        window.speechSynthesis.speak = (u) => {
          window.__spoken.push(u.text);
          speak(u);
        };
      },
    });
    await page.goto(base + "/dashboard", { waitUntil: "load" });
    await wait(2500);
    await record("voice", page, async () => {
      await page.getByRole("button", { name: "Ouvrir Hot-Spots AI" }).click();
      await wait(1200);
      await page.getByRole("button", { name: "Démarrer une conversation vocale" }).click();
      await page.waitForFunction(() => window.__spoken.length > 0, null, { timeout: 120_000 });
      await wait(6000);
    });
    const spoken = await page.evaluate(() => window.__spoken);
    fs.writeFileSync(path.join(out, "voice-answer.txt"), spoken.join("\n"));
    await browser.close();
  },

  // France : meme plateforme, autre territoire.
  async france() {
    const { browser, page } = await session({ cookies: [filters("FRA")] });
    await page.goto(base + "/map", { waitUntil: "load" });
    await page.locator(".maplibregl-canvas").waitFor();
    await wait(5000);
    // Leger zoom continu vers le sud de la France : la carte vit pendant le plan.
    const box = await page.locator(".maplibregl-canvas").boundingBox();
    await page.mouse.move(box.x + box.width * 0.62, box.y + box.height * 0.62);
    await record("france", page, async () => {
      for (let i = 0; i < 110; i++) {
        await page.mouse.wheel(0, -6);
        await wait(45);
      }
      await wait(1000);
    });
    await browser.close();
  },
};

for (const [name, run] of Object.entries(CLIPS)) {
  if (only.length && !only.includes(name)) continue;
  try {
    await run();
  } catch (error) {
    console.log(`${name.padEnd(10)} ECHEC ${String(error.message ?? error).slice(0, 200)}`);
  } finally {
    while (browsers.length) await browsers.pop().close().catch(() => {});
  }
}
process.exit(0);
