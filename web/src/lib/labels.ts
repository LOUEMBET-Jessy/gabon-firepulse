/** Libelles, couleurs et definitions partages par toute l'interface. */

import { SATELLITE_HEX } from "./palette";
import type { AnomalyStatus, Reliability } from "./science/anomaly";
import type { ConfigKey, MonthKind, SatelliteKey } from "./types";

/** Couleurs des satellites : identiques sur la carte, dans les legendes et les graphiques. */
export const SENSOR_COLOR = { modis: SATELLITE_HEX.modis, snpp: SATELLITE_HEX.snpp, noaa20: SATELLITE_HEX.noaa20, noaa21: SATELLITE_HEX.noaa21 } as const;

export const SATELLITES: Record<SatelliteKey, { name: string; sensor: "MODIS" | "VIIRS"; color: string; shape: "square" | "circle"; pixel: string }> = {
  terra: { name: "Terra", sensor: "MODIS", color: SENSOR_COLOR.modis, shape: "square", pixel: "1 km" },
  aqua: { name: "Aqua", sensor: "MODIS", color: SENSOR_COLOR.modis, shape: "square", pixel: "1 km" },
  snpp: { name: "Suomi-NPP", sensor: "VIIRS", color: SENSOR_COLOR.snpp, shape: "circle", pixel: "375 m" },
  noaa20: { name: "NOAA-20", sensor: "VIIRS", color: SENSOR_COLOR.noaa20, shape: "circle", pixel: "375 m" },
};

/** Satellites de l'observatoire temps reel : NOAA-21 s'ajoute (absent de l'archive 2000-2025). */
export const LIVE_SATELLITE_INFO: Record<"terra" | "aqua" | "snpp" | "noaa20" | "noaa21", { name: string; sensor: "MODIS" | "VIIRS"; color: string; shape: "square" | "circle"; pixel: string }> = {
  ...SATELLITES,
  noaa21: { name: "NOAA-21", sensor: "VIIRS", color: SENSOR_COLOR.noaa21, shape: "circle", pixel: "375 m" },
};

export const CONFIG_LABEL: Record<ConfigKey, string> = {
  T: "MODIS Terra seul",
  A: "MODIS Aqua seul",
  TA: "MODIS Terra + Aqua",
  S: "VIIRS Suomi-NPP",
  N: "VIIRS NOAA-20",
};

export const KIND_LABEL: Record<MonthKind, { label: string; detail: string }> = {
  observed: { label: "Observé", detail: "Valeur mesurée par VIIRS Suomi-NPP, le capteur de référence." },
  relayed: { label: "Observé, relais NOAA-20", detail: "VIIRS Suomi-NPP interrompu une partie de la période : les jours manquants viennent de VIIRS NOAA-20." },
  estimated: { label: "Estimé depuis MODIS", detail: "Avant VIIRS : valeur MODIS convertie en équivalent VIIRS par le facteur de calage." },
  mixed: { label: "Mixte", detail: "Une partie des jours vient de VIIRS, l'autre de MODIS calé." },
  unobserved: { label: "Non observé", detail: "Aucun capteur en service." },
};

export const STATUS: Record<AnomalyStatus, { label: string; short: string; tone: "critical" | "warning" | "info" | "muted" | "neutral" }> = {
  strong_high: { label: "Activité détectée très supérieure à la référence", short: "Très supérieure", tone: "critical" },
  high: { label: "Activité détectée supérieure à la référence", short: "Supérieure", tone: "warning" },
  normal: { label: "Activité détectée dans la plage habituelle", short: "Habituelle", tone: "neutral" },
  low: { label: "Activité détectée inférieure à la référence", short: "Inférieure", tone: "info" },
  low_activity: { label: "Activité trop faible pour être qualifiée", short: "Trop faible", tone: "muted" },
  insufficient: { label: "Données insuffisantes", short: "Insuffisant", tone: "muted" },
  incomplete: { label: "Observation incomplète", short: "Incomplet", tone: "muted" },
};

/** Etats : references aux jetons CSS (suivent le theme). « Inhabituelle » en feu, « Habituelle » en feuille. */
export const TONE_COLOR = {
  critical: "var(--color-critical)",
  warning: "var(--color-fire-4)",
  info: "var(--color-info)",
  muted: "var(--color-ink-3)",
  neutral: "var(--color-leaf)",
  good: "var(--color-good)",
} as const;

export const RELIABILITY: Record<Reliability, { label: string; detail: string }> = {
  high: { label: "Fiabilité élevée", detail: "Valeur observée par VIIRS, référence d'au moins dix années, niveau d'activité suffisant." },
  moderate: { label: "Fiabilité modérée", detail: "Valeur estimée depuis MODIS ou référence de faible niveau : l'écart est indicatif." },
  low: { label: "Fiabilité faible", detail: "Estimation depuis Terra seul, observation incomplète ou activité négligeable." },
};

export const CONF_LABEL = { low: "Faible", nominal: "Nominale", high: "Élevée" } as const;

/** Echelles des calendriers et graphiques : jetons CSS (clair : du pale au brun ; sombre : du brun au pale). */
export const HEAT = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `var(--color-heat-${i})`);
export const DIVERGING = ["n3", "n2", "n1", "0", "p1", "p2", "p3"].map((k) => `var(--color-div-${k})`);

export const UNIT = "cellules-jour actives, équivalent Suomi-NPP";
export const UNIT_SHORT = "cellules-jour";

export const DEFINITIONS = {
  index:
    "Nombre de cellules de 0,05° (environ 5,5 km) dans lesquelles au moins une détection retenue est tombée un jour donné, cumulé sur la période, puis converti en équivalent du capteur VIIRS Suomi-NPP. Une cellule compte une fois par jour, quel que soit le nombre de pixels signalés.",
  detection:
    "Centre d'un pixel signalé par l'algorithme comme contenant une anomalie thermique. Ce n'est ni la position exacte d'un feu, ni un incendie confirmé, ni une surface brûlée.",
  eligible:
    "Détection retenue dans l'indice : classée « feu de végétation présumé » par le produit et de confiance non faible. Les sources statiques, par exemple des torchères ou des installations industrielles, sont écartées.",
  anomaly:
    "Écart entre l'activité détectée d'un mois et la médiane du même mois les autres années, rapporté à la dispersion habituelle. C'est un signal d'analyse, ni une preuve ni une prédiction.",
  critical: "Mois calendaires qui concentrent ensemble 80 % de l'activité médiane annuelle de la zone.",
} as const;
