/**
 * Observatoire en temps quasi reel : dernieres detections NASA FIRMS (MODIS et VIIRS) pour le Gabon et la France.
 *
 * Sources officielles, sans donnee inventee :
 * - sans cle : fichiers « active fire » publies par FIRMS par region et par capteur (7 derniers jours) ;
 * - avec FIRMS_MAP_KEY (gratuite, a demander a la NASA) : API « area » de FIRMS, jusqu'a 10 jours, limitee a l'emprise.
 *
 * Actualisation maitrisee : chaque flux (capteur x territoire) est verifie au plus toutes les 10 minutes,
 * par une requete conditionnelle (If-Modified-Since / If-None-Match) : rien n'est retelecharge si la NASA
 * n'a rien publie. Une seule requete a la fois par flux. Le resultat est garde en memoire et sur disque :
 * en cas d'erreur reseau, la derniere copie est servie et marquee comme ancienne.
 *
 * Ces donnees ne sont ni harmonisees ni definitives (NRT : la NASA peut les revoir) : elles ne rejoignent
 * jamais l'archive 2000-2025 ni ses calculs. Une detection n'est pas un incendie confirme.
 */

import fs from "node:fs";
import path from "node:path";

export type LiveSatellite = "terra" | "aqua" | "snpp" | "noaa20" | "noaa21";
export type LiveTerritory = "GAB" | "FRA";
export const LIVE_SATELLITES: LiveSatellite[] = ["terra", "aqua", "snpp", "noaa20", "noaa21"];
export const LIVE_TERRITORIES: LiveTerritory[] = ["GAB", "FRA"];

const FIRMS = "https://firms.modaps.eosdis.nasa.gov";
/** Delai minimal entre deux verifications d'un meme flux, et entre deux actualisations forcees. */
const CHECK_INTERVAL_MS = 10 * 60_000;
const FORCED_INTERVAL_MS = 2 * 60_000;
const TIMEOUT_MS = 60_000;
/** Copie disque des flux (configurable, notamment pour les tests). */
const CACHE_DIR = process.env.HOTSPOT_LIVE_CACHE ?? path.join(process.cwd(), ".cache", "live");
const GEO_DIR = path.join(process.cwd(), "public", "geo");

interface FeedSpec {
  key: "modis" | "snpp" | "noaa20" | "noaa21";
  sensor: "MODIS" | "VIIRS";
  label: string;
  product: string;
  dir: string;
  prefix: string;
  apiSource: string;
}

const FEEDS: FeedSpec[] = [
  { key: "modis", sensor: "MODIS", label: "MODIS Terra et Aqua", product: "MODIS C6.1 NRT (MCD14DL)", dir: "modis-c6.1", prefix: "MODIS_C6_1", apiSource: "MODIS_NRT" },
  { key: "snpp", sensor: "VIIRS", label: "VIIRS Suomi-NPP", product: "VIIRS 375 m NRT (VNP14IMGTDL)", dir: "suomi-npp-viirs-c2", prefix: "SUOMI_VIIRS_C2", apiSource: "VIIRS_SNPP_NRT" },
  { key: "noaa20", sensor: "VIIRS", label: "VIIRS NOAA-20", product: "VIIRS 375 m NRT (VJ114IMGTDL)", dir: "noaa-20-viirs-c2", prefix: "J1_VIIRS_C2", apiSource: "VIIRS_NOAA20_NRT" },
  { key: "noaa21", sensor: "VIIRS", label: "VIIRS NOAA-21", product: "VIIRS 375 m NRT (VJ214IMGTDL)", dir: "noaa-21-viirs-c2", prefix: "J2_VIIRS_C2", apiSource: "VIIRS_NOAA21_NRT" },
];

interface TerritorySpec {
  name: string;
  /** Region des fichiers FIRMS qui couvre le territoire. */
  firmsRegion: string;
  bbox: [number, number, number, number];
  country: string;
  level1: { file: string; label: string };
  level2: { file: string; label: string };
}

export const TERRITORIES: Record<LiveTerritory, TerritorySpec> = {
  GAB: {
    name: "Gabon",
    firmsRegion: "Northern_and_Central_Africa",
    bbox: [8.45, -4.1, 14.75, 2.45],
    country: "country.geojson",
    level1: { file: "provinces.geojson", label: "Province" },
    level2: { file: "departments.geojson", label: "Département" },
  },
  FRA: {
    name: "France métropolitaine",
    firmsRegion: "Europe",
    bbox: [-5.6, 41.2, 9.8, 51.2],
    country: "fra/country.geojson",
    level1: { file: "fra/provinces.geojson", label: "Région" },
    level2: { file: "fra/departments.geojson", label: "Département" },
  },
};

export interface LiveDetection {
  id: string;
  lat: number;
  lon: number;
  satellite: LiveSatellite;
  sensor: "MODIS" | "VIIRS";
  /** Date et heure d'acquisition, UTC (ISO 8601). */
  acquired: string;
  /** Confiance telle que publiee (pourcentage MODIS, classe VIIRS). */
  confidenceNative: string;
  confidence: "low" | "nominal" | "high";
  frp: number | null;
  daynight: "D" | "N";
  version: string;
  scan: number | null;
  track: number | null;
  territory: LiveTerritory;
  level1: string | null;
  level2: string | null;
  feed: FeedSpec["key"];
}

export interface FeedStatus {
  feed: FeedSpec["key"];
  label: string;
  sensor: "MODIS" | "VIIRS";
  product: string;
  territory: LiveTerritory;
  /** Adresse interrogee, cle masquee. */
  url: string;
  status: "ok" | "empty" | "stale" | "error" | "pending";
  /** Derniere verification aupres de la NASA, derniere copie obtenue, date de publication du fichier. */
  checkedAt: string | null;
  fetchedAt: string | null;
  publishedAt: string | null;
  latestAcquisition: string | null;
  rows: number;
  error: string | null;
}

interface CacheEntry {
  feed: FeedSpec["key"];
  territory: LiveTerritory;
  url: string;
  checkedAt: number;
  fetchedAt: number | null;
  lastModified: string | null;
  etag: string | null;
  rows: LiveDetection[];
  error: string | null;
  failed: boolean;
}

/* ------------------------------------------------------------------ Geometrie */

type Ring = number[][];
interface Area {
  name: string;
  bbox: [number, number, number, number];
  polygons: Ring[][];
}

function toArea(name: string, geometry: { type: string; coordinates: unknown }): Area {
  const polygons = (geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) as Ring[][];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of polygons) for (const [x, y] of p[0]) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return { name, bbox: [w, s, e, n], polygons };
}

function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inArea(x: number, y: number, a: Area): boolean {
  const [w, s, e, n] = a.bbox;
  if (x < w || x > e || y < s || y > n) return false;
  let inside = false;
  for (const polygon of a.polygons) for (const ring of polygon) if (inRing(x, y, ring)) inside = !inside;
  return inside;
}

const geoCache = new Map<LiveTerritory, { country: Area; level1: Area[]; level2: Area[] }>();
function geography(t: LiveTerritory) {
  const cached = geoCache.get(t);
  if (cached) return cached;
  const spec = TERRITORIES[t];
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(GEO_DIR, file), "utf8")) as { features: { properties: { name?: string }; geometry: { type: string; coordinates: unknown } }[] };
  const country = read(spec.country).features;
  const geo = {
    country: { name: spec.name, bbox: [-180, -90, 180, 90] as [number, number, number, number], polygons: country.flatMap((f) => toArea(spec.name, f.geometry).polygons) },
    level1: read(spec.level1.file).features.map((f) => toArea(String(f.properties.name), f.geometry)),
    level2: read(spec.level2.file).features.map((f) => toArea(String(f.properties.name), f.geometry)),
  };
  geo.country.bbox = toArea(spec.name, { type: "MultiPolygon", coordinates: geo.country.polygons }).bbox;
  geoCache.set(t, geo);
  return geo;
}

/* ------------------------------------------------------------------ Lecture des fichiers FIRMS */

function confidenceClass(sensor: "MODIS" | "VIIRS", raw: string): LiveDetection["confidence"] {
  if (sensor === "MODIS") {
    const v = Number(raw);
    return v < 30 ? "low" : v < 80 ? "nominal" : "high";
  }
  const c = raw.trim().toLowerCase()[0];
  return c === "l" ? "low" : c === "h" ? "high" : "nominal";
}

function satelliteOf(feed: FeedSpec, raw: string): LiveSatellite {
  if (feed.key !== "modis") return feed.key;
  return raw.trim().toUpperCase().startsWith("A") ? "aqua" : "terra";
}

/** Analyse le CSV FIRMS ; seules les lignes du territoire (polygone national) sont gardees. */
export function parseFirmsCsv(text: string, feed: FeedSpec, territory: LiveTerritory): LiveDetection[] {
  const lines = text.split(/\r?\n/);
  const header = lines[0]?.split(",").map((h) => h.trim()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const iLat = col("latitude"), iLon = col("longitude"), iDate = col("acq_date"), iTime = col("acq_time");
  const iSat = col("satellite"), iConf = col("confidence"), iVer = col("version"), iFrp = col("frp"), iDn = col("daynight");
  const iScan = col("scan"), iTrack = col("track");
  if (iLat < 0 || iLon < 0 || iDate < 0 || iTime < 0) {
    if (text.trim().length === 0 || lines.length <= 1) return [];
    throw new Error("Format inattendu : colonnes latitude, longitude, acq_date ou acq_time absentes.");
  }
  const geo = geography(territory);
  const [w, s, e, n] = TERRITORIES[territory].bbox;
  const out: LiveDetection[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const f = line.split(",");
    const lat = Number(f[iLat]);
    const lon = Number(f[iLon]);
    if (!(lat >= s && lat <= n && lon >= w && lon <= e)) continue;
    if (!inArea(lon, lat, geo.country)) continue;
    const time = (f[iTime] ?? "").padStart(4, "0");
    const acquired = `${f[iDate]}T${time.slice(0, 2)}:${time.slice(2, 4)}:00Z`;
    if (Number.isNaN(Date.parse(acquired))) continue;
    const confidenceNative = (f[iConf] ?? "").trim();
    const frp = Number(f[iFrp]);
    out.push({
      id: `${feed.key}-${f[iDate]}-${time}-${lat.toFixed(5)}-${lon.toFixed(5)}`,
      lat,
      lon,
      satellite: satelliteOf(feed, f[iSat] ?? ""),
      sensor: feed.sensor,
      acquired,
      confidenceNative: feed.sensor === "MODIS" ? `${confidenceNative} %` : confidenceNative,
      confidence: confidenceClass(feed.sensor, confidenceNative),
      frp: Number.isFinite(frp) ? frp : null,
      daynight: (f[iDn] ?? "").trim().toUpperCase() === "N" ? "N" : "D",
      version: (f[iVer] ?? "").trim(),
      scan: Number.isFinite(Number(f[iScan])) && iScan >= 0 ? Number(f[iScan]) : null,
      track: Number.isFinite(Number(f[iTrack])) && iTrack >= 0 ? Number(f[iTrack]) : null,
      territory,
      level1: geo.level1.find((a) => inArea(lon, lat, a))?.name ?? null,
      level2: geo.level2.find((a) => inArea(lon, lat, a))?.name ?? null,
      feed: feed.key,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ Cache et actualisation */

function mapKey(): string | null {
  const key = process.env.FIRMS_MAP_KEY?.trim();
  return key ? key : null;
}

/**
 * L'observatoire lit les fichiers publics des 7 derniers jours, avec ou sans cle : l'API « area » plafonne a
 * 5 jours par requete et chaque appel consomme le quota de la cle, reserve au prolongement de l'archive
 * (pipeline/recent.py). FIRMS_LIVE_API=1 force l'API, sur 5 jours.
 */
export function liveMode(): { mode: "api" | "files"; maxDays: number } {
  return mapKey() && process.env.FIRMS_LIVE_API === "1" ? { mode: "api", maxDays: 5 } : { mode: "files", maxDays: 7 };
}

function feedUrl(feed: FeedSpec, territory: LiveTerritory): { url: string; shown: string } {
  const key = liveMode().mode === "api" ? mapKey() : null;
  if (key) {
    const area = TERRITORIES[territory].bbox.join(",");
    const url = `${FIRMS}/api/area/csv/${key}/${feed.apiSource}/${area}/5`;
    return { url, shown: url.replace(key, "CLE_MASQUEE") };
  }
  const url = `${FIRMS}/data/active_fire/${feed.dir}/csv/${feed.prefix}_${TERRITORIES[territory].firmsRegion}_7d.csv`;
  return { url, shown: url };
}

const memory = (globalThis as unknown as { __hotspotLive?: Map<string, CacheEntry> }).__hotspotLive ?? new Map<string, CacheEntry>();
(globalThis as unknown as { __hotspotLive?: Map<string, CacheEntry> }).__hotspotLive = memory;
const inflight = new Map<string, Promise<void>>();

function cacheFile(id: string) {
  return path.join(CACHE_DIR, `${id}.json`);
}

function load(id: string): CacheEntry | null {
  const hit = memory.get(id);
  if (hit) return hit;
  try {
    const entry = JSON.parse(fs.readFileSync(cacheFile(id), "utf8")) as CacheEntry;
    memory.set(id, entry);
    return entry;
  } catch {
    return null;
  }
}

function save(id: string, entry: CacheEntry) {
  memory.set(id, entry);
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cacheFile(id), JSON.stringify(entry));
  } catch {
    /* disque en lecture seule : le cache memoire suffit */
  }
}

async function refreshFeed(feed: FeedSpec, territory: LiveTerritory, fetcher: typeof fetch): Promise<void> {
  const id = `${feed.key}_${territory}_${liveMode().mode}`;
  const previous = load(id);
  const { url, shown } = feedUrl(feed, territory);
  const headers: Record<string, string> = { "User-Agent": "Hot-Spot (NASA Space Apps 2026)" };
  if (previous?.lastModified && previous.url === shown && !previous.failed) headers["If-Modified-Since"] = previous.lastModified;
  if (previous?.etag && previous.url === shown && !previous.failed) headers["If-None-Match"] = previous.etag;
  const now = Date.now();
  try {
    const response = await fetcher(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (response.status === 304 && previous) {
      save(id, { ...previous, checkedAt: now, error: null, failed: false });
      return;
    }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Clé FIRMS refusée." : response.status === 429 ? "Limite de requêtes FIRMS atteinte." : `FIRMS a répondu ${response.status}.`);
    const text = await response.text();
    if (/invalid map_key|invalid api call/i.test(text.slice(0, 200))) throw new Error("Clé FIRMS invalide ou requête refusée.");
    save(id, {
      feed: feed.key,
      territory,
      url: shown,
      checkedAt: now,
      fetchedAt: now,
      lastModified: response.headers.get("last-modified"),
      etag: response.headers.get("etag"),
      rows: parseFirmsCsv(text, feed, territory),
      error: null,
      failed: false,
    });
  } catch (error) {
    const message = error instanceof Error ? (error.name === "TimeoutError" ? "FIRMS n'a pas répondu à temps." : error.message) : "Erreur inconnue.";
    save(id, {
      feed: feed.key,
      territory,
      url: shown,
      checkedAt: now,
      fetchedAt: previous?.fetchedAt ?? null,
      lastModified: previous?.lastModified ?? null,
      etag: previous?.etag ?? null,
      rows: previous?.rows ?? [],
      error: message,
      failed: true,
    });
  }
}

/**
 * Verifie les flux dont la derniere verification date de plus de 10 minutes (2 minutes si `force`),
 * en parallele, une requete a la fois par flux, puis renvoie l'etat de chacun.
 */
export async function liveSnapshot(options: { force?: boolean; fetcher?: typeof fetch; now?: number } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now();
  const mode = liveMode();
  const jobs: Promise<void>[] = [];
  for (const territory of LIVE_TERRITORIES) {
    for (const feed of FEEDS) {
      const id = `${feed.key}_${territory}_${mode.mode}`;
      const entry = load(id);
      const age = entry ? now - entry.checkedAt : Infinity;
      if (age < (options.force ? FORCED_INTERVAL_MS : CHECK_INTERVAL_MS)) continue;
      let job = inflight.get(id);
      if (!job) {
        job = refreshFeed(feed, territory, fetcher).finally(() => inflight.delete(id));
        inflight.set(id, job);
      }
      jobs.push(job);
    }
  }
  await Promise.all(jobs);

  const feeds: FeedStatus[] = [];
  const detections: LiveDetection[] = [];
  for (const territory of LIVE_TERRITORIES) {
    for (const feed of FEEDS) {
      const entry = load(`${feed.key}_${territory}_${mode.mode}`);
      const latest = entry?.rows.reduce<string | null>((acc, r) => (acc === null || r.acquired > acc ? r.acquired : acc), null) ?? null;
      feeds.push({
        feed: feed.key,
        label: feed.label,
        sensor: feed.sensor,
        product: feed.product,
        territory,
        url: entry?.url ?? feedUrl(feed, territory).shown,
        status: !entry ? "pending" : entry.failed ? (entry.fetchedAt ? "stale" : "error") : entry.rows.length ? "ok" : "empty",
        checkedAt: entry ? new Date(entry.checkedAt).toISOString() : null,
        fetchedAt: entry?.fetchedAt ? new Date(entry.fetchedAt).toISOString() : null,
        publishedAt: entry?.lastModified ? new Date(entry.lastModified).toISOString() : null,
        latestAcquisition: latest,
        rows: entry?.rows.length ?? 0,
        error: entry?.error ?? null,
      });
      if (entry) detections.push(...entry.rows);
    }
  }
  return { mode: mode.mode, maxDays: mode.maxDays, feeds, detections };
}
