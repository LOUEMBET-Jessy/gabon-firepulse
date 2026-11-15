/**
 * Detection des periodes inhabituelles.
 *
 * Methode : pour un mois calendaire donne, la valeur observee est comparee aux
 * valeurs du meme mois des autres annees (l'annee evaluee est exclue de sa
 * propre reference). L'ecart est mesure par un score robuste :
 *     score = (valeur - mediane) / (1,4826 x MAD)
 * Une anomalie statistique signale un ecart a l'historique. Ce n'est ni un
 * incendie confirme ni une prediction.
 */

import { IQR_TO_SIGMA, MAD_TO_SIGMA, mad, mean, median, percentileRank, quantile, standardDeviation } from "./stats";

export const ANOMALY_SETTINGS = {
  /** Nombre minimal d'annees de reference pour evaluer un mois. */
  minReferenceYears: 10,
  /** En dessous de ce niveau (valeur et mediane), l'activite est trop faible pour etre qualifiee. */
  minActivity: 5,
  /** Seuils sur le score robuste. 3,5 est le seuil d'Iglewicz et Hoaglin (1993). */
  thresholdNotable: 2,
  thresholdStrong: 3.5,
} as const;

export type AnomalyStatus =
  | "strong_high" // tres superieure a la reference
  | "high" // superieure a la reference
  | "normal"
  | "low" // inferieure a la reference
  | "low_activity" // activite trop faible pour etre qualifiee
  | "insufficient" // pas assez d'annees de reference
  | "incomplete"; // observation incomplete sur la periode

export type Reliability = "high" | "moderate" | "low";

export interface AnomalyInput {
  value: number;
  /** Valeurs de reference (memes mois ou memes dates des autres annees, observation complete). */
  reference: readonly number[];
  /** La periode evaluee est-elle completement observee ? */
  complete: boolean;
  /** Part de la valeur issue d'une estimation MODIS calee (0 a 1). */
  estimatedShare: number;
  /** Part issue de Terra seul, la configuration la moins fiable (0 a 1). */
  terraOnlyShare: number;
}

export interface AnomalyAssessment {
  status: AnomalyStatus;
  value: number;
  referenceCount: number;
  median: number | null;
  q25: number | null;
  q75: number | null;
  referenceMin: number | null;
  referenceMax: number | null;
  /** Ecart absolu median des valeurs de reference. */
  mad: number | null;
  /** Echelle utilisee au denominateur du score, et son origine. */
  scale: number | null;
  scaleSource: "mad" | "iqr" | "none";
  /** Score robuste. Null si l'echelle est nulle ou la reference insuffisante. */
  robustZ: number | null;
  /** Score classique (moyenne et ecart-type), donne a titre de comparaison. */
  classicZ: number | null;
  /** Rang centile de la valeur dans la reference (0 a 100). */
  percentile: number | null;
  /** Rapport valeur / mediane. Null si la mediane est nulle. */
  ratioToMedian: number | null;
  reliability: Reliability;
  /** Raisons qui limitent l'interpretation, en clair. */
  caveats: string[];
}

export function assess(input: AnomalyInput): AnomalyAssessment {
  const { value, reference, complete, estimatedShare, terraOnlyShare } = input;
  const s = ANOMALY_SETTINGS;
  const n = reference.length;
  const caveats: string[] = [];

  const base: AnomalyAssessment = {
    status: "normal",
    value,
    referenceCount: n,
    median: n ? median(reference) : null,
    q25: n ? quantile(reference, 0.25) : null,
    q75: n ? quantile(reference, 0.75) : null,
    referenceMin: n ? Math.min(...reference) : null,
    referenceMax: n ? Math.max(...reference) : null,
    mad: n ? mad(reference) : null,
    scale: null,
    scaleSource: "none",
    robustZ: null,
    classicZ: null,
    percentile: n ? percentileRank(reference, value) : null,
    ratioToMedian: null,
    reliability: "high",
    caveats,
  };

  if (!complete) {
    caveats.push("Observation incomplète sur la période : la valeur sous-estime l'activité et n'est pas évaluée.");
    return { ...base, status: "incomplete", reliability: "low" };
  }
  if (n < s.minReferenceYears) {
    caveats.push(`Référence de ${n} année(s), inférieure au minimum de ${s.minReferenceYears} : données insuffisantes.`);
    return { ...base, status: "insufficient", reliability: "low" };
  }

  const med = base.median as number;
  base.ratioToMedian = med > 0 ? value / med : null;
  const sd = standardDeviation(reference);
  base.classicZ = sd > 0 ? (value - mean(reference)) / sd : null;

  if (value < s.minActivity && med < s.minActivity) {
    caveats.push(`Activité inférieure à ${s.minActivity} cellules-jour : trop faible pour être qualifiée.`);
    return { ...base, status: "low_activity", reliability: "low" };
  }

  const madScale = (base.mad as number) * MAD_TO_SIGMA;
  const iqrScale = ((base.q75 as number) - (base.q25 as number)) * IQR_TO_SIGMA;
  if (madScale > 0) {
    base.scale = madScale;
    base.scaleSource = "mad";
  } else if (iqrScale > 0) {
    base.scale = iqrScale;
    base.scaleSource = "iqr";
    caveats.push("Écart absolu médian nul : l'échelle repose sur l'écart interquartile.");
  }

  let status: AnomalyStatus = "normal";
  if (base.scale !== null) {
    const z = (value - med) / base.scale;
    base.robustZ = z;
    if (z >= s.thresholdStrong) status = "strong_high";
    else if (z >= s.thresholdNotable) status = "high";
    else if (z <= -s.thresholdNotable) status = "low";
  } else {
    // Reference sans dispersion (souvent une serie de zeros) : seul un depassement du maximum historique est signale.
    caveats.push("Référence sans dispersion : aucun score ne peut être calculé.");
    if (value > (base.referenceMax as number)) status = "high";
  }

  let reliability: Reliability = "high";
  if (terraOnlyShare > 0.5) {
    reliability = "low";
    caveats.push("Valeur estimée à partir de Terra seul, configuration la moins bien calée.");
  } else if (estimatedShare > 0.5) {
    reliability = "moderate";
    caveats.push("Valeur estimée à partir de MODIS calé sur VIIRS, avec une incertitude de calage.");
  }
  if (med < 20) {
    reliability = reliability === "high" ? "moderate" : "low";
    caveats.push("Médiane de référence inférieure à 20 cellules-jour : les écarts relatifs sont instables.");
  }
  if (status === "low") {
    caveats.push("Une activité détectée faible peut venir de la couverture nuageuse autant que d'une activité réelle moindre.");
  }
  return { ...base, status, reliability };
}

/** Plus petit ensemble de mois calendaires qui concentre au moins `share` de l'activite mediane annuelle. */
export function criticalMonths(monthlyMedians: readonly number[], share = 0.8): number[] {
  const total = monthlyMedians.reduce((a, b) => a + b, 0);
  if (total <= 0) return [];
  const order = monthlyMedians.map((value, index) => ({ value, month: index + 1 })).sort((a, b) => b.value - a.value);
  const out: number[] = [];
  let acc = 0;
  for (const item of order) {
    if (acc >= share * total) break;
    out.push(item.month);
    acc += item.value;
  }
  return out.sort((a, b) => a - b);
}
