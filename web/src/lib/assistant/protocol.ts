/**
 * Protocole entre l'interface et l'assistant Hot-Spot AI.
 * Module partage (navigateur et serveur) : aucune dependance serveur ici.
 */

import type { SatelliteKey, ZoneSpec } from "../types";

export const PAGES = {
  home: { path: "/", label: "Accueil" },
  dashboard: { path: "/dashboard", label: "Vue d'ensemble" },
  map: { path: "/map", label: "Carte des détections" },
  calendar: { path: "/calendar", label: "Calendrier d'activité" },
  trends: { path: "/trends", label: "Analyses et tendances" },
  compare: { path: "/compare", label: "Comparaison MODIS et VIIRS" },
  anomalies: { path: "/anomalies", label: "Périodes inhabituelles" },
  reports: { path: "/reports", label: "Rapports et exports" },
  methodology: { path: "/methodology", label: "Méthode et données" },
} as const;

export type PageKey = keyof typeof PAGES;
export const PAGE_KEYS = Object.keys(PAGES) as PageKey[];

export function pageFromPath(path: string): PageKey {
  const found = PAGE_KEYS.find((k) => PAGES[k].path === path);
  return found ?? "home";
}

/** Elements de l'interface que l'assistant et la visite guidee peuvent mettre en evidence (attribut data-tour). */
export const TARGETS = {
  "zone-picker": "le sélecteur de zone, en haut de l'écran",
  "period-picker": "le sélecteur de période, en haut de l'écran",
  "data-badge": "l'indicateur de nature des données, en haut à droite",
  "main-nav": "la navigation principale",
  "map-canvas": "la carte",
  "map-filters": "le panneau de filtres de la carte",
  "map-legend": "la légende des capteurs sur la carte",
  "calendar-grid": "le calendrier par année et par mois",
  "calendar-granularity": "le choix du pas de temps du calendrier",
  "trend-chart": "le graphique des totaux annuels",
  "compare-chart": "le graphique de comparaison des capteurs",
  "compare-period": "le tableau des capteurs sur la période",
  "anomaly-list": "la liste des mois signalés",
  "anomaly-detail": "le détail du calcul d'un mois signalé",
  "kpi-index": "l'indice harmonisé d'activité",
  "export-files": "la liste des fichiers à télécharger",
  "assistant-launcher": "le bouton de l'assistant",
} as const;

export type TargetKey = keyof typeof TARGETS;

export type MapModeValue = "points" | "grid";
export type ConfidenceKey = "low" | "nominal" | "high";

export type AssistantAction =
  | { type: "navigate"; page: PageKey }
  | { type: "set_zone"; zone: ZoneSpec; label: string }
  | { type: "set_period"; from: string; to: string }
  | {
      type: "set_map_view";
      mode?: MapModeValue;
      sensors?: SatelliteKey[];
      confidence?: ConfidenceKey[];
      sourceType?: "veg" | "static" | "all";
      dayNight?: "day" | "night" | "all";
      basemap?: boolean;
    }
  | { type: "set_calendar_view"; granularity?: "month" | "week" | "day" | "year"; heatMode?: "activity" | "deviation"; year?: number; month?: number }
  | { type: "set_compare_unit"; unit: "detections" | "celldays" | "calibrated" }
  | { type: "open_unusual_periods"; direction?: "all" | "high" | "low"; year?: number; month?: number }
  | { type: "highlight"; target: TargetKey; caption: string }
  | { type: "start_tour" }
  | { type: "export"; kind: "detections" | "monthly" | "anomalies" | "report_pdf"; format: "csv" | "geojson" | "pdf"; label: string };

/** Les actions qui exigent une confirmation explicite de l'utilisateur avant execution. */
export function needsConfirmation(action: AssistantAction): boolean {
  return action.type === "export";
}

/** Etat de l'application transmis a l'assistant a chaque message. */
export interface AssistantContext {
  page: PageKey;
  zone: ZoneSpec;
  from: string;
  to: string;
  map?: {
    mode: MapModeValue;
    sensors: SatelliteKey[];
    confidence: ConfidenceKey[];
    sourceType: "veg" | "static" | "all";
    dayNight: "day" | "night" | "all";
  };
  calendar?: { granularity: "month" | "week" | "day" | "year"; month: { year: number; month: number } | null };
  compare?: { unit: "detections" | "celldays" | "calibrated" };
  anomalies?: { month: { year: number; month: number } | null };
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AssistantRequest {
  messages: ChatTurn[];
  context: AssistantContext;
}

export interface AssistantReply {
  text: string;
  actions: AssistantAction[];
  /** Outils de lecture utilises pour repondre (transparence : d'ou viennent les chiffres). */
  sources: string[];
}

export interface AssistantStatus {
  available: boolean;
  /** Raison lisible si l'assistant n'est pas disponible. */
  reason: string | null;
  model: string | null;
}

export const LIMITS = {
  userMessageChars: 1200,
  assistantMessageChars: 6000,
  historyTurns: 16,
} as const;
