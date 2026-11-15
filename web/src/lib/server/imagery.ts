/**
 * Imagerie du jour (NASA GIBS, couleurs vraies) : quelle couche et quelle date afficher pour un jour donne.
 *
 * GIBS publie les dates disponibles de chaque couche dans son WMTSCapabilities (intervalles « debut/fin/P1D »,
 * avec des trous). On choisit, dans l'ordre : VIIRS Suomi-NPP, VIIRS NOAA-20, VIIRS NOAA-21, puis MODIS Terra
 * (seule imagerie avant fin 2015). Si le jour demande n'est pas encore publie, on prend le dernier jour publie
 * avant lui, et l'interface affiche la date reelle de l'image.
 * Les capacites sont gardees 6 heures en memoire ; sans reseau, on repond avec une estimation prudente.
 */

export const IMAGERY_LAYERS = [
  { id: "VIIRS_SNPP_CorrectedReflectance_TrueColor", sensor: "VIIRS Suomi-NPP" },
  { id: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-20" },
  { id: "VIIRS_NOAA21_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-21" },
  { id: "MODIS_Terra_CorrectedReflectance_TrueColor", sensor: "MODIS Terra" },
] as const;

export type ImageryLayerId = (typeof IMAGERY_LAYERS)[number]["id"];

export interface ImageryChoice {
  layer: ImageryLayerId;
  sensor: string;
  /** Date reelle de l'image (AAAA-MM-JJ). */
  date: string;
  /** Vrai si la date de l'image differe du jour demande (jour pas encore publie, ou trou de la serie). */
  shifted: boolean;
  /** Vrai si la reponse vient des capacites GIBS ; faux si estimation hors ligne. */
  verified: boolean;
}

type Ranges = Map<ImageryLayerId, [string, string][]>;

const CAPABILITIES = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml";
const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; ranges: Ranges } | null = null;
let pending: Promise<Ranges> | null = null;

/** Lit les intervalles de dates de chaque couche dans le document de capacites. */
export function parseRanges(xml: string): Ranges {
  const ranges: Ranges = new Map();
  for (const { id } of IMAGERY_LAYERS) {
    const at = xml.indexOf(`<ows:Identifier>${id}</ows:Identifier>`);
    if (at < 0) continue;
    const end = xml.indexOf("</Layer>", at);
    const block = xml.slice(at, end < 0 ? undefined : end);
    const list: [string, string][] = [];
    for (const m of block.matchAll(/<Value>(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\/P1D<\/Value>/g)) list.push([m[1], m[2]]);
    if (list.length) ranges.set(id, list);
  }
  return ranges;
}

/** Choix de la couche et de la date : premiere couche couvrant le jour ; sinon, image la plus recente avant lui. */
export function chooseImagery(day: string, ranges: Ranges): ImageryChoice | null {
  for (const { id, sensor } of IMAGERY_LAYERS) {
    if ((ranges.get(id) ?? []).some(([a, b]) => a <= day && day <= b)) return { layer: id, sensor, date: day, shifted: false, verified: true };
  }
  let best: ImageryChoice | null = null;
  for (const { id, sensor } of IMAGERY_LAYERS) {
    for (const [a, b] of ranges.get(id) ?? []) {
      if (a > day) continue;
      const date = b < day ? b : day;
      if (!best || date > best.date) best = { layer: id, sensor, date, shifted: true, verified: true };
    }
  }
  return best;
}

/** Estimation sans les capacites : VIIRS NOAA-20 depuis 2018, MODIS Terra avant. */
export function offlineGuess(day: string): ImageryChoice {
  return day >= "2018-01-05"
    ? { layer: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", sensor: "VIIRS NOAA-20", date: day, shifted: false, verified: false }
    : { layer: "MODIS_Terra_CorrectedReflectance_TrueColor", sensor: "MODIS Terra", date: day, shifted: false, verified: false };
}

async function loadRanges(now: number): Promise<Ranges> {
  if (cache && now - cache.at < TTL_MS) return cache.ranges;
  pending ??= fetch(CAPABILITIES, { signal: AbortSignal.timeout(20_000) })
    .then((r) => {
      if (!r.ok) throw new Error(`GIBS ${r.status}`);
      return r.text();
    })
    .then((xml) => {
      const ranges = parseRanges(xml);
      if (!ranges.size) throw new Error("capacites GIBS illisibles");
      cache = { at: Date.now(), ranges };
      return ranges;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export async function imageryFor(day: string, now = Date.now()): Promise<ImageryChoice> {
  try {
    return chooseImagery(day, await loadRanges(now)) ?? offlineGuess(day);
  } catch (error) {
    console.warn("[imagerie] capacites GIBS indisponibles :", error instanceof Error ? error.message : error);
    return offlineGuess(day);
  }
}
