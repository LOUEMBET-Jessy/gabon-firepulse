/** Libelles, couleurs et definitions partages par toute l'interface. */

import type { AnomalyStatus, Reliability } from "./science/anomaly";
import type { ConfigKey, MonthKind, SatelliteKey } from "./types";

export const SENSOR_COLOR = { modis: "#d95926", snpp: "#3987e5", noaa20: "#199e70" } as const;

export const SATELLITES: Record<SatelliteKey, { name: string; sensor: "MODIS" | "VIIRS"; color: string; shape: "square" | "circle"; pixel: string }> = {
  terra: { name: "Terra", sensor: "MODIS", color: SENSOR_COLOR.modis, shape: "square", pixel: "1 km" },
  aqua: { name: "Aqua", sensor: "MODIS", color: SENSOR_COLOR.modis, shape: "square", pixel: "1 km" },
  snpp: { name: "Suomi-NPP", sensor: "VIIRS", color: SENSOR_COLOR.snpp, shape: "circle", pixel: "375 m" },
  noaa20: { name: "NOAA-20", sensor: "VIIRS", color: SENSOR_COLOR.noaa20, shape: "circle", pixel: "375 m" },
};

/** Satellites de l'observatoire temps reel : NOAA-21 s'ajoute (absent de l'archive 2000-2025). */
export const LIVE_SATELLITE_INFO: Record<"terra" | "aqua" | "snpp" | "noaa20" | "noaa21", { name: string; sensor: "MODIS" | "VIIRS"; color: string; shape: "square" | "circle"; pixel: string }> = {
  ...SATELLITES,
  noaa21: { name: "NOAA-21", sensor: "VIIRS", color: "#b58be8", shape: "circle", pixel: "375 m" },
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

export const TONE_COLOR = { critical: "#ef5350", warning: "#f5b025", info: "#95a9cc", muted: "#8ea0b9", neutral: "#b9c6d8", good: "#2fbf7e" } as const;

export const RELIABILITY: Record<Reliability, { label: string; detail: string }> = {
  high: { label: "Fiabilité élevée", detail: "Valeur observée par VIIRS, référence d'au moins dix années, niveau d'activité suffisant." },
  moderate: { label: "Fiabilité modérée", detail: "Valeur estimée depuis MODIS ou référence de faible niveau : l'écart est indicatif." },
  low: { label: "Fiabilité faible", detail: "Estimation depuis Terra seul, observation incomplète ou activité négligeable." },
};

export const CONF_LABEL = { low: "Faible", nominal: "Nominale", high: "Élevée" } as const;

export const HEAT = ["#12243e", "#3a2a1a", "#5f3a14", "#8a5010", "#b96a0f", "#e88c12", "#f6b547", "#fde2a2"];
export const DIVERGING = ["#2f6fd0", "#4d7fbd", "#46608a", "#22385a", "#7c4a4a", "#b84a48", "#ef5350"];

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
