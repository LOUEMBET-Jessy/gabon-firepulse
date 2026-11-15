/**
 * Moteur d'agregation par zone.
 *
 * Applique a n'importe quelle zone la regle definie par le pipeline :
 *   indice harmonise du jour = facteur(configuration du jour, mois) x cellules-jour actives de cette configuration
 * La configuration du jour (relais) et les facteurs viennent de harmonization.json.
 * Un test verifie que ce moteur reproduit, pour le pays entier, la table mensuelle
 * calculee independamment par le pipeline Python.
 */

import { assess, criticalMonths as findCriticalMonths } from "../science/anomaly";
import { quantile, theilSenMannKendall } from "../science/stats";
import type {
  CalendarResponse,
  ConfigKey,
  ZoneCalibration,
  ZoneCalibrationEntry,
  MonthBaseline,
  MonthKind,
  MonthRecord,
  PerConfig,
  PerSatellite,
  Provenance,
  YearRecord,
  ZoneSpec,
} from "../types";
import { CONFIG_KEYS, SATELLITE_KEYS } from "../types";
import { dayToIso, getStore, type Store } from "./store";
import { zoneInfo, zoneKey, zoneMatcher } from "./zone";

const N_CONFIG = CONFIG_KEYS.length;
const N_SAT = SATELLITE_KEYS.length;
/** Indices des configurations MODIS dans CONFIG_KEYS (T, A, TA). */
const MODIS_CONFIGS = new Set([0, 1, 2]);
const TERRA_ONLY = 0;
/** Une periode est dite complete si au plus 10 % de ses jours ne sont observes par aucun capteur. */
export const MAX_UNOBSERVED_SHARE = 0.1;

/**
 * Ajustement du calage a la zone.
 * Les facteurs nationaux se transposent mal d'une province a l'autre : le
 * rapport VIIRS / MODIS cale varie de 0,7 a 1,85 selon la province. Chaque zone recoit donc
 * une correction k = (R + w) / (P + w), ou R est la somme des cellules-jour Suomi-NPP de la
 * zone sur les jours communs, P la prediction par les facteurs nationaux, et w un poids
 * donne au facteur national. Une zone peu active reste proche du facteur national (k proche de 1).
 */
export const ZONE_PRIOR_WEIGHT = 200;
/** Une annee ou un mois compte dans la verification s'il a au moins 20 cellules-jour de reference. */
const MIN_SCORED = 20;
/** Nombre de mois mesurables a partir duquel le calage de la zone est considere comme verifie. */
const MIN_MONTHS_VERIFIED = 24;
/** Au-dela de 30 % d'erreur annuelle en validation, les valeurs estimees de la zone sont de fiabilite faible. */
export const WEAK_CALIBRATION_ERROR = 0.3;
const REFERENCE = CONFIG_KEYS.indexOf("S");

interface ZoneFactors {
  calibration: ZoneCalibration;
  /** Par configuration : correction k, quantiles du rapport reference / prediction. */
  k: number[];
  q10: number[];
  q90: number[];
}

function calibrateZone(zone: ZoneSpec, cellDays: Float64Array[], store: Store): ZoneFactors {
  const { nDays, operating, configBits, nationalFactors, nationalRatioQ10, nationalRatioQ90, nationalAnnualMin, nationalAnnualMax, monthOfDay, yearOfDay } = store;
  const local = zone.kind !== "country";
  const k = new Array<number>(N_CONFIG).fill(1);
  const q10 = [...nationalRatioQ10];
  const q90 = [...nationalRatioQ90];
  const configs = {} as PerConfig<ZoneCalibrationEntry | null>;
  const reference = cellDays[REFERENCE];

  for (let c = 0; c < N_CONFIG; c++) {
    if (c === REFERENCE) {
      configs[CONFIG_KEYS[c]] = null;
      continue;
    }
    const sats = [0, 1, 2, 3].filter((sat) => configBits[c] & (1 << sat));
    const byYear = new Map<number, { p: number; r: number }>();
    const byMonth = new Map<number, { p: number; r: number }>();
    let sumP = 0, sumR = 0;
    for (let d = 0; d < nDays; d++) {
      if (operating[2][d] === 0) continue;
      let common = true;
      for (const sat of sats) if (operating[sat][d] === 0) common = false;
      if (!common) continue;
      const p = nationalFactors[c][monthOfDay[d] - 1] * cellDays[c][d];
      const r = reference[d];
      sumP += p;
      sumR += r;
      const y = byYear.get(yearOfDay[d]) ?? { p: 0, r: 0 };
      y.p += p;
      y.r += r;
      byYear.set(yearOfDay[d], y);
      const key = yearOfDay[d] * 12 + monthOfDay[d];
      const m = byMonth.get(key) ?? { p: 0, r: 0 };
      m.p += p;
      m.r += r;
      byMonth.set(key, m);
    }
    const w = ZONE_PRIOR_WEIGHT;
    const kc = local ? (sumR + w) / (sumP + w) : 1;
    k[c] = kc;

    // Erreur annuelle en retirant une annee a la fois : k est recalcule sans l'annee testee.
    const errors: number[] = [];
    const annualRatios: number[] = [];
    for (const { p, r } of byYear.values()) {
      if (r < MIN_SCORED || p <= 0) continue;
      const ky = local ? (sumR - r + w) / (sumP - p + w) : 1;
      errors.push(Math.abs(ky * p - r) / r);
      annualRatios.push(r / (ky * p));
    }
    // Pour le pays, l'etendue annuelle vient de la validation du pipeline ; pour une zone, des annees communes de la zone.
    const annualMin = local && annualRatios.length >= 3 ? Math.min(...annualRatios) : nationalAnnualMin[c];
    const annualMax = local && annualRatios.length >= 3 ? Math.max(...annualRatios) : nationalAnnualMax[c];
    const ratios: number[] = [];
    for (const { p, r } of byMonth.values()) if (r >= MIN_SCORED && p > 0) ratios.push(r / (kc * p));
    const verified = ratios.length >= MIN_MONTHS_VERIFIED;
    if (local && verified) {
      q10[c] = quantile(ratios, 0.1);
      q90[c] = quantile(ratios, 0.9);
    }
    configs[CONFIG_KEYS[c]] = {
      k: kc,
      referenceCellDays: sumR,
      annualErrorLoyo: errors.length >= 3 ? quantile(errors, 0.5) : null,
      yearsScored: errors.length,
      monthsScored: ratios.length,
      ratioQ10: q10[c],
      ratioQ90: q90[c],
      annualRatioMin: annualMin,
      annualRatioMax: annualMax,
      verified,
    };
  }
  return { calibration: { local, priorWeight: ZONE_PRIOR_WEIGHT, configs }, k, q10, q90 };
}

export interface ZoneDaily {
  key: string;
  /** Cellules-jour actives par configuration et par jour. */
  cellDays: Float64Array[];
  detections: Uint32Array[];
  eligible: Uint32Array[];
  staticSources: Uint32Array[];
  harmonized: Float64Array;
  low: Float64Array;
  high: Float64Array;
  /** Facteur applique chaque jour a la configuration qui l'alimente (0 si aucun capteur). */
  factor: Float64Array;
  calibration: ZoneCalibration;
}

const dailyCache = new Map<string, ZoneDaily>();
const calendarCache = new Map<string, CalendarResponse>();
const CACHE_LIMIT = 32;

function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.set(key, value);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  return value;
}

export function zoneDaily(zone: ZoneSpec, store: Store = getStore()): ZoneDaily {
  const key = zoneKey(zone);
  const cached = dailyCache.get(key);
  if (cached) return cached;

  const { nDays, dayStart, cell, sat, eligible, type, configBits, sourceOfDay, nationalFactors, monthOfDay } = store;
  const inZone = zoneMatcher(zone, store);
  const cellDays = Array.from({ length: N_CONFIG }, () => new Float64Array(nDays));
  const detections = Array.from({ length: N_SAT }, () => new Uint32Array(nDays));
  const eligibleCount = Array.from({ length: N_SAT }, () => new Uint32Array(nDays));
  const staticSources = Array.from({ length: N_SAT }, () => new Uint32Array(nDays));
  const harmonized = new Float64Array(nDays);
  const low = new Float64Array(nDays);
  const high = new Float64Array(nDays);

  for (let d = 0; d < nDays; d++) {
    const end = dayStart[d + 1];
    let row = dayStart[d];
    while (row < end) {
      // Les lignes d'une meme cellule sont contigues : on calcule le masque des satellites qui l'ont vue active.
      const current = cell[row];
      let mask = 0;
      while (row < end && cell[row] === current) {
        if (inZone(row)) {
          const s = sat[row];
          detections[s][d]++;
          if (type[row] !== 0) staticSources[s][d]++;
          if (eligible[row] === 1) {
            eligibleCount[s][d]++;
            mask |= 1 << s;
          }
        }
        row++;
      }
      if (mask !== 0) {
        for (let c = 0; c < N_CONFIG; c++) if (mask & configBits[c]) cellDays[c][d]++;
      }
    }
  }

  const zoneFactors = calibrateZone(zone, cellDays, store);
  const factor = new Float64Array(nDays);
  for (let d = 0; d < nDays; d++) {
    const source = sourceOfDay[d];
    if (source < 0) continue;
    const f = nationalFactors[source][monthOfDay[d] - 1] * zoneFactors.k[source];
    const value = cellDays[source][d];
    factor[d] = f;
    harmonized[d] = f * value;
    low[d] = f * zoneFactors.q10[source] * value;
    high[d] = f * zoneFactors.q90[source] * value;
  }
  return remember(dailyCache, key, {
    key, cellDays, detections, eligible: eligibleCount, staticSources, harmonized, low, high, factor, calibration: zoneFactors.calibration,
  });
}

export interface RangeSummary {
  days: number;
  unobservedDays: number;
  harmonized: number;
  low: number;
  high: number;
  estimatedShare: number;
  terraOnlyShare: number;
  sourceDays: Partial<PerConfig>;
  cellDays: PerConfig;
  detections: PerSatellite;
  eligible: PerSatellite;
  staticSources: PerSatellite;
  complete: boolean;
}

/** Sommes sur un intervalle de jours [first, last] inclus. */
export function summarizeRange(daily: ZoneDaily, first: number, last: number, store: Store = getStore()): RangeSummary {
  const { sourceOfDay } = store;
  let harmonized = 0, low = 0, high = 0, unobserved = 0, fromModis = 0, fromTerra = 0, modisDays = 0, terraDays = 0;
  const sourceDays = new Array<number>(N_CONFIG).fill(0);
  const cellDays = new Array<number>(N_CONFIG).fill(0);
  const det = new Array<number>(N_SAT).fill(0);
  const elig = new Array<number>(N_SAT).fill(0);
  const stat = new Array<number>(N_SAT).fill(0);
  for (let d = first; d <= last; d++) {
    const source = sourceOfDay[d];
    if (source < 0) unobserved++;
    else {
      sourceDays[source]++;
      harmonized += daily.harmonized[d];
      low += daily.low[d];
      high += daily.high[d];
      if (MODIS_CONFIGS.has(source)) {
        fromModis += daily.harmonized[d];
        modisDays++;
      }
      if (source === TERRA_ONLY) {
        fromTerra += daily.harmonized[d];
        terraDays++;
      }
    }
    for (let c = 0; c < N_CONFIG; c++) cellDays[c] += daily.cellDays[c][d];
    for (let s = 0; s < N_SAT; s++) {
      det[s] += daily.detections[s][d];
      elig[s] += daily.eligible[s][d];
      stat[s] += daily.staticSources[s][d];
    }
  }
  const days = last - first + 1;
  const observed = days - unobserved;
  // Sans activite, la part estimee se mesure en jours plutot qu'en valeur.
  const share = (part: number, partDays: number) => (harmonized > 0 ? part / harmonized : observed > 0 ? partDays / observed : 0);
  const perSat = (values: number[]) => Object.fromEntries(SATELLITE_KEYS.map((k, i) => [k, values[i]])) as PerSatellite;
  return {
    days,
    unobservedDays: unobserved,
    harmonized,
    low,
    high,
    estimatedShare: share(fromModis, modisDays),
    terraOnlyShare: share(fromTerra, terraDays),
    sourceDays: Object.fromEntries(CONFIG_KEYS.map((k, i) => [k, sourceDays[i]]).filter(([, v]) => (v as number) > 0)) as Partial<PerConfig>,
    cellDays: Object.fromEntries(CONFIG_KEYS.map((k, i) => [k, cellDays[i]])) as PerConfig,
    detections: perSat(det),
    eligible: perSat(elig),
    staticSources: perSat(stat),
    complete: days > 0 && unobserved / days <= MAX_UNOBSERVED_SHARE,
  };
}

/** Une valeur estimee depuis MODIS dans une zone ou le calage n'a pas pu etre verifie est de fiabilite faible. */
function unverifiedCalibration<T extends { reliability: "high" | "moderate" | "low"; caveats: string[]; status: string }>(
  assessment: T,
  estimatedShare: number,
  calibration: ZoneCalibration,
): T {
  const entry = calibration.configs.TA;
  if (!calibration.local || estimatedShare <= 0.5 || !entry) return assessment;
  if (assessment.status === "incomplete" || assessment.status === "insufficient") return assessment;
  if (!entry.verified) {
    return {
      ...assessment,
      reliability: "low",
      caveats: [...assessment.caveats, "Zone trop peu active pour vérifier localement le calage MODIS : la valeur estimée est indicative."],
    };
  }
  if (entry.annualErrorLoyo !== null && entry.annualErrorLoyo > WEAK_CALIBRATION_ERROR) {
    return {
      ...assessment,
      reliability: "low",
      caveats: [
        ...assessment.caveats,
        `Calage MODIS peu précis dans cette zone : erreur annuelle médiane de ${Math.round(entry.annualErrorLoyo * 100)} % en validation.`,
      ],
    };
  }
  return assessment;
}

function monthKind(sourceDays: Partial<PerConfig>): MonthKind {
  const keys = Object.keys(sourceDays) as ConfigKey[];
  if (keys.length === 0) return "unobserved";
  const modis = keys.some((k) => k === "T" || k === "A" || k === "TA");
  const viirs = keys.some((k) => k === "S" || k === "N");
  if (modis && viirs) return "mixed";
  if (modis) return "estimated";
  return keys.includes("N") ? "relayed" : "observed";
}

export function provenance(store: Store = getStore()): Provenance {
  return {
    source: "NASA FIRMS, archives annuelles par pays (Gabon)",
    products: [
      "MODIS Terra et Aqua, détections de feux actifs à 1 km (champ version : " +
        store.meta.versions.filter((v) => v !== "2").join(", ") +
        ")",
      "VIIRS Suomi-NPP et NOAA-20, détections de feux actifs à 375 m (champ version : 2)",
    ],
    dataFirstDate: dayToIso(store, store.firstDay),
    dataLastDate: dayToIso(store, store.lastDay),
    accessedAt: store.metadata.firms.accessed_last,
    builtAt: store.metadata.built_at,
    method:
      "Cellules-jour actives sur une grille de " +
      String(store.harmonization.grid.step_deg).replace(".", ",") +
      "°, exprimées en équivalent Suomi-NPP ; un seul capteur alimente chaque jour.",
  };
}

interface MonthSpan {
  year: number;
  month: number;
  first: number;
  last: number;
}

function monthSpans(store: Store): MonthSpan[] {
  const spans: MonthSpan[] = [];
  const { yearOfDay, monthOfDay, firstDay, lastDay } = store;
  let d = firstDay;
  // Le calendrier commence au premier jour du mois de la premiere detection.
  while (d > 0 && monthOfDay[d - 1] === monthOfDay[firstDay] && yearOfDay[d - 1] === yearOfDay[firstDay]) d--;
  while (d <= lastDay) {
    const year = yearOfDay[d];
    const month = monthOfDay[d];
    let e = d;
    while (e + 1 <= lastDay && monthOfDay[e + 1] === month) e++;
    spans.push({ year, month, first: d, last: e });
    d = e + 1;
  }
  return spans;
}

export function calendar(zone: ZoneSpec, store: Store = getStore()): CalendarResponse {
  const key = zoneKey(zone);
  const cached = calendarCache.get(key);
  if (cached) return cached;

  const daily = zoneDaily(zone, store);
  const raw = monthSpans(store).map((span) => ({ span, sum: summarizeRange(daily, span.first, span.last, store) }));

  const months: MonthRecord[] = raw.map(({ span, sum }) => {
    // Reference : le meme mois calendaire des autres annees, observation complete uniquement.
    const reference = raw
      .filter((other) => other.span.month === span.month && other.span.year !== span.year && other.sum.complete)
      .map((other) => other.sum.harmonized);
    return {
      year: span.year,
      month: span.month,
      days: sum.days,
      unobservedDays: sum.unobservedDays,
      sourceDays: sum.sourceDays,
      kind: monthKind(sum.sourceDays),
      complete: sum.complete,
      harmonized: sum.harmonized,
      low: sum.low,
      high: sum.high,
      estimatedShare: sum.estimatedShare,
      terraOnlyShare: sum.terraOnlyShare,
      cellDays: sum.cellDays,
      detections: sum.detections,
      eligible: sum.eligible,
      staticSources: sum.staticSources,
      assessment: unverifiedCalibration(
        assess({
          value: sum.harmonized,
          reference,
          complete: sum.complete,
          estimatedShare: sum.estimatedShare,
          terraOnlyShare: sum.terraOnlyShare,
        }),
        sum.estimatedShare,
        daily.calibration,
      ),
    };
  });

  const medians: number[] = [];
  const baselines: MonthBaseline[] = [];
  for (let m = 1; m <= 12; m++) {
    const values = months.filter((r) => r.month === m && r.complete).map((r) => r.harmonized);
    const has = values.length > 0;
    medians.push(has ? quantile(values, 0.5) : 0);
    baselines.push({
      month: m,
      n: values.length,
      median: has ? quantile(values, 0.5) : null,
      q25: has ? quantile(values, 0.25) : null,
      q75: has ? quantile(values, 0.75) : null,
      min: has ? Math.min(...values) : null,
      max: has ? Math.max(...values) : null,
      critical: false,
    });
  }
  const critical = findCriticalMonths(medians, 0.8);
  for (const b of baselines) b.critical = critical.includes(b.month);

  const years: YearRecord[] = [];
  for (const year of [...new Set(months.map((m) => m.year))]) {
    const rows = months.filter((m) => m.year === year);
    const harmonized = rows.reduce((a, r) => a + r.harmonized, 0);
    const estimated = rows.reduce((a, r) => a + r.harmonized * r.estimatedShare, 0);
    const terra = rows.reduce((a, r) => a + r.harmonized * r.terraOnlyShare, 0);
    // Intervalle annuel : la part estimee est encadree par l'etendue des rapports annuels observes en validation.
    // (La dispersion mensuelle, plus large, surestimerait l'incertitude d'un total annuel.)
    const entry = (harmonized > 0 && terra / harmonized > 0.5 ? daily.calibration.configs.T : daily.calibration.configs.TA) ?? null;
    const observedPart = harmonized - estimated;
    years.push({
      year,
      harmonized,
      low: observedPart + estimated * (entry ? entry.annualRatioMin : 1),
      high: observedPart + estimated * (entry ? entry.annualRatioMax : 1),
      monthsWithData: rows.length,
      unobservedDays: rows.reduce((a, r) => a + r.unobservedDays, 0),
      estimatedShare: harmonized > 0 ? estimated / harmonized : 0,
      complete: rows.length === 12 && rows.every((r) => r.complete),
      detections: Object.fromEntries(SATELLITE_KEYS.map((k) => [k, rows.reduce((a, r) => a + r.detections[k], 0)])) as PerSatellite,
    });
    // Les annees ou plus de la moitie de la valeur vient de Terra seul sont exclues de la tendance longue.
    (years[years.length - 1] as YearRecord & { terraShare?: number }).terraShare = harmonized > 0 ? terra / harmonized : 1;
  }
  const completeYears = years.filter((y) => y.complete);
  const longYears = completeYears.filter((y) => ((y as YearRecord & { terraShare?: number }).terraShare ?? 1) <= 0.5);
  const viirsYears = completeYears.filter((y) => y.estimatedShare === 0);
  for (const y of years) delete (y as YearRecord & { terraShare?: number }).terraShare;

  const result: CalendarResponse = {
    zone: zoneInfo(zone, store),
    unit: "cellules-jour actives, équivalent Suomi-NPP",
    months,
    baselines,
    years,
    criticalMonths: critical,
    calibration: daily.calibration,
    trends: {
      full: theilSenMannKendall(longYears.map((y) => y.year), longYears.map((y) => y.harmonized)),
      viirsOnly: theilSenMannKendall(viirsYears.map((y) => y.year), viirsYears.map((y) => y.harmonized)),
    },
    provenance: provenance(store),
  };
  return remember(calendarCache, key, result);
}

/**
 * Compare une fenetre de dates aux memes dates des autres annees.
 * Retourne null si la fenetre depasse 366 jours (la comparaison saisonniere n'a alors plus de sens).
 */
export function assessWindow(zone: ZoneSpec, first: number, last: number, store: Store = getStore()) {
  const length = last - first + 1;
  if (length > 366 || length < 1) return null;
  const daily = zoneDaily(zone, store);
  const current = summarizeRange(daily, first, last, store);
  const startIso = dayToIso(store, first);
  const year = Number(startIso.slice(0, 4));
  const month = Number(startIso.slice(5, 7));
  const dayOfMonth = Number(startIso.slice(8, 10));
  const reference: number[] = [];
  const referenceYears: number[] = [];
  const firstYear = store.yearOfDay[store.firstDay];
  const lastYear = store.yearOfDay[store.lastDay];
  for (let y = firstYear; y <= lastYear; y++) {
    if (y === year) continue;
    // Le 29 fevrier est ramene au 28 les annees non bissextiles.
    const lastDom = new Date(Date.UTC(y, month, 0)).getUTCDate();
    const start = Math.round((Date.UTC(y, month - 1, Math.min(dayOfMonth, lastDom)) - store.epochMs) / 86_400_000);
    const end = start + length - 1;
    if (start < store.firstDay || end > store.lastDay) continue;
    const sum = summarizeRange(daily, start, end, store);
    if (!sum.complete) continue;
    reference.push(sum.harmonized);
    referenceYears.push(y);
  }
  const assessment = unverifiedCalibration(
    assess({
      value: current.harmonized,
      reference,
      complete: current.complete,
      estimatedShare: current.estimatedShare,
      terraOnlyShare: current.terraOnlyShare,
    }),
    current.estimatedShare,
    daily.calibration,
  );
  return { ...assessment, referenceYears };
}
