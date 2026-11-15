/**
 * Satellites d'observation autour du globe : illustration des orbites et de la collecte des donnees.
 *
 * Ce qui est modelise (caracteristiques publiees des missions) :
 * - orbites polaires heliosynchrones : MODIS sur Terra et Aqua (705 km, environ 98,9 min, inclinaison 98,2°),
 *   VIIRS sur Suomi-NPP, NOAA-20 et NOAA-21 (824 km, environ 101,4 min, inclinaison 98,7°) ;
 * - fauchee au sol : 2 330 km pour MODIS, 3 060 km pour VIIRS ;
 * - balayage transversal : les deux instruments balaient perpendiculairement a la trace (miroir rotatif) ;
 * - rotation de la Terre sous l'orbite : chaque passage est decale vers l'ouest d'environ 25° ;
 * - descente des donnees vers la station de Svalbard (SvalSat), qui recoit ces satellites polaires.
 *
 * Ce qui ne l'est pas : la position reelle du moment (il faudrait les elements orbitaux du jour) et le temps,
 * accelere pour que le mouvement se voie. L'ecran l'indique.
 *
 * Rendu : un canevas 2D au-dessus de la carte, projection orthographique calee sur le globe MapLibre
 * (centre et rayon mesures a chaque image). Aucune interaction : le canevas laisse passer la souris.
 */

import { CANVAS_HEX, CANVAS_RGB, SATELLITE_HEX, hexToRgb } from "@/lib/palette";
import type { Map as MapLibre } from "maplibre-gl";

const DEG = Math.PI / 180;
const EARTH_KM = 6371;
/** Facteur d'acceleration du temps : une orbite MODIS dure environ 70 s a l'ecran. */
export const TIME_FACTOR = 85;
/** Rotation de la Terre (jour sideral), en radians par seconde reelle. */
const EARTH_RATE = (2 * Math.PI) / 86164;

interface Spacecraft {
  key: string;
  name: string;
  platforms: string;
  color: string;
  rgb: string;
  altitudeKm: number;
  periodMin: number;
  inclination: number;
  swathKm: number;
  /** Longitude du noeud ascendant au depart, et position sur l'orbite (radians). */
  raan0: number;
  phase0: number;
}

export const SPACECRAFT: Spacecraft[] = [
  {
    key: "modis",
    name: "MODIS",
    platforms: "Terra · Aqua",
    color: SATELLITE_HEX.modis,
    rgb: hexToRgb(SATELLITE_HEX.modis),
    altitudeKm: 705,
    periodMin: 98.9,
    inclination: 98.2 * DEG,
    swathKm: 2330,
    raan0: 8 * DEG,
    phase0: 0.05,
  },
  {
    key: "viirs",
    name: "VIIRS",
    platforms: "S-NPP · NOAA-20 · NOAA-21",
    color: SATELLITE_HEX.snpp,
    rgb: hexToRgb(SATELLITE_HEX.snpp),
    altitudeKm: 824,
    periodMin: 101.4,
    inclination: 98.7 * DEG,
    swathKm: 3060,
    raan0: 38 * DEG,
    phase0: -0.55,
  },
];

const SVALBARD = { lat: 78.23 * DEG, lon: 15.39 * DEG };

type Vec = [number, number, number];

/** Position unitaire (repere terrestre) et vecteurs de trace et de travers pour un argument de latitude u. */
function orbitState(raan: number, inc: number, u: number): { p: Vec; along: Vec; normal: Vec } {
  const cO = Math.cos(raan), sO = Math.sin(raan), ci = Math.cos(inc), si = Math.sin(inc), cu = Math.cos(u), su = Math.sin(u);
  const p: Vec = [cO * cu - sO * su * ci, sO * cu + cO * su * ci, su * si];
  const along: Vec = [-cO * su - sO * cu * ci, -sO * su + cO * cu * ci, cu * si];
  const normal: Vec = [sO * si, -cO * si, ci];
  return { p, along, normal };
}

function rotateToward(p: Vec, n: Vec, angle: number): Vec {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [p[0] * c + n[0] * s, p[1] * c + n[1] * s, p[2] * c + n[2] * s];
}

function toLonLat(v: Vec): { lon: number; lat: number } {
  return { lon: Math.atan2(v[1], v[0]), lat: Math.asin(Math.max(-1, Math.min(1, v[2]))) };
}

/**
 * Camera du globe : centre a l'ecran, echelle au centre (pixels par radian), distance de la camera au centre
 * de la Terre (en rayons terrestres). MapLibre dessine le globe en perspective : la projection suit la meme geometrie.
 */
interface View {
  cx: number;
  cy: number;
  scale: number;
  distance: number;
  lon0: number;
  sinLat0: number;
  cosLat0: number;
}

/** Coordonnees dans le repere de la camera : x vers l'est, y vers le nord, z vers l'observateur. */
function viewCoords(view: View, v: Vec, r: number): Vec {
  const { lon, lat } = toLonLat(v);
  const cl = Math.cos(lat);
  const dl = lon - view.lon0;
  return [
    r * cl * Math.sin(dl),
    r * (view.cosLat0 * Math.sin(lat) - view.sinLat0 * cl * Math.cos(dl)),
    r * (view.sinLat0 * Math.sin(lat) + view.cosLat0 * cl * Math.cos(dl)),
  ];
}

/**
 * Projection en perspective d'un point (vecteur unitaire, rayon relatif r).
 * visible : rien ne le masque (rayon camera-point sans intersection avec la Terre avant lui) ;
 * front : au sol, du cote visible de l'horizon.
 */
function project(view: View, v: Vec, r = 1): { x: number; y: number; visible: boolean; front: boolean } {
  const [x, y, z] = viewCoords(view, v, r);
  const D = view.distance;
  const k = (view.scale * (D - 1)) / (D - z);
  // Rayon depuis la camera (0, 0, D) vers le point : premiere intersection avec la sphere unite.
  const dx = x, dy = y, dz = z - D;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * D * dz;
  const c = D * D - 1;
  const disc = b * b - 4 * a * c;
  const t1 = disc < 0 ? Infinity : (-b - Math.sqrt(disc)) / (2 * a);
  const visible = disc < 0 || t1 >= 1 - 1e-4 || t1 <= 0;
  return { x: view.cx + k * x, y: view.cy - k * y, visible, front: r <= 1.0001 ? z >= 1 / D - 1e-4 : visible };
}

/** Camera mesuree sur la carte elle-meme : echelle au centre, puis distance a partir d'un point eloigne. */
function measure(map: MapLibre): View {
  const c = map.getCenter();
  const lat = Math.max(-80, Math.min(80, c.lat));
  const center = map.project([c.lng, lat]);
  const step = 0.5;
  const north = map.project([c.lng, lat + step]);
  const scale = Math.hypot(north.x - center.x, north.y - center.y) / (step * DEG);
  // Point a 40° du centre (au nord ou au sud) : en perspective, d = s0 (D - 1) sin a / (D - cos a).
  const a = 40 * DEG;
  const far = map.project([c.lng, lat + (lat <= 40 ? 40 : -40)]);
  const ratio = Math.hypot(far.x - center.x, far.y - center.y) / scale;
  const s = Math.sin(a), co = Math.cos(a);
  // ratio (D - cos a) = sin a (D - 1)  =>  D = (ratio cos a - sin a) / (ratio - sin a)
  let distance = (ratio * co - s) / (ratio - s);
  if (!Number.isFinite(distance) || distance < 1.05 || distance > 200) distance = 200;
  return { cx: center.x, cy: center.y, scale, distance, lon0: c.lng * DEG, sinLat0: Math.sin(lat * DEG), cosLat0: Math.cos(lat * DEG) };
}

/** Opacite selon le zoom : pleine en vue Terre, nulle des que la carte montre les detections une a une. */
function zoomOpacity(zoom: number): number {
  if (zoom <= 2.8) return 1;
  if (zoom >= 4) return 0;
  return 1 - (zoom - 2.8) / 1.2;
}

export interface SatelliteLayer {
  setVisible: (on: boolean) => void;
  remove: () => void;
}

/** Ajoute le canevas des satellites a une carte en projection globe. */
export function attachSatellites(map: MapLibre): SatelliteLayer {
  const host = map.getCanvasContainer();
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText = "position:absolute;inset:0;pointer-events:none;width:100%;height:100%;";
  host.insertBefore(canvas, map.getCanvas().nextSibling);
  const ctx = canvas.getContext("2d")!;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const font = getComputedStyle(document.body).fontFamily || "sans-serif";
  let visible = true;
  let frame = 0;
  const start = performance.now();
  // Temps fige si l'utilisateur limite les animations : satellites et orbites restent, sans mouvement.
  const frozenAt = 22;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { clientWidth: w, clientHeight: h } = map.getContainer();
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(map.getContainer());

  const draw = () => {
    frame = 0;
    const w = canvas.width, h = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.restore();
    const alpha = visible ? zoomOpacity(map.getZoom()) : 0;
    if (alpha <= 0.01) return;
    const view = measure(map);
    const seconds = reduce ? frozenAt : (performance.now() - start) / 1000;
    const simSeconds = seconds * TIME_FACTOR;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const sc of SPACECRAFT) drawSpacecraft(ctx, view, sc, simSeconds, seconds, font);
    ctx.restore();
    if (!reduce) schedule();
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(draw);
  };
  // Carte qui bouge : on redessine ; au repos et zoomee, la boucle s'arrete d'elle-meme (opacite nulle).
  const onMove = () => schedule();
  map.on("move", onMove);
  map.on("resize", onMove);
  map.once("idle", onMove);
  const onVisibility = () => (document.hidden ? cancelAnimationFrame(frame) : schedule());
  document.addEventListener("visibilitychange", onVisibility);
  schedule();

  return {
    setVisible(on) {
      visible = on;
      schedule();
    },
    remove() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      map.off("move", onMove);
      map.off("resize", onMove);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.remove();
    },
  };
}

function drawSpacecraft(ctx: CanvasRenderingContext2D, view: View, sc: Spacecraft, simSeconds: number, seconds: number, font: string) {
  const r = 1 + sc.altitudeKm / EARTH_KM;
  const omega = (2 * Math.PI) / (sc.periodMin * 60);
  const raan = sc.raan0 - EARTH_RATE * simSeconds;
  const u = sc.phase0 + omega * simSeconds;
  const half = sc.swathKm / 2 / EARTH_KM;

  // Orbite : trait fin devant le globe, tres discret derriere (au-dela du limbe seulement).
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  let prev: ReturnType<typeof project> | null = null;
  for (let i = 0; i <= 180; i++) {
    const q = project(view, orbitState(raan, sc.inclination, (i / 180) * 2 * Math.PI).p, r);
    if (prev && prev.visible && q.visible) {
      ctx.strokeStyle = `rgb(${sc.rgb} / ${prev.front && q.front ? 0.38 : 0.14})`;
      ctx.beginPath();
      ctx.moveTo(prev.x, prev.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    prev = q;
  }

  // Fauchee deja acquise : bande au sol le long de la trace recente, qui s'efface.
  const trailSteps = 40;
  for (let i = trailSteps; i > 0; i--) {
    const ua = u - (i / trailSteps) * 0.85;
    const ub = u - ((i - 1) / trailSteps) * 0.85;
    const a = orbitState(raan, sc.inclination, ua);
    const b = orbitState(raan, sc.inclination, ub);
    const pts = [rotateToward(a.p, a.normal, -half), rotateToward(a.p, a.normal, half), rotateToward(b.p, b.normal, half), rotateToward(b.p, b.normal, -half)].map((v) => project(view, v));
    if (!pts.every((q) => q.front)) continue;
    ctx.fillStyle = `rgb(${sc.rgb} / ${0.11 * (1 - i / trailSteps)})`;
    ctx.beginPath();
    pts.forEach((q, k) => (k ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
    ctx.closePath();
    ctx.fill();
  }

  const now = orbitState(raan, sc.inclination, u);
  const sat = project(view, now.p, r);
  if (!sat.visible) return;
  const nadir = project(view, now.p);
  const edgeA = project(view, rotateToward(now.p, now.normal, -half));
  const edgeB = project(view, rotateToward(now.p, now.normal, half));

  // Faisceau vers la fauchee au sol (seulement si le sol est face a nous).
  if (sat.front && edgeA.front && edgeB.front) {
    const gradient = ctx.createLinearGradient(sat.x, sat.y, nadir.x, nadir.y);
    gradient.addColorStop(0, `rgb(${sc.rgb} / 0.34)`);
    gradient.addColorStop(1, `rgb(${sc.rgb} / 0.04)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(sat.x, sat.y);
    ctx.lineTo(edgeA.x, edgeA.y);
    ctx.lineTo(edgeB.x, edgeB.y);
    ctx.closePath();
    ctx.fill();
    // Ligne de fauchee au sol.
    ctx.strokeStyle = `rgb(${sc.rgb} / 0.55)`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(edgeA.x, edgeA.y);
    ctx.lineTo(edgeB.x, edgeB.y);
    ctx.stroke();

    // Balayage transversal : un rayon parcourt la fauchee d'un bord a l'autre (miroir rotatif).
    const sweep = ((seconds * 1.6) % 2) - 1;
    const target = project(view, rotateToward(now.p, now.normal, half * sweep));
    const scan = ctx.createLinearGradient(sat.x, sat.y, target.x, target.y);
    scan.addColorStop(0, `rgb(${sc.rgb} / 0.9)`);
    scan.addColorStop(1, `rgb(${sc.rgb} / 0.15)`);
    ctx.strokeStyle = scan;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(sat.x, sat.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
    ctx.fillStyle = `rgb(${sc.rgb} / 0.9)`;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Donnees qui remontent du sol vers l'instrument : trois impulsions decalees.
    for (let k = 0; k < 3; k++) {
      const t = ((seconds * 0.9 + k / 3) % 1 + 1) % 1;
      const x = nadir.x + (sat.x - nadir.x) * t;
      const y = nadir.y + (sat.y - nadir.y) * t;
      ctx.fillStyle = `rgb(${CANVAS_RGB.label} / ${0.75 * Math.sin(Math.PI * t)})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Descente des donnees vers Svalbard quand le satellite passe dans le grand nord.
  const { lat } = toLonLat(now.p);
  if (lat > 55 * DEG) {
    const station: Vec = [Math.cos(SVALBARD.lat) * Math.cos(SVALBARD.lon), Math.cos(SVALBARD.lat) * Math.sin(SVALBARD.lon), Math.sin(SVALBARD.lat)];
    const st = project(view, station);
    if (st.front) {
      ctx.strokeStyle = `rgb(${sc.rgb} / 0.55)`;
      ctx.setLineDash([3, 4]);
      ctx.lineDashOffset = -seconds * 18;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sat.x, sat.y);
      ctx.lineTo(st.x, st.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = `rgb(${CANVAS_RGB.label} / 0.9)`;
      ctx.fillRect(st.x - 2.5, st.y - 2.5, 5, 5);
      ctx.font = `500 10px ${font}`;
      ctx.fillStyle = `rgb(${CANVAS_RGB.labelMuted} / 0.85)`;
      ctx.fillText("SvalSat", st.x + 6, st.y + 12);
    }
  }

  // Le satellite : halo, corps oriente selon la trace, panneaux solaires.
  const ahead = project(view, orbitState(raan, sc.inclination, u + 0.02).p, r);
  const angle = Math.atan2(ahead.y - sat.y, ahead.x - sat.x);
  const pulse = 0.75 + 0.25 * Math.sin(seconds * 2.4);
  const glow = ctx.createRadialGradient(sat.x, sat.y, 0, sat.x, sat.y, 16);
  glow.addColorStop(0, `rgb(${sc.rgb} / ${0.55 * pulse})`);
  glow.addColorStop(1, `rgb(${sc.rgb} / 0)`);
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sat.x, sat.y, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(sat.x, sat.y);
  ctx.rotate(angle);
  ctx.globalAlpha *= sat.front ? 1 : 0.55;
  ctx.fillStyle = CANVAS_HEX.body;
  ctx.strokeStyle = sc.color;
  ctx.lineWidth = 1;
  // Panneaux solaires, perpendiculaires a la trace.
  ctx.fillRect(-1.6, -11, 3.2, 7);
  ctx.strokeRect(-1.6, -11, 3.2, 7);
  ctx.fillRect(-1.6, 4, 3.2, 7);
  ctx.strokeRect(-1.6, 4, 3.2, 7);
  // Corps.
  ctx.fillStyle = CANVAS_HEX.panel;
  ctx.fillRect(-3.5, -2.5, 7, 5);
  ctx.fillStyle = sc.color;
  ctx.fillRect(1.5, -1.2, 2, 2.4);
  ctx.restore();

  // Etiquette, du cote oppose au centre du globe : elle reste dans l'espace, hors des continents.
  const outward = sat.x >= view.cx ? 1 : -1;
  ctx.textAlign = outward > 0 ? "left" : "right";
  ctx.font = `600 11.5px ${font}`;
  ctx.fillStyle = sc.color;
  ctx.fillText(sc.name, sat.x + 15 * outward, sat.y - 4);
  ctx.font = `400 10px ${font}`;
  ctx.fillStyle = `rgb(${CANVAS_RGB.labelMuted} / 0.9)`;
  ctx.fillText(sc.platforms, sat.x + 15 * outward, sat.y + 9);
  ctx.textAlign = "left";
}
