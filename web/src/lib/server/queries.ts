/** Requetes sur les detections natives : carte, grille, synthese, regions, fiche, export. */

import { quantile } from "../science/stats";
import type {
  DetectionDetail,
  DetectionRow,
  DetectionsResponse,
  DistributionSummary,
  GridCell,
  GridResponse,
  OverviewResponse,
  PerSatellite,
  RegionsResponse,
  SatelliteKey,
  ZoneSpec,
} from "../types";
import { SATELLITE_KEYS } from "../types";
import { assessWindow, provenance, sensorComparison, summarizeRange, zoneDaily } from "./engine";
import { dayToIso, getStore, type Store } from "./store";
import { zoneInfo, zoneMatcher } from "./zone";

export const POINT_CAP = 100_000;
const CONF_NAMES = ["low", "nominal", "high"] as const;

export interface DetectionFilter {
  zone: ZoneSpec;
  first: number;
  last: number;
  /** Satellites retenus (codes). */
  sats: boolean[];
  /** Classes de confiance retenues : faible, nominale, elevee. */
  conf: boolean[];
  /** "veg" : feu de vegetation presume ; "static" : autres sources ; "all". */
  types: "veg" | "static" | "all";
  dayNight: "day" | "night" | "all";
}

function rowMatcher(filter: DetectionFilter, store: Store): (row: number) => boolean {
  const inZone = zoneMatcher(filter.zone, store);
  const { sat, confClass, type, night } = store;
  const { sats, conf, types, dayNight } = filter;
  return (row) => {
    if (!sats[sat[row]] || !conf[confClass[row]]) return false;
    if (types === "veg" ? type[row] !== 0 : types === "static" ? type[row] === 0 : false) return false;
    if (dayNight === "day" ? night[row] === 1 : dayNight === "night" ? night[row] === 0 : false) return false;
    return inZone(row);
  };
}

function emptyPerSat(): PerSatellite {
  return { terra: 0, aqua: 0, snpp: 0, noaa20: 0 };
}

const round = (value: number, digits: number) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

function hhmm(time: number): string {
  return `${String(Math.floor(time / 100)).padStart(2, "0")}:${String(time % 100).padStart(2, "0")}`;
}

function nativeConfidence(store: Store, row: number): string {
  if (store.sat[row] <= 1) return `${store.confNative[row]} %`;
  return ["l (faible)", "n (nominale)", "h (élevée)"][store.confClass[row]];
}

export function toRow(store: Store, row: number): DetectionRow {
  const frp = store.frp[row];
  const type = store.type[row];
  return {
    id: String(row),
    lon: round(store.lon[row], 5),
    lat: round(store.lat[row], 5),
    date: dayToIso(store, store.day[row]),
    time: hhmm(store.time[row]),
    satellite: SATELLITE_KEYS[store.sat[row]],
    confidenceClass: CONF_NAMES[store.confClass[row]],
    confidenceNative: nativeConfidence(store, row),
    frp: Number.isNaN(frp) ? null : round(frp, 2),
    night: store.night[row] === 1,
    type: type === 255 ? null : type,
  };
}

export function queryDetections(filter: DetectionFilter, store: Store = getStore()): DetectionsResponse {
  const match = rowMatcher(filter, store);
  const start = store.dayStart[filter.first];
  const end = store.dayStart[filter.last + 1];
  const bySatellite = emptyPerSat();
  const rows: number[] = [];
  let total = 0;
  for (let row = start; row < end; row++) {
    if (!match(row)) continue;
    total++;
    bySatellite[SATELLITE_KEYS[store.sat[row]]]++;
    if (rows.length <= POINT_CAP) rows.push(row);
  }
  const truncated = total > POINT_CAP;
  return {
    total,
    cap: POINT_CAP,
    truncated,
    bySatellite,
    points: truncated
      ? null
      : {
          index: rows,
          lon: rows.map((r) => round(store.lon[r], 5)),
          lat: rows.map((r) => round(store.lat[r], 5)),
          day: rows.map((r) => store.day[r]),
          sat: rows.map((r) => store.sat[r]),
          conf: rows.map((r) => store.confClass[r]),
          type: rows.map((r) => store.type[r]),
          night: rows.map((r) => store.night[r]),
          frp: rows.map((r) => (Number.isNaN(store.frp[r]) ? null : round(store.frp[r], 1))),
        },
    epoch: store.meta.epoch,
    provenance: provenance(store),
  };
}

const TYPE_LABELS: Record<number, string> = {
  0: "0 : feu de végétation présumé",
  1: "1 : volcan actif",
  2: "2 : autre source statique terrestre",
  3: "3 : source en mer",
};

export function detectionDetail(row: number, store: Store = getStore()): DetectionDetail | null {
  if (!Number.isInteger(row) || row < 0 || row >= store.n) return null;
  const base = toRow(store, row);
  const sat = store.meta.satellites[store.sat[row]];
  const source = store.meta.sources[store.src[row]];
  const modis = sat.sensor === "MODIS";
  const grid = store.harmonization.grid;
  const cell = store.cell[row];
  const col = cell % grid.ncols;
  const line = Math.floor(cell / grid.ncols);
  const type = store.type[row];
  const eligible = store.eligible[row] === 1;
  const num = (v: number, digits: number) => (Number.isNaN(v) ? null : round(v, digits));
  let reason = "Retenue : feu de végétation présumé, confiance non faible.";
  if (!eligible) {
    reason =
      type !== 0
        ? "Exclue de l'indice : le produit la classe comme source autre qu'un feu de végétation."
        : "Exclue de l'indice : confiance faible.";
  }
  const provinceIndex = store.province[row];
  return {
    ...base,
    sensor: sat.sensor,
    platform: sat.name,
    product: modis
      ? "MODIS Active Fire, archive FIRMS (produit standard MCD14ML d'après la présence du champ type)"
      : `VIIRS 375 m Active Fire, archive FIRMS (${sat.key === "snpp" ? "VNP14IMGML" : "VJ114IMGML"} d'après la présence du champ type)`,
    version: store.meta.versions[store.version[row]],
    acqDatetimeUtc: `${base.date}T${base.time}:00Z`,
    brightness: num(store.bright[row], 2),
    brightnessLabel: modis ? "Température de brillance, canal 21/22 (K)" : "Température de brillance, canal I-4 (K)",
    brightness2: num(store.bright2[row], 2),
    brightness2Label: modis ? "Température de brillance, canal 31 (K)" : "Température de brillance, canal I-5 (K)",
    scan: num(store.scan[row], 2),
    track: num(store.track[row], 2),
    typeLabel: type === 255 ? "Indisponible" : TYPE_LABELS[type],
    eligible,
    eligibilityReason: reason,
    cell: {
      index: cell,
      west: round(grid.lon0 + col * grid.step_deg, 4),
      south: round(grid.lat0 + line * grid.step_deg, 4),
      east: round(grid.lon0 + (col + 1) * grid.step_deg, 4),
      north: round(grid.lat0 + (line + 1) * grid.step_deg, 4),
    },
    province: provinceIndex >= 0 ? store.meta.provinces[provinceIndex].name : null,
    source: {
      file: source.file,
      line: store.line[row],
      url: source.url,
      sha256: source.sha256,
      accessedAt: source.accessed_at,
      recordId: `${source.file}#L${store.line[row]}`,
    },
    ingestedAt: store.meta.built_at,
  };
}

/** Agregat par cellule : jours actifs harmonises et detections par capteur. */
export function queryGrid(zone: ZoneSpec, first: number, last: number, store: Store = getStore()): GridResponse {
  const { dayStart, cell, sat, eligible, configBits, sourceOfDay } = store;
  // Memes facteurs que l'indice de la zone, calage local compris.
  const factorOfDay = zoneDaily(zone, store).factor;
  const inZone = zoneMatcher(zone, store);
  const grid = store.harmonization.grid;
  const acc = new Map<number, { harmonized: number; modis: number; snpp: number; noaa20: number }>();
  for (let d = first; d <= last; d++) {
    const end = dayStart[d + 1];
    let row = dayStart[d];
    const source = sourceOfDay[d];
    while (row < end) {
      const current = cell[row];
      let mask = 0, modis = 0, snpp = 0, noaa20 = 0;
      while (row < end && cell[row] === current) {
        if (eligible[row] === 1 && inZone(row)) {
          const s = sat[row];
          mask |= 1 << s;
          if (s <= 1) modis++;
          else if (s === 2) snpp++;
          else noaa20++;
        }
        row++;
      }
      if (mask === 0) continue;
      let entry = acc.get(current);
      if (!entry) {
        entry = { harmonized: 0, modis: 0, snpp: 0, noaa20: 0 };
        acc.set(current, entry);
      }
      entry.modis += modis;
      entry.snpp += snpp;
      entry.noaa20 += noaa20;
      if (source >= 0 && mask & configBits[source]) entry.harmonized += factorOfDay[d];
    }
  }
  const cells: GridCell[] = [];
  let maxHarmonized = 0;
  for (const [index, entry] of acc) {
    const col = index % grid.ncols;
    const line = Math.floor(index / grid.ncols);
    if (entry.harmonized > maxHarmonized) maxHarmonized = entry.harmonized;
    cells.push({
      cell: index,
      lon: round(grid.lon0 + col * grid.step_deg, 4),
      lat: round(grid.lat0 + line * grid.step_deg, 4),
      harmonized: round(entry.harmonized, 2),
      modis: entry.modis,
      snpp: entry.snpp,
      noaa20: entry.noaa20,
    });
  }
  return { step: grid.step_deg, cells, maxHarmonized: round(maxHarmonized, 2), provenance: provenance(store) };
}

function distribution(values: number[]): DistributionSummary {
  if (values.length === 0) return { n: 0, q10: null, q25: null, median: null, q75: null, q90: null, max: null };
  const s = [...values].sort((a, b) => a - b);
  const q = (p: number) => round(quantile(s, p), 2);
  return { n: s.length, q10: q(0.1), q25: q(0.25), median: q(0.5), q75: q(0.75), q90: q(0.9), max: round(s[s.length - 1], 2) };
}

export function overview(zone: ZoneSpec, first: number, last: number, store: Store = getStore()): OverviewResponse {
  const daily = zoneDaily(zone, store);
  const sum = summarizeRange(daily, first, last, store);
  const inZone = zoneMatcher(zone, store);
  const lowConfidence = emptyPerSat();
  const night = emptyPerSat();
  const confidence = Object.fromEntries(SATELLITE_KEYS.map((k) => [k, { low: 0, nominal: 0, high: 0 }])) as OverviewResponse["confidence"];
  const frpValues: Record<SatelliteKey, number[]> = { terra: [], aqua: [], snpp: [], noaa20: [] };
  const activeCells = new Set<number>();
  const start = store.dayStart[first];
  const end = store.dayStart[last + 1];
  const latestRows: number[] = [];
  for (let row = start; row < end; row++) {
    if (!inZone(row)) continue;
    const key = SATELLITE_KEYS[store.sat[row]];
    const cls = store.confClass[row];
    confidence[key][CONF_NAMES[cls]]++;
    if (cls === 0) lowConfidence[key]++;
    if (store.night[row] === 1) night[key]++;
    if (store.eligible[row] === 1) {
      activeCells.add(store.cell[row]);
      const frp = store.frp[row];
      if (!Number.isNaN(frp)) frpValues[key].push(frp);
    }
  }
  for (let row = end - 1; row >= start && latestRows.length < 8; row--) if (inZone(row)) latestRows.push(row);

  const firstIso = dayToIso(store, first);
  const lastIso = dayToIso(store, last);
  const gaps = store.harmonization.gaps
    .filter((g) => g.end_day >= first && g.start_day <= last)
    .map((g) => ({
      satellite: g.satellite,
      start: g.start,
      end: g.end,
      days: g.days,
      expected_detections: g.expected_detections,
      witness: g.witness,
      witness_detections: g.witness_detections,
    }));
  return {
    zone: zoneInfo(zone, store),
    from: firstIso,
    to: lastIso,
    days: sum.days,
    unobservedDays: sum.unobservedDays,
    harmonized: sum.harmonized,
    low: sum.low,
    high: sum.high,
    estimatedShare: sum.estimatedShare,
    window: assessWindow(zone, first, last, store),
    detections: sum.detections,
    eligible: sum.eligible,
    staticSources: sum.staticSources,
    lowConfidence,
    night,
    frp: Object.fromEntries(SATELLITE_KEYS.map((k) => [k, distribution(frpValues[k])])) as OverviewResponse["frp"],
    confidence,
    gaps,
    latest: latestRows.map((row) => toRow(store, row)),
    activeCells: activeCells.size,
    sensors: sensorComparison(daily, first, last, store),
    provenance: provenance(store),
  };
}

export function regions(first: number, last: number, store: Store = getStore()): RegionsResponse {
  const rows = store.meta.provinces.map((p) => {
    const zone: ZoneSpec = { kind: "province", index: p.index };
    const sum = summarizeRange(zoneDaily(zone, store), first, last, store);
    const area = store.provinceAreaKm2[p.index];
    return {
      index: p.index,
      name: p.name,
      iso: p.iso,
      areaKm2: area,
      harmonized: sum.harmonized,
      density: area > 0 ? (sum.harmonized / area) * 1000 : 0,
      share: 0,
      detections: sum.detections,
      window: assessWindow(zone, first, last, store),
    };
  });
  const total = rows.reduce((a, r) => a + r.harmonized, 0);
  for (const r of rows) r.share = total > 0 ? r.harmonized / total : 0;
  const outside = emptyPerSat();
  for (let row = store.dayStart[first]; row < store.dayStart[last + 1]; row++) {
    if (store.province[row] === -1) outside[SATELLITE_KEYS[store.sat[row]]]++;
  }
  return { from: dayToIso(store, first), to: dayToIso(store, last), regions: rows, outsideProvinces: outside, provenance: provenance(store) };
}

/** Activite par departement, pour tout le pays ou une province. Meme forme que l'activite par province. */
export function departmentRegions(first: number, last: number, province: number | null, store: Store = getStore()): RegionsResponse {
  const rows = store.geography.departments
    .filter((d) => province === null || d.province === province)
    .map((d) => {
      const zone: ZoneSpec = { kind: "department", index: d.index };
      const sum = summarizeRange(zoneDaily(zone, store), first, last, store);
      const area = store.departmentAreaKm2[d.index];
      return {
        index: d.index,
        name: d.name,
        iso: "",
        areaKm2: area,
        harmonized: sum.harmonized,
        density: area > 0 ? (sum.harmonized / area) * 1000 : 0,
        share: 0,
        detections: sum.detections,
        window: assessWindow(zone, first, last, store),
      };
    });
  const total = rows.reduce((a, r) => a + r.harmonized, 0);
  for (const r of rows) r.share = total > 0 ? r.harmonized / total : 0;
  const outside = emptyPerSat();
  for (let row = store.dayStart[first]; row < store.dayStart[last + 1]; row++) {
    if (store.department[row] === -1 && (province === null || store.province[row] === province)) outside[SATELLITE_KEYS[store.sat[row]]]++;
  }
  return { from: dayToIso(store, first), to: dayToIso(store, last), regions: rows, outsideProvinces: outside, provenance: provenance(store) };
}

/** Iterateur des lignes retenues par un filtre, pour l'export. */
export function* matchingRows(filter: DetectionFilter, store: Store = getStore()): Generator<number> {
  const match = rowMatcher(filter, store);
  const end = store.dayStart[filter.last + 1];
  for (let row = store.dayStart[filter.first]; row < end; row++) if (match(row)) yield row;
}
