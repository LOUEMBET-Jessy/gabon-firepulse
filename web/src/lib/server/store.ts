/**
 * Chargement des donnees traitees par le pipeline (web/data/).
 * Module serveur uniquement : rien ici n'atteint le navigateur.
 * Lecture synchrone, une seule fois par processus.
 */

import fs from "node:fs";
import path from "node:path";

import type { CalibrationSummary, ConfigKey, GapRecord, SatelliteMeta, SourceFile } from "../types";
import { CONFIG_KEYS } from "../types";

const DATA_DIR = path.join(process.cwd(), "data");
const GEO_DIR = path.join(process.cwd(), "public", "geo");
const DAY_MS = 86_400_000;

interface ColumnMeta {
  name: string;
  dtype: "f32" | "i32" | "u32" | "u16" | "u8" | "i8";
  offset: number;
  bytes: number;
}

interface DetectionsMeta {
  built_at: string;
  count: number;
  epoch: string;
  first_day: number;
  last_day: number;
  columns: ColumnMeta[];
  versions: string[];
  satellites: SatelliteMeta[];
  provinces: { index: number; iso: string; name: string }[];
  sources: SourceFile[];
}

export interface HarmonizationFile {
  built_at: string;
  unit: string;
  grid: { lon0: number; lat0: number; step_deg: number; ncols: number; nrows: number };
  eligibility: { type: number; modis_min_confidence_pct: number; viirs_classes: string[] };
  configs: Record<ConfigKey, ("terra" | "aqua" | "snpp" | "noaa20")[]>;
  reference_config: ConfigKey;
  relay_priority: ConfigKey[];
  gap_rules: Record<string, unknown>;
  gaps: (GapRecord & { start_day: number; end_day: number })[];
  relay_segments: { config: ConfigKey | null; start_day: number; end_day: number; start: string; end: string }[];
  calibration: Partial<Record<ConfigKey, CalibrationSummary>>;
  calibration_settings: { season_months: number[]; cv_min_reference: number; parsimony_tolerance: number; method: string };
  diagnostics: {
    unit_comparison: Record<string, { factor_global: number; monthly_median_abs_pct_error: number; annual_mean_abs_pct_error: number }>;
    yearly_ratio: { year: number; TA: number | null; A: number | null; T: number | null; N: number | null }[];
    province_transfer: {
      province: string;
      reference_cell_days: number;
      predicted_cell_days: number;
      ratio_reference_over_predicted: number | null;
      annual_median_abs_pct_error: number | null;
      years_scored: number;
    }[];
  };
  national_monthly: {
    year: number;
    month: number;
    days: number;
    unobserved_days: number;
    source_days: Partial<Record<ConfigKey, number>>;
    cell_days: Record<ConfigKey, number>;
    detections: Record<string, number>;
    harmonized: number;
  }[];
}

export interface MetadataFile {
  built_at: string;
  data_kind: "real" | "simulated";
  data_kind_label: string;
  country: string;
  coverage: { first_date: string; last_date: string };
  rows: { read: number; kept: number; rejected: number; eligible: number; outside_provinces: number };
  firms: {
    base_url: string;
    missing_years: { dataset: string; year: number; url: string; http_status: number }[];
    accessed_first: string;
    accessed_last: string;
  };
  boundaries: {
    level: string;
    source: string;
    license: string;
    license_detail: string | null;
    year_represented: string;
    download_url: string;
    accessed_at: string;
  }[];
}

export interface QualityFile {
  rows_read: number;
  rows_kept: number;
  rows_rejected: number;
  rejects: { file: string; line: number; reason: string }[];
  warnings: { file: string; field: string; count: number; action: string }[];
}

export interface Store {
  n: number;
  nDays: number;
  firstDay: number;
  lastDay: number;
  epochMs: number;
  // Colonnes des detections, triees par (jour, cellule, satellite).
  lat: Float32Array;
  lon: Float32Array;
  frp: Float32Array;
  bright: Float32Array;
  bright2: Float32Array;
  scan: Float32Array;
  track: Float32Array;
  cell: Int32Array;
  line: Uint32Array;
  day: Uint16Array;
  time: Uint16Array;
  sat: Uint8Array;
  confClass: Uint8Array;
  confNative: Uint8Array;
  night: Uint8Array;
  type: Uint8Array;
  version: Uint8Array;
  src: Uint8Array;
  province: Int8Array;
  eligible: Uint8Array;
  /** Indice de la premiere ligne de chaque jour (longueur nDays + 1). */
  dayStart: Uint32Array;
  // Calendrier par jour.
  yearOfDay: Uint16Array;
  monthOfDay: Uint8Array;
  /** Relais par jour : configuration retenue (indice dans CONFIG_KEYS, -1 si aucun capteur en service). */
  sourceOfDay: Int8Array;
  /** Masque de satellites de chaque configuration (bit = code du satellite). */
  configBits: number[];
  /** Par satellite : 1 si le satellite est en service ce jour (apres sa mise en service, hors interruptions). */
  operating: Uint8Array[];
  /** Par configuration (ordre de CONFIG_KEYS) : facteurs nationaux par mois calendaire, 1 pour la reference. */
  nationalFactors: number[][];
  /** Par configuration : quantiles 10 % et 90 % du rapport reference / prediction en validation. */
  nationalRatioQ10: number[];
  nationalRatioQ90: number[];
  meta: DetectionsMeta;
  harmonization: HarmonizationFile;
  metadata: MetadataFile;
  quality: QualityFile;
  provinceAreaKm2: number[];
  countryAreaKm2: number;
  provinceBbox: [number, number, number, number][];
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

type Ring = number[][];

function ringAreaKm2(ring: Ring): number {
  // Aire spherique d'un anneau (formule de Chamberlain et Duquette), rayon moyen 6371,0088 km.
  const R = 6371.0088;
  const rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    sum += (lon2 - lon1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs((sum * R * R) / 2);
}

function geometryArea(geometry: { type: string; coordinates: unknown }): number {
  const polygons = (geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) as Ring[][];
  let area = 0;
  for (const polygon of polygons) {
    polygon.forEach((ring, i) => {
      area += (i === 0 ? 1 : -1) * ringAreaKm2(ring);
    });
  }
  return area;
}

function geometryBbox(geometry: { type: string; coordinates: unknown }): [number, number, number, number] {
  const polygons = (geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) as Ring[][];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const polygon of polygons) {
    for (const [lon, lat] of polygon[0]) {
      if (lon < w) w = lon;
      if (lon > e) e = lon;
      if (lat < s) s = lat;
      if (lat > n) n = lat;
    }
  }
  return [w, s, e, n];
}

function load(): Store {
  const meta = readJson<DetectionsMeta>(path.join(DATA_DIR, "detections.meta.json"));
  const harmonization = readJson<HarmonizationFile>(path.join(DATA_DIR, "harmonization.json"));
  const metadata = readJson<MetadataFile>(path.join(DATA_DIR, "metadata.json"));
  const quality = readJson<QualityFile>(path.join(DATA_DIR, "quality_log.json"));
  const buffer = fs.readFileSync(path.join(DATA_DIR, "detections.bin"));

  const column = <T>(name: string, make: (ab: ArrayBuffer) => T): T => {
    const c = meta.columns.find((item) => item.name === name);
    if (!c) throw new Error(`Colonne absente du fichier de detections : ${name}`);
    const start = buffer.byteOffset + c.offset;
    // slice() copie vers un tampon aligne, requis par les tableaux types.
    return make(buffer.buffer.slice(start, start + c.bytes) as ArrayBuffer);
  };
  const f32 = (name: string) => column(name, (ab) => new Float32Array(ab));
  const u8 = (name: string) => column(name, (ab) => new Uint8Array(ab));
  const u16 = (name: string) => column(name, (ab) => new Uint16Array(ab));

  const n = meta.count;
  const day = u16("day");
  const nDays = meta.last_day + 1;
  const epochMs = Date.UTC(Number(meta.epoch.slice(0, 4)), Number(meta.epoch.slice(5, 7)) - 1, Number(meta.epoch.slice(8, 10)));

  const dayStart = new Uint32Array(nDays + 1);
  {
    let row = 0;
    for (let d = 0; d <= nDays; d++) {
      while (row < n && day[row] < d) row++;
      dayStart[d] = row;
    }
  }

  const yearOfDay = new Uint16Array(nDays);
  const monthOfDay = new Uint8Array(nDays);
  for (let d = 0; d < nDays; d++) {
    const date = new Date(epochMs + d * DAY_MS);
    yearOfDay[d] = date.getUTCFullYear();
    monthOfDay[d] = date.getUTCMonth() + 1;
  }

  const satCode: Record<string, number> = {};
  for (const s of meta.satellites) satCode[s.key] = s.code;
  const configBits = CONFIG_KEYS.map((key) => harmonization.configs[key].reduce((bits, sat) => bits | (1 << satCode[sat]), 0));

  const operating = meta.satellites.map((sat) => {
    const mask = new Uint8Array(nDays);
    const first = Math.round((Date.UTC(Number(sat.first_date.slice(0, 4)), Number(sat.first_date.slice(5, 7)) - 1, Number(sat.first_date.slice(8, 10))) - epochMs) / DAY_MS);
    mask.fill(1, first);
    for (const gap of harmonization.gaps) if (gap.satellite === sat.key) mask.fill(0, gap.start_day, Math.min(gap.end_day + 1, nDays));
    return mask;
  });
  const nationalFactors = CONFIG_KEYS.map((key) => harmonization.calibration[key]?.factors_by_month ?? new Array<number>(12).fill(1));
  const nationalRatioQ10 = CONFIG_KEYS.map((key) => harmonization.calibration[key]?.validation.monthly_ratio_q10 ?? 1);
  const nationalRatioQ90 = CONFIG_KEYS.map((key) => harmonization.calibration[key]?.validation.monthly_ratio_q90 ?? 1);

  const sourceOfDay = new Int8Array(nDays).fill(-1);
  for (const segment of harmonization.relay_segments) {
    if (!segment.config) continue;
    const index = CONFIG_KEYS.indexOf(segment.config);
    for (let d = segment.start_day; d <= segment.end_day && d < nDays; d++) sourceOfDay[d] = index;
  }

  const provincesGeo = readJson<{ features: { properties: { index: number }; geometry: { type: string; coordinates: unknown } }[] }>(
    path.join(GEO_DIR, "provinces.geojson"),
  );
  const countryGeo = readJson<{ features: { geometry: { type: string; coordinates: unknown } }[] }>(path.join(GEO_DIR, "country.geojson"));
  const provinceAreaKm2: number[] = [];
  const provinceBbox: [number, number, number, number][] = [];
  for (const feature of provincesGeo.features) {
    provinceAreaKm2[feature.properties.index] = geometryArea(feature.geometry);
    provinceBbox[feature.properties.index] = geometryBbox(feature.geometry);
  }

  return {
    n,
    nDays,
    firstDay: meta.first_day,
    lastDay: meta.last_day,
    epochMs,
    lat: f32("lat"),
    lon: f32("lon"),
    frp: f32("frp"),
    bright: f32("bright"),
    bright2: f32("bright2"),
    scan: f32("scan"),
    track: f32("track"),
    cell: column("cell", (ab) => new Int32Array(ab)),
    line: column("line", (ab) => new Uint32Array(ab)),
    day,
    time: u16("time"),
    sat: u8("sat"),
    confClass: u8("conf_class"),
    confNative: u8("conf_native"),
    night: u8("night"),
    type: u8("type"),
    version: u8("version"),
    src: u8("src"),
    province: column("province", (ab) => new Int8Array(ab)),
    eligible: u8("eligible"),
    dayStart,
    yearOfDay,
    monthOfDay,
    sourceOfDay,
    configBits,
    operating,
    nationalFactors,
    nationalRatioQ10,
    nationalRatioQ90,
    meta,
    harmonization,
    metadata,
    quality,
    provinceAreaKm2,
    countryAreaKm2: countryGeo.features.reduce((acc, f) => acc + geometryArea(f.geometry), 0),
    provinceBbox,
  };
}

/** A incrementer quand la forme de Store change : evite de reutiliser un cache perime en developpement. */
const STORE_SCHEMA = 2;
const globalStore = globalThis as unknown as { __firepulseStore?: { schema: number; store: Store } };

export function getStore(): Store {
  const cached = globalStore.__firepulseStore;
  if (cached && cached.schema === STORE_SCHEMA) return cached.store;
  const store = load();
  globalStore.__firepulseStore = { schema: STORE_SCHEMA, store };
  return store;
}

/** Jour (index depuis l'epoque) vers date ISO AAAA-MM-JJ. */
export function dayToIso(store: Store, day: number): string {
  return new Date(store.epochMs + day * DAY_MS).toISOString().slice(0, 10);
}

/** Date ISO vers index de jour. NaN si la date est invalide. */
export function isoToDay(store: Store, iso: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
  const ms = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  if (Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) return NaN;
  return Math.round((ms - store.epochMs) / DAY_MS);
}
