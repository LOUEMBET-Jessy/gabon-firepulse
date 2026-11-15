/** Contrat de donnees entre l'API et l'interface. */

import type { AnomalyAssessment } from "./science/anomaly";
import type { TrendResult } from "./science/stats";

export type SatelliteKey = "terra" | "aqua" | "snpp" | "noaa20";
export type ConfigKey = "T" | "A" | "TA" | "S" | "N";
export type SensorFamily = "MODIS" | "VIIRS";

export const SATELLITE_KEYS: SatelliteKey[] = ["terra", "aqua", "snpp", "noaa20"];
export const CONFIG_KEYS: ConfigKey[] = ["T", "A", "TA", "S", "N"];

export type PerSatellite<T = number> = Record<SatelliteKey, T>;
export type PerConfig<T = number> = Record<ConfigKey, T>;

/**
 * Zone d'analyse : pays entier, province, departement, localite (disque de rayon fixe autour du lieu,
 * identifiant GeoNames), ou rectangle [ouest, sud, est, nord].
 */
export type ZoneSpec =
  | { kind: "country" }
  | { kind: "province"; index: number }
  | { kind: "department"; index: number }
  | { kind: "place"; id: number }
  | { kind: "bbox"; bbox: [number, number, number, number] };

/** Origine de la valeur harmonisee d'une periode. */
export type MonthKind =
  | "observed" // VIIRS Suomi-NPP uniquement
  | "relayed" // VIIRS, dont des jours relayes par NOAA-20
  | "estimated" // MODIS cale sur VIIRS
  | "mixed" // jours VIIRS et jours MODIS
  | "unobserved"; // aucun capteur en service

export interface MonthRecord {
  year: number;
  month: number;
  days: number;
  unobservedDays: number;
  /** Nombre de jours alimentes par chaque configuration. */
  sourceDays: Partial<PerConfig>;
  kind: MonthKind;
  /** Faux si plus de 10 % des jours ne sont observes par aucun capteur. */
  complete: boolean;
  /** Indice harmonise : cellules-jour actives, equivalent Suomi-NPP. */
  harmonized: number;
  /** Bornes 10 % et 90 % issues des ecarts de validation du calage. */
  low: number;
  high: number;
  estimatedShare: number;
  terraOnlyShare: number;
  /** Cellules-jour actives brutes par configuration (sans calage). */
  cellDays: PerConfig;
  /** Detections natives par satellite (tous types et niveaux de confiance). */
  detections: PerSatellite;
  /** Detections retenues dans l'indice (feu de vegetation presume, confiance non faible). */
  eligible: PerSatellite;
  /** Detections de sources statiques (type different de 0). */
  staticSources: PerSatellite;
  assessment: AnomalyAssessment;
}

export interface MonthBaseline {
  month: number;
  n: number;
  median: number | null;
  q25: number | null;
  q75: number | null;
  min: number | null;
  max: number | null;
  /** Ce mois fait-il partie de la saison qui concentre 80 % de l'activite mediane ? */
  critical: boolean;
}

export interface YearRecord {
  year: number;
  harmonized: number;
  low: number;
  high: number;
  monthsWithData: number;
  unobservedDays: number;
  estimatedShare: number;
  /** Annee entiere et completement observee. */
  complete: boolean;
  detections: PerSatellite;
}

/** Ajustement du calage a la zone, pour une configuration source. */
export interface ZoneCalibrationEntry {
  /** Correction multiplicative appliquee aux facteurs nationaux (1 = facteur national inchange). */
  k: number;
  /** Cellules-jour de reference (Suomi-NPP) de la zone sur les jours communs. */
  referenceCellDays: number;
  /** Erreur annuelle mediane en retirant une annee a la fois. Null si trop peu d'annees mesurables. */
  annualErrorLoyo: number | null;
  yearsScored: number;
  monthsScored: number;
  ratioQ10: number;
  ratioQ90: number;
  /** Plus petit et plus grand rapport annuel reference / prediction observes sur les annees communes. */
  annualRatioMin: number;
  annualRatioMax: number;
  /** Vrai si la zone a assez de mois mesurables pour verifier le calage localement. */
  verified: boolean;
}

export interface ZoneCalibration {
  /** Faux pour le pays entier : les facteurs nationaux s'appliquent tels quels. */
  local: boolean;
  /** Poids, en cellules-jour, donne au facteur national dans l'ajustement. */
  priorWeight: number;
  configs: PerConfig<ZoneCalibrationEntry | null>;
}

export interface CalendarResponse {
  zone: ZoneInfo;
  unit: string;
  months: MonthRecord[];
  baselines: MonthBaseline[];
  years: YearRecord[];
  criticalMonths: number[];
  calibration: ZoneCalibration;
  trends: {
    /** Annees completes de l'ere Terra + Aqua puis VIIRS. */
    full: TrendResult | null;
    /** Annees observees par VIIRS uniquement. */
    viirsOnly: TrendResult | null;
  };
  provenance: Provenance;
}

export interface DailyResponse {
  zone: ZoneInfo;
  firstDate: string;
  /** Une valeur par jour depuis firstDate. */
  harmonized: number[];
  /** Indice de configuration par jour (dans CONFIG_KEYS), -1 si aucun capteur. */
  source: number[];
  provenance: Provenance;
}

export interface ZoneInfo {
  key: string;
  label: string;
  kind: ZoneSpec["kind"];
  areaKm2: number | null;
  bbox: [number, number, number, number] | null;
}

export interface Provenance {
  source: string;
  products: string[];
  dataFirstDate: string;
  dataLastDate: string;
  accessedAt: string;
  builtAt: string;
  method: string;
}

export interface DistributionSummary {
  n: number;
  q10: number | null;
  q25: number | null;
  median: number | null;
  q75: number | null;
  q90: number | null;
  max: number | null;
}

/** Ce que chaque configuration de capteurs a mesure sur la periode, sur ses seuls jours d'observation. */
export interface SensorComparisonEntry {
  config: ConfigKey;
  /** Jours de la periode ou tous les satellites de la configuration etaient en service. */
  daysObserved: number;
  /** Cellules-jour actives brutes, sans calage. */
  cellDays: number;
  /** Les memes cellules-jour converties en equivalent Suomi-NPP (facteurs nationaux x correction de zone). */
  equivalent: number;
  /** Facteur moyen applique (equivalent / cellDays). Null sans activite. */
  factor: number | null;
}

export interface OverviewResponse {
  zone: ZoneInfo;
  from: string;
  to: string;
  days: number;
  unobservedDays: number;
  harmonized: number;
  low: number;
  high: number;
  estimatedShare: number;
  /** Comparaison aux memes dates des autres annees. Null si la periode depasse un an. */
  window: (AnomalyAssessment & { referenceYears: number[] }) | null;
  detections: PerSatellite;
  eligible: PerSatellite;
  staticSources: PerSatellite;
  lowConfidence: PerSatellite;
  night: PerSatellite;
  frp: PerSatellite<DistributionSummary>;
  confidence: PerSatellite<{ low: number; nominal: number; high: number }>;
  gaps: GapRecord[];
  latest: DetectionRow[];
  activeCells: number;
  /** Comparaison des capteurs sur la periode : une entree par configuration. */
  sensors: SensorComparisonEntry[];
  provenance: Provenance;
}

export interface RegionRecord {
  index: number;
  name: string;
  iso: string;
  areaKm2: number;
  harmonized: number;
  /** Cellules-jour harmonisees pour 1 000 km2. */
  density: number;
  share: number;
  detections: PerSatellite;
  window: AnomalyAssessment | null;
}

export interface RegionsResponse {
  from: string;
  to: string;
  regions: RegionRecord[];
  /** Detections situees hors des polygones de provinces (ecart entre limites FIRMS et geoBoundaries). */
  outsideProvinces: PerSatellite;
  provenance: Provenance;
}

export interface DetectionRow {
  id: string;
  lon: number;
  lat: number;
  date: string;
  time: string;
  satellite: SatelliteKey;
  confidenceClass: "low" | "nominal" | "high";
  confidenceNative: string;
  frp: number | null;
  night: boolean;
  type: number | null;
}

export interface DetectionDetail extends DetectionRow {
  sensor: SensorFamily;
  platform: string;
  product: string;
  version: string;
  acqDatetimeUtc: string;
  brightness: number | null;
  brightnessLabel: string;
  brightness2: number | null;
  brightness2Label: string;
  scan: number | null;
  track: number | null;
  typeLabel: string;
  eligible: boolean;
  eligibilityReason: string;
  cell: { index: number; west: number; south: number; east: number; north: number };
  province: string | null;
  source: { file: string; line: number; url: string; sha256: string; accessedAt: string; recordId: string };
  ingestedAt: string;
}

export interface DetectionsResponse {
  total: number;
  cap: number;
  truncated: boolean;
  bySatellite: PerSatellite;
  /** Colonnes paralleles. Null si le total depasse le plafond d'affichage. */
  points: {
    /** Dimensions du pixel au sol, en km (balayage, trace). */
    scan?: (number | null)[];
    track?: (number | null)[];
    index: number[];
    lon: number[];
    lat: number[];
    day: number[];
    sat: number[];
    conf: number[];
    type: number[];
    night: number[];
    frp: (number | null)[];
  } | null;
  epoch: string;
  provenance: Provenance;
}

export interface GridCell {
  cell: number;
  lon: number;
  lat: number;
  /** Jours actifs harmonises (equivalent Suomi-NPP). */
  harmonized: number;
  modis: number;
  snpp: number;
  noaa20: number;
}

export interface GridResponse {
  step: number;
  cells: GridCell[];
  maxHarmonized: number;
  provenance: Provenance;
}

export interface GapRecord {
  satellite: SatelliteKey;
  start: string;
  end: string;
  days: number;
  expected_detections: number;
  witness: SatelliteKey | null;
  witness_detections: number | null;
}

export interface CalibrationSummary {
  model: "global" | "season" | "month";
  factors_by_month: number[];
  overlap_first_year: number;
  overlap_last_year: number;
  overlap_days: number;
  overlap_months: number;
  validation: {
    months_scored: number;
    monthly_median_abs_pct_error: number;
    monthly_mean_abs_pct_error: number;
    monthly_bias_pct: number;
    monthly_ratio_q10: number;
    monthly_ratio_q90: number;
    monthly_correlation: number;
    annual_mean_abs_pct_error: number;
    annual_max_abs_pct_error: number;
    annual_ratio_min: number;
    annual_ratio_max: number;
    annual: { year: number; predicted: number; reference: number }[];
  };
  candidates: Record<string, { monthly_median_abs_pct_error: number; annual_mean_abs_pct_error: number; monthly_correlation: number }>;
}

export interface SatelliteMeta {
  code: number;
  key: SatelliteKey;
  name: string;
  sensor: SensorFamily;
  dataset: string;
  file_value: string;
  first_date: string;
  last_date: string;
  detections: number;
  eligible: number;
  by_type: Record<string, number>;
  by_confidence_class: { low: number; nominal: number; high: number };
  night: number;
}

export interface SourceFile {
  file: string;
  dataset: string;
  year: number;
  url: string;
  sha256: string;
  bytes: number;
  accessed_at: string;
  rows_read: number;
  rows_kept: number;
  rows_rejected: number;
}

export interface PlaceInfo {
  id: number;
  name: string;
  lat: number;
  lon: number;
  kind: "capital" | "admin" | "town" | "village";
  pop: number;
  province: number;
  department: number;
}

export interface MetadataResponse {
  /** Pays de l'archive, son nom affiche et l'adresse de ses limites (provinces, departements, localites). */
  countryCode: "GAB" | "FRA";
  /**
   * Annee en cours, ajoutee par l'API FIRMS : debut, date a partir de laquelle les donnees sont provisoires (NRT),
   * et fiabilite mesuree du type de source deduit. Null si l'archive s'arrete aux fichiers annuels.
   */
  recent: { start: string; provisionalFrom: string | null; vegetationPrecision: number; staticRecall: number; testYear: number } | null;
  countryName: string;
  geoUrl: string;
  /** Nom des unites de niveau 1 : provinces au Gabon, regions en France. */
  level1: { one: string; many: string };
  dataKind: "real" | "simulated";
  dataKindLabel: string;
  builtAt: string;
  country: string;
  coverage: { firstDate: string; lastDate: string };
  rows: { read: number; kept: number; rejected: number; eligible: number; outside_provinces: number };
  satellites: SatelliteMeta[];
  provinces: { index: number; iso: string; name: string; areaKm2: number }[];
  countryAreaKm2: number;
  departments: { index: number; name: string; province: number; label: [number, number]; areaKm2: number }[];
  /** Villes et chefs-lieux (lieux habites avec population connue ou fonction administrative). */
  towns: PlaceInfo[];
  /** Rayon de la zone d'analyse autour d'une localite. */
  placeRadiusKm: number;
  geography: { sources: Record<string, Record<string, string | number | null | undefined>>; outsideDepartments: number };
  versions: string[];
  sources: SourceFile[];
  missingYears: { dataset: string; year: number; url: string; http_status: number }[];
  accessed: { first: string; last: string };
  boundaries: { level: string; source: string; license: string; license_detail: string | null; year_represented: string; download_url: string; accessed_at: string }[];
  quality: { rejects: { file: string; line: number; reason: string }[]; warnings: { file: string; field: string; count: number; action: string }[] };
  harmonization: {
    unit: string;
    grid: { lon0: number; lat0: number; step_deg: number; ncols: number; nrows: number };
    eligibility: { type: number; modis_min_confidence_pct: number; viirs_classes: string[] };
    configs: PerConfig<SatelliteKey[]>;
    referenceConfig: ConfigKey;
    relayPriority: ConfigKey[];
    gapRules: Record<string, unknown>;
    gaps: GapRecord[];
    relaySegments: { config: ConfigKey | null; start: string; end: string; start_day: number; end_day: number }[];
    calibration: Partial<PerConfig<CalibrationSummary>>;
    settings: { season_months: number[]; cv_min_reference: number; parsimony_tolerance: number; method: string };
    diagnostics: {
      unit_comparison: Record<string, { factor_global: number; monthly_median_abs_pct_error: number; annual_mean_abs_pct_error: number }>;
      yearly_ratio: { year: number; TA: number | null; A: number | null; T: number | null; N: number | null }[];
      province_transfer: { province: string; reference_cell_days: number; predicted_cell_days: number; ratio_reference_over_predicted: number | null; annual_median_abs_pct_error: number | null; years_scored: number }[];
    };
  };
  anomalySettings: { minReferenceYears: number; minActivity: number; thresholdNotable: number; thresholdStrong: number };
}

/* ------------------------------------------------------------------ Observatoire en temps quasi reel (NASA FIRMS NRT) */

export type LiveSatellite = "terra" | "aqua" | "snpp" | "noaa20" | "noaa21";
export type LiveTerritory = "GAB" | "FRA";

export interface LiveDetection {
  id: string;
  lat: number;
  lon: number;
  satellite: LiveSatellite;
  sensor: "MODIS" | "VIIRS";
  acquired: string;
  confidenceNative: string;
  confidence: "low" | "nominal" | "high";
  frp: number | null;
  daynight: "D" | "N";
  version: string;
  /** Dimensions du pixel au sol, en km. */
  scan: number | null;
  track: number | null;
  territory: LiveTerritory;
  level1: string | null;
  level2: string | null;
  feed: "modis" | "snpp" | "noaa20" | "noaa21";
}

export interface LiveFeedStatus {
  feed: LiveDetection["feed"];
  label: string;
  sensor: "MODIS" | "VIIRS";
  product: string;
  territory: LiveTerritory;
  url: string;
  status: "ok" | "empty" | "stale" | "error" | "pending";
  checkedAt: string | null;
  fetchedAt: string | null;
  publishedAt: string | null;
  latestAcquisition: string | null;
  rows: number;
  error: string | null;
}

export interface LiveResponse {
  generatedAt: string;
  mode: "files" | "api";
  maxDays: number;
  since: string;
  territories: LiveTerritory[];
  days: number;
  feeds: LiveFeedStatus[];
  detections: LiveDetection[];
  counts: { total: number; byTerritory: Record<string, number>; bySatellite: Record<string, number>; byLevel1: Record<string, number>; byLevel2: Record<string, number> };
  notice: string;
}
