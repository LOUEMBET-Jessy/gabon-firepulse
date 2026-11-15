/**
 * Statistiques robustes utilisees par l'analyse historique.
 * Fonctions pures, sans dependance, testees dans stats.test.ts.
 */

export function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Quantile par interpolation lineaire (definition 7 de Hyndman et Fan, celle de NumPy). */
export function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return NaN;
  const s = sorted(values);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function median(values: readonly number[]): number {
  return quantile(values, 0.5);
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Ecart-type d'echantillon (n - 1). */
export function standardDeviation(values: readonly number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / (values.length - 1));
}

/** Ecart absolu median. */
export function mad(values: readonly number[]): number {
  if (values.length === 0) return NaN;
  const m = median(values);
  return median(values.map((v) => Math.abs(v - m)));
}

/** Facteur qui rend le MAD comparable a un ecart-type sous loi normale. */
export const MAD_TO_SIGMA = 1.4826;
/** Facteur equivalent pour l'ecart interquartile. */
export const IQR_TO_SIGMA = 1 / 1.349;

/** Part des valeurs de reference inferieures ou egales a la valeur observee (0 a 100). */
export function percentileRank(reference: readonly number[], value: number): number {
  if (reference.length === 0) return NaN;
  const below = reference.filter((v) => v < value).length;
  const equal = reference.filter((v) => v === value).length;
  return ((below + 0.5 * equal) / reference.length) * 100;
}

export interface TrendResult {
  n: number;
  firstYear: number;
  lastYear: number;
  /** Pente de Theil-Sen, en unites par an. */
  slope: number;
  intercept: number;
  /** Pente rapportee a la mediane de la serie, en % par an. */
  slopePctOfMedian: number;
  /** Tau de Kendall. */
  tau: number;
  /** Valeur p bilaterale du test de Mann-Kendall (approximation normale, correction des ex aequo). */
  pValue: number;
}

function normalCdf(z: number): number {
  // Approximation d'Abramowitz et Stegun 26.2.17, erreur absolue < 7.5e-8.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/**
 * Tendance monotone : pente de Theil-Sen et test de Mann-Kendall.
 * Robuste aux valeurs extremes, sans hypothese de normalite.
 */
export function theilSenMannKendall(years: readonly number[], values: readonly number[]): TrendResult | null {
  const n = years.length;
  if (n < 8 || n !== values.length) return null;
  const slopes: number[] = [];
  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      slopes.push((values[j] - values[i]) / (years[j] - years[i]));
      s += Math.sign(values[j] - values[i]);
    }
  }
  const slope = median(slopes);
  const intercept = median(values.map((v, i) => v - slope * years[i]));
  const ties = new Map<number, number>();
  for (const v of values) ties.set(v, (ties.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of ties.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  const variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  const z = variance > 0 ? (s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0) : 0;
  const med = median(values);
  return {
    n,
    firstYear: years[0],
    lastYear: years[n - 1],
    slope,
    intercept,
    slopePctOfMedian: med > 0 ? (slope / med) * 100 : NaN,
    tau: s / ((n * (n - 1)) / 2),
    pValue: 2 * (1 - normalCdf(Math.abs(z))),
  };
}
