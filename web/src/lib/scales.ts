/** Echelles de couleur des cartes de chaleur. Fonctions pures, utilisables cote serveur comme cote client. */

import { DIVERGING, HEAT } from "./labels";
import { quantile } from "./science/stats";

/** Six seuils issus des quantiles des valeurs non nulles : sept classes d'effectif comparable. */
export function activityBreaks(values: number[]): number[] {
  const positive = values.filter((v) => v > 0);
  if (positive.length < 7) return [];
  const raw = [1, 2, 3, 4, 5, 6].map((i) => quantile(positive, i / 7));
  const nice = (v: number) => (v >= 100 ? Math.round(v / 10) * 10 : v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
  const out: number[] = [];
  for (const v of raw.map(nice)) if (out.length === 0 || v > out[out.length - 1]) out.push(v);
  return out;
}

export function activityColor(value: number, breaks: number[]): string {
  if (value <= 0) return HEAT[0];
  let cls = 0;
  while (cls < breaks.length && value >= breaks[cls]) cls++;
  // Les classes sont reparties sur les sept teintes, meme si certains seuils ont fusionne.
  return HEAT[1 + Math.round((cls / Math.max(breaks.length, 1)) * 6)];
}

export const DEVIATION_BREAKS = [-3.5, -2, -1, 1, 2, 3.5];

export function deviationColor(z: number | null): string | null {
  if (z === null) return null;
  let cls = 0;
  while (cls < DEVIATION_BREAKS.length && z >= DEVIATION_BREAKS[cls]) cls++;
  return DIVERGING[cls];
}
