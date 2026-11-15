/*
 * Hot-Spots — film promotionnel (86,5 s, 1920 x 1080, 30 i/s).
 * Composition deterministe : window.renderFrame(t) dessine l'image a l'instant t (secondes).
 * Toutes les images d'application sont des captures reelles (clips/<nom>/<n>.jpg), toutes les donnees
 * viennent de data.json (serveur Hot-Spots, fichiers NASA FIRMS), le minutage de timing.json (voix off).
 *
 * Scenes : 1 Probleme 0-12,4 · 2 Solution 12,4-24,8 · 3 Fonctionnalites 24,8-46 · 4 Assistant 46-68,2 · 5 Impact 68,2-86,5
 */

const W = 1920;
const H = 1080;
const FPS = 30;
const DURATION = 86.5;

/* ------------------------------------------------------------------ outils */

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeExpo = (k) => (k >= 1 ? 1 : 1 - Math.pow(2, -10 * k));
/** Opacite d'un element visible de a a b, avec fondus d'entree et de sortie. */
const vis = (t, a, b, fin = 0.5, fout = 0.5) => (t < a || t > b ? 0 : Math.min(fin ? prog(t, a, a + fin) : 1, fout ? 1 - prog(t, b - fout, b) : 1));
const nb = (n) => n.toLocaleString("fr-FR").replace(/\s/g, " ");
const $ = (tag, css = "", parent = stage, html = "") => {
  const el = document.createElement(tag);
  if (css) el.style.cssText = css;
  if (html) el.innerHTML = html;
  parent.appendChild(el);
  return el;
};
const set = (el, styles) => Object.assign(el.style, styles);
const stage = document.getElementById("stage");

let DATA, TIMING, COUNTS, ENV;

/** Instant (s) d'un mot de la voix off : premiere occurrence de `word` dans la ligne contenant `inLine`. */
function wordAt(inLine, word) {
  for (const scene of TIMING)
    for (const ln of scene.lines)
      if (ln.text.includes(inLine)) {
        const w = ln.words.find((x) => x.text.toLowerCase().replace(/[^a-zàâçéèêëîïôûùüÿœ-]/g, "") === word.toLowerCase());
        if (w) return ln.at + w.start;
        return ln.at;
      }
  return 0;
}
const lineAt = (inLine) => {
  for (const scene of TIMING) for (const ln of scene.lines) if (ln.text.includes(inLine)) return ln;
  return null;
};

/* ------------------------------------------------------------------ clips */

class Clip {
  constructor(name, css, parent = stage) {
    this.name = name;
    this.box = $("div", css, parent);
    this.box.className = "clip";
    this.img = $("img", "", this.box);
    this.src = "";
  }
  /** Affiche l'image du clip a l'instant local `local` (secondes). */
  frame(local) {
    const count = COUNTS[this.name];
    const n = clamp(Math.floor(local * FPS) + 1, 1, count);
    const src = `clips/${this.name}/${String(n).padStart(5, "0")}.jpg`;
    if (src === this.src) return null;
    this.src = src;
    this.img.src = src;
    return this.img.decode().catch(() => {});
  }
}

/* ------------------------------------------------------------------ construction */

let L = {};

function build() {
  // Fonds : espace (ouverture, fin) et ivoire « Terre vivante » (demonstrations).
  L.space = $("div", "position:absolute;inset:0;background:radial-gradient(120% 90% at 60% 40%, #0b1a2c 0%, #050b14 70%);");
  L.stars = $("canvas", "position:absolute;inset:0;");
  L.stars.width = W;
  L.stars.height = H;
  L.light = $("div", "position:absolute;inset:0;opacity:0;background:radial-gradient(70% 60% at 78% 20%, rgb(79 163 107 / 0.16), transparent 70%), radial-gradient(60% 60% at 10% 90%, rgb(14 124 134 / 0.10), transparent 70%), #f7f5ef;");
  // Courbes de niveau discretes sur le fond clair (relief stylise).
  L.topo = $("div", "position:absolute;inset:0;opacity:0;", stage);
  L.topo.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${Array.from({ length: 9 }, (_, i) => `<ellipse cx="${1540 + i * 6}" cy="${880 - i * 4}" rx="${120 + i * 70}" ry="${80 + i * 46}" fill="none" stroke="#1f6b45" stroke-opacity="${0.07 - i * 0.004}" stroke-width="1.4" transform="rotate(-14 1540 880)"/>`).join("")}</svg>`;

  /* --- Scene 1 : donnees brutes qui defilent --- */
  L.rain = $("div", "position:absolute;inset:0;opacity:0;");
  const rows = (r, color) => [r.header, ...r.rows, ...r.rows].map((x) => x.split(",").slice(0, 9).join("  ")).join("\n");
  L.rainA = $("pre", `left:70px;top:0;color:#e4572e;`, L.rain, rows(DATA.rawModis));
  L.rainA.className = "raw";
  L.rainB = $("pre", `left:1000px;top:0;color:#5e9be6;`, L.rain, rows(DATA.rawViirs));
  L.rainB.className = "raw";
  L.rainShade = $("div", "position:absolute;inset:0;background:radial-gradient(60% 55% at 50% 50%, rgb(5 11 20 / 0.92), rgb(5 11 20 / 0.55) 70%, rgb(5 11 20 / 0.2));", L.rain);

  L.s1a = $("div", "position:absolute;left:0;right:0;top:330px;text-align:center;opacity:0;color:#f2f6f3;");
  L.s1aTitle = $("div", "font-size:84px;line-height:1.05;", L.s1a, "Chaque jour,<br/>la Terre brûle quelque part.");
  L.s1aTitle.className = "display";
  L.s1aCount = $("div", "margin-top:46px;display:flex;justify-content:center;gap:90px;font-size:26px;color:#c9d6cf;", L.s1a);
  const d = DATA.gab2025.detections;
  const modis = d.terra + d.aqua;
  const viirs = d.snpp + d.noaa20;
  L.cModis = $("div", "text-align:center", L.s1aCount, `<div class="mono" style="font-size:64px;color:#ff7a52;font-weight:500">${nb(modis)}</div><div>détections MODIS</div>`);
  L.cViirs = $("div", "text-align:center", L.s1aCount, `<div class="mono" style="font-size:64px;color:#6aa9ee;font-weight:500">${nb(viirs)}</div><div>détections VIIRS</div>`);
  L.s1aNote = $("div", "margin-top:26px;font-size:21px;color:#9fb0a6;", L.s1a, "Gabon, 2025 · données NASA FIRMS");

  /* --- Scene 1 : deux tailles de pixels sur une vraie image Sentinel-2 --- */
  L.pix = $("div", "position:absolute;inset:0;opacity:0;");
  const panel = (x, label, sub, color, cell) => {
    const p = $("div", `position:absolute;left:${x}px;top:170px;width:720px;height:720px;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px -20px rgb(0 0 0 / 0.7);`, L.pix);
    const g = $("div", "position:absolute;inset:0;display:grid;grid-template-columns:1fr 1fr;", p);
    for (const k of ["00", "10", "01", "11"]) $("img", "width:100%;height:100%;object-fit:cover;", g).src = `assets/s2-${k}.jpg`;
    const n = Math.round(720 / cell);
    const lines = [];
    for (let i = 0; i <= n; i++) lines.push(`<line x1="${i * cell}" y1="0" x2="${i * cell}" y2="720"/>`, `<line x1="0" y1="${i * cell}" x2="720" y2="${i * cell}"/>`);
    const svg = $("div", "position:absolute;inset:0;", p, `<svg width="720" height="720"><g stroke="${color}" stroke-width="${cell > 100 ? 3 : 1.6}" stroke-opacity="0.95">${lines.join("")}</g></svg>`);
    const hot = $("div", `position:absolute;left:${cell * 2}px;top:${cell * 2}px;width:${cell}px;height:${cell}px;background:${color};opacity:0.55;`, p);
    const cap = $("div", `position:absolute;left:${x}px;top:910px;width:720px;color:#f2f6f3;`, L.pix, `<div style="font-size:40px;font-weight:600">${label}</div><div style="font-size:24px;color:#c9d6cf;margin-top:6px">${sub}</div>`);
    return { p, svg, hot, cap };
  };
  // Echelle : 720 px pour 4,9 km (tuiles z13 x 2) -> 1 km ~ 147 px, 375 m ~ 55 px.
  L.pixA = panel(180, "MODIS", "pixel d'environ 1 km", "#ff6a3d", 147);
  L.pixB = panel(1020, "VIIRS", "pixel de 375 m", "#5ea2f0", 55);
  L.pixCredit = $("div", "position:absolute;right:40px;bottom:26px;font-size:16px;color:#7f8f86;", L.pix, "Image : Sentinel-2 cloudless 2023 (EOX), Haut-Ogooué");

  /* --- Scene 1 et 2 : series annuelles reelles --- */
  L.chart = $("div", "position:absolute;inset:0;opacity:0;");
  L.chartSvg = $("div", "", L.chart);
  L.chartTitle = $("div", "position:absolute;left:160px;top:96px;color:#f2f6f3;", L.chart);
  const both = DATA.years.filter((y) => y.viirs);
  const ratio = both.reduce((a, y) => a + y.viirs, 0) / both.reduce((a, y) => a + y.modis, 0);
  L.ratio = $("div", "position:absolute;left:160px;top:150px;color:#f2f6f3;opacity:0;", L.chart, `<div class="mono" style="font-size:112px;font-weight:500;line-height:1">×${ratio.toFixed(1).replace(".", ",")}</div><div style="font-size:26px;color:#c9d6cf;margin-top:10px">plus de détections VIIRS que MODIS, pour la même activité</div>`);
  drawChart();

  /* --- Clips plein cadre --- */
  L.full = new Clip("earth", "left:0;top:0;width:1920px;height:1080px;opacity:0;mix-blend-mode:lighten;");
  L.full2 = new Clip("globe", "left:0;top:0;width:1920px;height:1080px;opacity:0;");
  L.flash = $("div", "position:absolute;inset:0;background:#fff;opacity:0;");
  L.vignette = $("div", "position:absolute;inset:0;opacity:0;background:radial-gradient(75% 75% at 50% 50%, transparent 55%, rgb(5 11 20 / 0.75));");

  /* --- Scene 2 : logo et mission --- */
  L.logo = $("div", "position:absolute;left:150px;top:390px;opacity:0;color:#f2f6f3;");
  L.logoMark = $("div", "", L.logo, brandMark(120));
  L.logoWord = $("div", "font-size:150px;font-weight:700;letter-spacing:-0.04em;line-height:1;margin-top:34px;", L.logo, `Hot<span style="color:#f9a03f">-</span>Spots`);
  L.logoSub = $("div", "font-size:32px;color:#c9d6cf;margin-top:26px;", L.logo, "Les feux vus de l'espace, depuis 2000 · MODIS et VIIRS réunis");
  L.mission = $("div", "position:absolute;left:150px;bottom:150px;display:flex;gap:56px;color:#f2f6f3;", stage);
  L.missionWords = ["Observer", "Harmoniser", "Comprendre"].map((w) => {
    const el = $("div", "font-size:76px;opacity:0;", L.mission, w);
    el.className = "display";
    return el;
  });
  L.harmo = $("div", "position:absolute;right:120px;top:120px;width:640px;padding:28px 32px;border-radius:22px;opacity:0;background:rgb(5 11 20 / 0.55);backdrop-filter:blur(14px);border:1px solid rgb(255 255 255 / 0.12);color:#f2f6f3;");
  L.harmoSvg = $("div", "", L.harmo);

  /* --- Scenes 3 et 4 : clip dans un cadre, titres --- */
  L.ambient = new Clip("globe", "left:160px;top:180px;width:1600px;height:900px;opacity:0;filter:blur(60px) saturate(1.2);");
  L.frameWrap = $("div", "position:absolute;left:0;top:0;width:1920px;height:1080px;perspective:2200px;opacity:0;");
  L.frame = $("div", "left:300px;top:250px;width:1440px;height:810px;", L.frameWrap);
  L.frame.className = "frame";
  L.inner = new Clip("globe", "left:0;top:0;width:1440px;height:810px;", L.frame);
  L.fast = $("div", "right:22px;top:20px;opacity:0;", L.frame, "");
  L.fast.className = "badge";
  L.head = $("div", "position:absolute;left:300px;top:78px;opacity:0;color:var(--ink);");
  L.kicker = $("div", "color:var(--primary);", L.head);
  L.kicker.className = "kicker";
  L.title = $("div", "font-size:66px;line-height:1.05;margin-top:12px;", L.head);
  L.title.className = "display";
  L.num = $("div", "position:absolute;right:180px;top:70px;font-size:150px;line-height:1;color:rgb(31 107 69 / 0.12);opacity:0;", stage);
  L.num.className = "display";

  // Fonctions secondaires, citees sans demonstration.
  L.chips = $("div", "position:absolute;inset:0;opacity:0;");
  L.chipEls = [
    ["Périodes inhabituelles", "#c2361a", 230, 300],
    ["Temps réel NASA FIRMS", "#e8641e", 1180, 250],
    ["Méthode et sources", "#0e7c86", 1290, 860],
    ["Rapports et exports", "#1f6b45", 260, 880],
  ].map(([text, color, x, y]) => {
    const c = $("div", `left:${x}px;top:${y}px;`, L.chips, `<i style="background:${color}"></i>${text}`);
    c.className = "chip";
    return c;
  });

  /* --- Scene 4 : affirmation, voix, actions --- */
  L.statement = $("div", "position:absolute;left:220px;top:300px;width:1480px;opacity:0;color:var(--ink);");
  L.stMark = $("div", "margin-bottom:40px;", L.statement, assistantMark(110));
  L.stText = $("div", "font-size:92px;line-height:1.08;", L.statement);
  L.stText.className = "display";
  L.stWords = "Hot-Spots ne se contente pas d'afficher des données.".split(" ").map((w) => $("span", "display:inline-block;margin-right:0.26em;opacity:0;", L.stText, w));
  L.wave = $("div", "position:absolute;left:420px;top:940px;width:1200px;height:104px;padding:0 28px;border-radius:999px;opacity:0;display:flex;align-items:center;gap:22px;background:rgb(255 255 255 / 0.94);box-shadow:0 18px 40px -16px rgb(23 37 28 / 0.35);");
  L.waveLabel = $("div", "font-size:24px;font-weight:600;color:var(--ink);width:250px;", L.wave);
  L.waveBars = $("div", "flex:1;height:100%;display:flex;align-items:center;gap:5px;", L.wave);
  L.bars = Array.from({ length: 80 }, () => $("i", "flex:1;border-radius:4px;height:6px;background:var(--primary);", L.waveBars));
  L.actChips = $("div", "position:absolute;inset:0;opacity:0;");
  L.actChipEls = [
    ["Zone : Haut-Ogooué", "#1f6b45", 1300, 360],
    ["Période : juin à sept. 2024", "#0e7c86", 1300, 450],
    ["Carte ouverte", "#e8641e", 1300, 540],
  ].map(([text, color, x, y]) => {
    const c = $("div", `left:${x}px;top:${y}px;`, L.actChips, `<i style="background:${color}"></i>${text}`);
    c.className = "chip";
    return c;
  });

  /* --- Scene 5 : territoires, Terre, signature --- */
  L.terr = $("div", "position:absolute;left:110px;bottom:120px;opacity:0;color:#fff;text-shadow:0 2px 18px rgb(0 0 0 / 0.6);");
  L.terrName = $("div", "font-size:72px;", L.terr);
  L.terrName.className = "display";
  L.terrCount = $("div", "font-size:30px;margin-top:10px;color:#eef3ec;", L.terr);
  L.quote = $("div", "position:absolute;left:150px;top:400px;width:900px;color:#f2f6f3;font-size:78px;line-height:1.12;opacity:0;text-shadow:0 4px 30px rgb(0 0 0 / 0.55);", stage, "Comprendre les feux,<br/>c'est déjà mieux protéger.");
  L.quote.className = "display";
  L.end = $("div", "position:absolute;left:150px;top:290px;color:#f2f6f3;opacity:0;");
  L.endMark = $("div", "display:flex;", L.end, brandMark(110));
  L.endWord = $("div", "font-size:132px;font-weight:700;letter-spacing:-0.04em;line-height:1;margin-top:28px;", L.end, `Hot<span style="color:#f9a03f">-</span>Spots`);
  L.endLine = $("div", "display:flex;gap:30px;margin-top:34px;font-size:54px;", L.end);
  L.endWords = ["Observer.", "Comprendre.", "Préserver."].map((w, i) => {
    const el = $("span", `opacity:0;color:${["#f2f6f3", "#9fd3f5", "#7fd29b"][i]}`, L.endLine, w);
    el.className = "display";
    return el;
  });
  L.credits = $("div", "position:absolute;left:0;right:0;bottom:46px;text-align:center;font-size:19px;line-height:1.7;color:#9fb0a6;opacity:0;", stage,
    "Données : NASA FIRMS (MODIS, VIIRS) · Imagerie : NASA GIBS Blue Marble, Sentinel-2 cloudless (EOX, Copernicus 2023) · Plan : OpenStreetMap<br/>Projet étudiant — NASA Space Apps Challenge 2026 · Une détection est un pixel chaud, pas un incendie confirmé.");

  // Grain leger et fondu au noir.
  L.grain = $("canvas", "position:absolute;inset:0;opacity:0.05;mix-blend-mode:overlay;");
  L.grain.width = W / 2;
  L.grain.height = H / 2;
  set(L.grain, { width: W + "px", height: H + "px" });
  L.black = $("div", "position:absolute;inset:0;background:#000;opacity:1;");
}

function brandMark(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32"><rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="#123d28"/><rect x="11" y="11" width="10" height="10" rx="2" fill="#f9a03f" fill-opacity="0.2" stroke="#f9a03f" stroke-opacity="0.6"/><ellipse cx="16" cy="16" rx="12.5" ry="5.2" transform="rotate(-28 16 16)" fill="none" stroke="#4fa36b" stroke-width="1.6"/><circle cx="16" cy="16" r="3.1" fill="#f9a03f"/><circle cx="26.2" cy="10.6" r="1.9" fill="#e9f3ec"/></svg>`;
}
function assistantMark(size) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 28 28"><circle cx="14" cy="14" r="13.5" fill="#123d28" stroke="#4fa36b" stroke-opacity="0.8"/><g id="orbit" style="transform-origin:14px 14px"><circle cx="14" cy="14" r="8.5" fill="none" stroke="#e9f3ec" stroke-opacity="0.45" stroke-dasharray="2.2 2.6"/><circle cx="21.4" cy="7.4" r="1.7" fill="#4fa36b"/></g><circle cx="14" cy="14" r="3.6" fill="#f9a03f"/></svg>`;
}

/* ------------------------------------------------------------------ graphique des series reelles */

const CH = { x: 160, y: 300, w: 1260, h: 560 };
function drawChart() {
  const ys = DATA.years;
  const max = Math.ceil(Math.max(...ys.map((y) => Math.max(y.modis, y.viirs ?? 0))) / 2000) * 2000;
  const X = (i) => CH.x + (i / (ys.length - 1)) * CH.w;
  const Y = (v) => CH.y + CH.h - (v / max) * CH.h;
  const path = (key) => ys.map((y, i) => (y[key] == null ? null : `${X(i).toFixed(1)},${Y(y[key]).toFixed(1)}`)).filter(Boolean).map((p, i) => `${i ? "L" : "M"}${p}`).join("");
  // Serie harmonisee ramenee a l'echelle de VIIRS : meme unite d'un bout a l'autre.
  const hmax = Math.max(...ys.map((y) => y.harmonized));
  const hY = (v) => CH.y + CH.h - (v / hmax) * CH.h * 0.72 - CH.h * 0.12;
  const hpath = ys.map((y, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${hY(y.harmonized).toFixed(1)}`).join("");
  const ticks = [2003, 2008, 2013, 2018, 2023].map((yr) => {
    const i = ys.findIndex((y) => y.year === yr);
    return `<text x="${X(i)}" y="${CH.y + CH.h + 44}" fill="#9fb0a6" font-size="22" font-family="Geist Mono" text-anchor="middle">${yr}</text>`;
  });
  L.chartSvg.innerHTML = `<svg width="${W}" height="${H}">
    <line x1="${CH.x}" x2="${CH.x + CH.w}" y1="${CH.y + CH.h}" y2="${CH.y + CH.h}" stroke="#2b3b33" stroke-width="2"/>
    ${ticks.join("")}
    <path id="pM" d="${path("modis")}" fill="none" stroke="#e4572e" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
    <path id="pV" d="${path("viirs")}" fill="none" stroke="#2f7fd8" stroke-width="6" stroke-linejoin="round" stroke-linecap="round"/>
    <path id="pH" d="${hpath}" fill="none" stroke="#7fd29b" stroke-width="7" stroke-linejoin="round" stroke-linecap="round" opacity="0"/>
    <text id="lM" x="${X(ys.length - 1) + 18}" y="${Y(ys[ys.length - 1].modis) + 8}" fill="#ff7a52" font-size="28" font-weight="600" font-family="Geist">MODIS</text>
    <text id="lV" x="${X(ys.length - 1) + 18}" y="${Y(ys[ys.length - 1].viirs) + 8}" fill="#6aa9ee" font-size="28" font-weight="600" font-family="Geist">VIIRS</text>
    <text id="lH" x="${X(ys.length - 1) + 18}" y="${hY(ys[ys.length - 1].harmonized) + 8}" fill="#7fd29b" font-size="28" font-weight="600" font-family="Geist" opacity="0">Indice harmonisé</text>
  </svg>`;
  L.chartTitle.innerHTML = `<div style="font-size:24px;color:#9fb0a6;letter-spacing:0.14em;text-transform:uppercase;font-weight:600">Gabon · détections retenues par an</div>`;
  for (const id of ["pM", "pV", "pH"]) {
    const p = L.chartSvg.querySelector("#" + id);
    const len = p.getTotalLength();
    p.style.strokeDasharray = `${len}`;
    p.style.strokeDashoffset = `${len}`;
    p.dataset.len = len;
  }
}

/* ------------------------------------------------------------------ fond etoile et grain */

const STARS = Array.from({ length: 420 }, (_, i) => {
  const r = (n) => {
    const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  return { x: r(1) * W, y: r(2) * H, s: 0.4 + r(3) * 1.5, a: 0.25 + r(4) * 0.7, d: 0.2 + r(5) * 1.2 };
});
function drawStars(t, alpha) {
  const c = L.stars.getContext("2d");
  c.clearRect(0, 0, W, H);
  if (alpha <= 0) return;
  for (const s of STARS) {
    const x = (s.x - t * 6 * s.d + W) % W;
    c.globalAlpha = alpha * s.a * (0.75 + 0.25 * Math.sin(t * 1.3 + s.x));
    c.fillStyle = "#e8f1ff";
    c.beginPath();
    c.arc(x, s.y, s.s, 0, Math.PI * 2);
    c.fill();
  }
}
function drawGrain(t) {
  const c = L.grain.getContext("2d");
  const img = c.createImageData(W / 2, H / 2);
  let seed = Math.floor(t * FPS) * 9973 + 17;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const v = seed & 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  c.putImageData(img, 0, 0);
}

/* ------------------------------------------------------------------ plans des scenes 3 et 4 */

/**
 * Plans « dans un cadre » : clip, fenetre de temps du film, debut et vitesse dans le clip,
 * titre, et zoom eventuel sur le panneau de l'assistant (a droite des captures).
 */
const SHOTS = [
  { a: 24.8, b: 29.5, clip: "globe", from: 0.4, speed: 1.4, n: "01", kicker: "Explorer", title: "La Terre, du continent au quartier" },
  { a: 29.5, b: 33.0, clip: "explore", from: 3.6, speed: 2.2, n: "02", kicker: "Observer", title: "Chaque détection garde son satellite et sa source", fast: "Accéléré ×2" },
  { a: 33.0, b: 37.55, clip: "calendar", from: 0, speed: 2.1, n: "03", kicker: "Calendrier", title: "Plus de 25 ans de saisons, mois par mois", fast: "Accéléré ×2" },
  { a: 37.55, b: 42.2, clip: "compare", from: 0.6, speed: 1.35, n: "04", kicker: "MODIS ↔ VIIRS", title: "Ce que l'harmonisation corrige… et ses limites" },
  { a: 42.2, b: 44.2, clip: "basemaps", from: 0.6, speed: 1.4, n: "05", kicker: "Grille harmonisée", title: "Cellules de 5 km, sur l'imagerie satellite" },
  { a: 44.2, b: 46.0, clip: "trends", from: 0.5, speed: 2.4, n: "06", kicker: "Tendances", title: "26 ans de tendances, testées" },
  // Scene 4
  { a: 49.7, b: 52.9, clip: "tour", from: 1.4, speed: 2.4, kicker: "Visite guidée", title: "Une visite guidée vous accompagne", fast: "Accéléré ×2" },
  { a: 52.9, b: 55.9, clip: "chat", from: 1.2, speed: 2.9, kicker: "Par écrit", title: "Posez vos questions", zoom: 1.85, origin: "100% 36%", fast: "Accéléré ×3" },
  { a: 55.9, b: 58.95, clip: "voice", from: 2.4, speed: 1.0, kicker: "À voix haute", title: "« L'année 2025 a-t-elle été habituelle ? »", zoom: 1.85, origin: "100% 96%", wave: "Utilisatrice" },
  { a: 58.95, b: 64.5, clip: "voice", from: 54.6, speed: 1.0, kicker: "Hot-Spots AI répond", title: "Les vrais chiffres, à voix haute", zoom: 1.85, origin: "100% 26%", wave: "Hot-Spots AI", fast: "Attente raccourcie au montage" },
  { a: 64.5, b: 68.2, clip: "action", from: 7.6, speed: 2.3, kicker: "Et il agit", title: "…et règle l'écran pour vous", fast: "Accéléré ×2", actions: true },
];

function shotAt(t) {
  return SHOTS.find((s) => t >= s.a && t < s.b) ?? null;
}

/* ------------------------------------------------------------------ rendu */

async function renderFrame(t) {
  const waits = [];
  const add = (p) => p && waits.push(p);

  /* Fonds */
  const lightOn = t >= 24.4 && t < 68.6;
  const light = lightOn ? Math.min(prog(t, 24.4, 25.2), 1 - prog(t, 67.9, 68.6)) : 0;
  set(L.light, { opacity: light });
  set(L.topo, { opacity: light });
  const spaceStars = t < 13.2 ? 1 : t > 76 ? prog(t, 76, 78) : 0;
  drawStars(t, spaceStars);

  /* ---------- Scene 1 ---------- */
  // 1a : donnees brutes qui defilent, chiffres reels.
  const rainA = vis(t, 0, 5.2, 1.0, 0.6);
  set(L.rain, { opacity: rainA });
  set(L.rainA, { transform: `translateY(${-t * 46}px)` });
  set(L.rainB, { transform: `translateY(${-120 - t * 38}px)` });
  set(L.s1a, { opacity: vis(t, 0.5, 5.0, 0.9, 0.5), transform: `translateY(${lerp(30, 0, easeOut(prog(t, 0.5, 1.6)))}px)` });
  set(L.s1aCount, { opacity: prog(t, 2.2, 2.9) });
  set(L.s1aNote, { opacity: prog(t, 2.6, 3.3) * 0.9 });
  // 1b : deux tailles de pixels.
  const pixA = vis(t, 5.0, 8.15, 0.6, 0.5);
  set(L.pix, { opacity: pixA });
  set(L.pixA.p, { transform: `translateX(${lerp(-60, 0, easeOut(prog(t, 5.0, 5.9)))}px) scale(${lerp(1.06, 1, prog(t, 5, 8.1))})` });
  set(L.pixB.p, { transform: `translateX(${lerp(60, 0, easeOut(prog(t, 5.0, 5.9)))}px) scale(${lerp(1.06, 1, prog(t, 5, 8.1))})` });
  set(L.pixA.svg, { opacity: prog(t, 5.5, 6.2) });
  set(L.pixB.svg, { opacity: prog(t, 5.9, 6.6) });
  set(L.pixA.hot, { opacity: 0.55 * prog(t, 6.4, 6.8) });
  set(L.pixB.hot, { opacity: 0.55 * prog(t, 6.6, 7.0) });
  // 1c : deux series qui divergent (puis, scene 2, qui se rejoignent).
  const chartOn = vis(t, 7.9, 17.6, 0.5, 0.8);
  set(L.chart, { opacity: chartOn, transform: `scale(${t > 12.2 ? lerp(1, 0.42, easeInOut(prog(t, 12.2, 13.4))) : 1})`, transformOrigin: "4% 4%" });
  const pM = L.chartSvg.querySelector("#pM");
  const pV = L.chartSvg.querySelector("#pV");
  const pH = L.chartSvg.querySelector("#pH");
  pM.style.strokeDashoffset = pM.dataset.len * (1 - easeOut(prog(t, 8.1, 10.0)));
  pV.style.strokeDashoffset = pV.dataset.len * (1 - easeOut(prog(t, 8.7, 10.6)));
  const merge = easeInOut(prog(t, 15.2, 16.8));
  pM.style.opacity = pV.style.opacity = 1 - merge * 0.85;
  pH.style.opacity = merge;
  pH.style.strokeDashoffset = pH.dataset.len * (1 - easeOut(prog(t, 15.2, 17.0)));
  L.chartSvg.querySelector("#lH").style.opacity = prog(t, 16.4, 17.0);
  set(L.chartTitle, { opacity: 1 - prog(t, 12.0, 12.6) });
  set(L.ratio, { opacity: vis(t, 10.0, 12.4, 0.5, 0.4), transform: `scale(${lerp(0.9, 1, easeExpo(prog(t, 10.0, 10.8)))})` });

  /* ---------- Scene 2 : plongee vers la Terre ---------- */
  const heroOn = t >= 12.1 && t < 25.2;
  if (heroOn) add(L.full.frame(2.0 + (t - 12.1) * 0.6));
  set(L.full.box, { opacity: heroOn ? Math.min(prog(t, 12.1, 13.0), 1 - prog(t, 24.6, 25.2)) : 0 });
  // La Terre a droite du logo, puis plongee vers le Gabon a la fin de la scene.
  const push = easeInOut(prog(t, 22.6, 25.0));
  set(L.full.img, {
    transform: `translateX(${lerp(330, 0, push)}px) scale(${lerp(1.18, 1.08, prog(t, 12.1, 18)) + push * 2.2})`,
    transformOrigin: "38% 52%",
  });
  set(L.flash, { opacity: Math.max(vis(t, 11.95, 12.75, 0.25, 0.55) * 0.85, vis(t, 24.5, 25.3, 0.4, 0.4) * 0.9) });
  set(L.vignette, { opacity: heroOn ? 1 : 0 });
  set(L.logo, { opacity: vis(t, 13.0, 18.0, 0.8, 0.6), transform: `translateY(${lerp(40, 0, easeOut(prog(t, 13.0, 14.2)))}px)` });
  set(L.logoMark, { transform: `rotate(${lerp(-25, 0, easeOut(prog(t, 13.0, 14.4)))}deg) scale(${lerp(0.6, 1, easeExpo(prog(t, 13.0, 14.0)))})` });
  // Les trois verbes arrivent avec les mots de la voix off.
  const words = ["observer", "harmoniser", "comprendre"].map((w) => wordAt("Une mission", w));
  L.missionWords.forEach((el, i) => set(el, { opacity: t < 24.4 ? prog(t, words[i] - 0.15, words[i] + 0.35) * (1 - prog(t, 23.6, 24.3)) : 0, transform: `translateY(${lerp(24, 0, easeOut(prog(t, words[i] - 0.15, words[i] + 0.5)))}px)` }));

  /* ---------- Scenes 3 et 4 : plans dans un cadre ---------- */
  const shot = shotAt(t);
  const framed = shot && !(t >= 46 && t < 49.7);
  if (framed) {
    const local = shot.from + (t - shot.a) * shot.speed;
    if (L.inner.name !== shot.clip) L.inner.name = L.ambient.name = shot.clip;
    add(L.inner.frame(local));
    add(L.ambient.frame(local));
    const k = prog(t, shot.a, shot.b);
    // Entree de chaque plan : leger glissement et rotation 3D ; derive lente pendant le plan (parallaxe).
    const enter = easeOut(prog(t, shot.a, shot.a + 0.55));
    set(L.frame, { transform: `translateY(${lerp(36, 0, enter)}px) rotateX(${lerp(5, 2, k)}deg) rotateY(${lerp(-7, 5, k)}deg) scale(${lerp(0.97, 1, enter)})` });
    const z = shot.zoom ?? 1;
    set(L.inner.img, { transform: `scale(${z * lerp(1, 1.04, k)})`, transformOrigin: z > 1 ? (shot.origin ?? "100% 46%") : "50% 50%" });
    set(L.frameWrap, { opacity: Math.min(prog(t, 24.8, 25.4), t > 67.5 ? 1 - prog(t, 67.6, 68.2) : 1) });
    set(L.ambient.box, { opacity: 0.35 * L.frameWrap.style.opacity });
    L.kicker.textContent = shot.kicker;
    L.title.textContent = shot.title;
    set(L.head, { opacity: Math.min(prog(t, shot.a, shot.a + 0.35), 1 - prog(t, shot.b - 0.2, shot.b)) * Number(L.frameWrap.style.opacity), transform: `translateX(${lerp(-20, 0, enter)}px)` });
    L.num.textContent = shot.n ?? "";
    set(L.num, { opacity: shot.n ? Math.min(prog(t, shot.a, shot.a + 0.4), 1 - prog(t, shot.b - 0.2, shot.b)) : 0 });
    L.fast.textContent = shot.fast ?? "";
    set(L.fast, { opacity: shot.fast ? 1 : 0 });
  } else {
    set(L.frameWrap, { opacity: 0 });
    set(L.ambient.box, { opacity: 0 });
    set(L.head, { opacity: 0 });
    set(L.num, { opacity: 0 });
  }
  set(L.chips, { opacity: vis(t, 42.4, 46.0, 0.4, 0.4) });
  L.chipEls.forEach((c, i) => set(c, { transform: `translateY(${lerp(30, 0, easeOut(prog(t, 42.4 + i * 0.25, 43.0 + i * 0.25)))}px)`, opacity: prog(t, 42.4 + i * 0.25, 42.9 + i * 0.25) }));

  /* Scene 4 : affirmation */
  set(L.statement, { opacity: vis(t, 46.0, 49.75, 0.3, 0.45) });
  const stLine = lineAt("ne se contente pas");
  L.stWords.forEach((w, i) => {
    const at = stLine ? stLine.at + (stLine.words[i]?.start ?? i * 0.3) : 46.4 + i * 0.3;
    set(w, { opacity: prog(t, at - 0.1, at + 0.25), transform: `translateY(${lerp(20, 0, easeOut(prog(t, at - 0.1, at + 0.4)))}px)` });
  });
  const orbit = L.stMark.querySelector("#orbit");
  if (orbit) orbit.style.transform = `rotate(${t * 120}deg)`;

  /* Ondes des voix (niveaux reels des repliques) */
  if (shot?.wave && ENV[shot.wave]) {
    const e = ENV[shot.wave];
    const i0 = Math.floor((t - e.at) * FPS);
    L.waveLabel.textContent = shot.wave;
    L.bars.forEach((b, j) => {
      const v = e.values[i0 - (L.bars.length - 1 - j)] ?? 0;
      set(b, { height: `${6 + v * 90}px`, background: shot.wave === "Utilisatrice" ? "#0e7c86" : "#1f6b45", opacity: 0.35 + v * 0.65 });
    });
    set(L.wave, { opacity: vis(t, shot.a, shot.b, 0.25, 0.25) });
  } else set(L.wave, { opacity: 0 });
  set(L.actChips, { opacity: vis(t, 65.4, 68.1, 0.3, 0.4) });
  L.actChipEls.forEach((c, i) => set(c, { opacity: prog(t, 65.5 + i * 0.45, 65.9 + i * 0.45), transform: `translateX(${lerp(40, 0, easeOut(prog(t, 65.5 + i * 0.45, 66.1 + i * 0.45)))}px)` }));

  /* ---------- Scene 5 : Gabon, France, la Terre ---------- */
  // Gabon (fin du vol du globe), puis France : plein cadre.
  let full2 = 0;
  if (t >= 68.2 && t < 73.7) {
    const gabon = t < 71.0;
    L.full2.name = gabon ? "basemaps" : "france";
    add(L.full2.frame(gabon ? (t - 68.2) * 0.38 : 1.0 + (t - 71.0) * 2.4));
    full2 = Math.min(prog(t, 68.2, 68.8), 1 - prog(t, 73.2, 73.7));
    set(L.full2.img, { transform: `scale(${gabon ? lerp(1.45, 1.55, prog(t, 68.2, 71)) : lerp(1.45, 1.53, prog(t, 71, 73.7))})`, transformOrigin: "100% 50%" });
    L.terrName.textContent = gabon ? "Gabon" : "France métropolitaine";
    L.terrCount.textContent = `${nb(gabon ? DATA.archive.gab.rows.read : DATA.archive.fra.rows.read)} détections NASA FIRMS depuis 2000`;
    set(L.terr, { opacity: gabon ? vis(t, 68.5, 71.0, 0.4, 0.25) : vis(t, 71.0, 73.5, 0.25, 0.4) });
  } else set(L.terr, { opacity: 0 });
  set(L.full2.box, { opacity: full2 });
  // Retour a la Terre : le globe photorealiste, puis la signature.
  const earthOn = t >= 73.2;
  if (earthOn) {
    add(L.full.frame(2.0 + (t - 73.2) * 0.45));
    set(L.full.box, { opacity: Math.min(prog(t, 73.2, 74.2), 1 - prog(t, 85.8, 86.5)) });
    set(L.full.img, { transform: `translateX(${lerp(0, 420, easeInOut(prog(t, 73.2, 77.6)))}px) scale(${lerp(2.6, 1.15, easeInOut(prog(t, 73.2, 77.6)))})`, transformOrigin: "38% 52%" });
    set(L.vignette, { opacity: 1 });
  }
  set(L.quote, { opacity: vis(t, 73.85, 77.3, 0.6, 0.5), transform: `translateY(${lerp(26, 0, easeOut(prog(t, 73.85, 75)))}px)` });
  const end = ["Observer", "Comprendre", "Préserver"].map((w) => wordAt("Observer. Comprendre", w));
  set(L.end, { opacity: Math.min(prog(t, 77.4, 78.2), 1 - prog(t, 85.9, 86.5)) });
  set(L.endMark, { transform: `scale(${lerp(0.7, 1, easeExpo(prog(t, 77.4, 78.4)))}) rotate(${lerp(-20, 0, easeOut(prog(t, 77.4, 78.6)))}deg)` });
  L.endWords.forEach((el, i) => set(el, { opacity: prog(t, end[i] - 0.1, end[i] + 0.3) }));
  set(L.credits, { opacity: Math.min(prog(t, 83.4, 84.2), 1 - prog(t, 86.0, 86.5)) });

  /* Grain et fondus d'ouverture / de fin */
  drawGrain(t);
  set(L.black, { opacity: Math.max(1 - prog(t, 0, 0.8), prog(t, 86.0, 86.5)) });

  await Promise.all(waits);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

window.renderFrame = renderFrame;
window.FILM = { W, H, FPS, DURATION };
window.filmReady = (async () => {
  [DATA, TIMING, COUNTS, ENV] = await Promise.all(["data.json", "timing.json", "clips/counts.json", "envelopes.json"].map((u) => fetch(u).then((r) => r.json())));
  await document.fonts.ready;
  build();
  await renderFrame(0);
  return true;
})();
