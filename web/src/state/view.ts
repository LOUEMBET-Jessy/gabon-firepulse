"use client";

/**
 * Etat d'affichage partage entre les ecrans et l'assistant.
 *
 * La zone et la periode vivent dans FiltersProvider. Ici : le mode de la carte, ses filtres,
 * la vue du calendrier, l'unite de comparaison, le mois examine, et la mise en evidence
 * d'un element de l'interface. Un seul magasin, lu avec useSyncExternalStore, pour que
 * l'assistant applique une action avec les memes fonctions que l'utilisateur.
 */

import { useSyncExternalStore } from "react";

import type { MapFilters } from "@/lib/api";

export type MapMode = "points" | "grid";
export type Granularity = "month" | "week" | "day" | "year";
export type HeatMode = "activity" | "deviation";
export type CompareUnit = "detections" | "celldays" | "calibrated";
export type AnomalyDirection = "all" | "high" | "low";

export interface Spotlight {
  /** Valeur de l'attribut data-tour de l'element a mettre en evidence. */
  target: string;
  caption?: string;
}

export interface ViewState {
  map: {
    mode: MapMode;
    filters: MapFilters;
    basemap: boolean;
    showProvinces: boolean;
    /** Fond detaille en ligne (rues, quartiers, lieux-dits), jusqu'au zoom 18. */
    streets: boolean;
    /** Archive harmonisee 2000-2025, ou observatoire temps quasi reel (NASA FIRMS NRT). */
    source: "archive" | "live";
    live: { territories: ("GAB" | "FRA")[]; days: number; sats: Record<"terra" | "aqua" | "snpp" | "noaa20" | "noaa21", boolean> };
  };
  calendar: { granularity: Granularity; mode: HeatMode; month: { year: number; month: number } | null; dayYear: number | null };
  compare: { unit: CompareUnit };
  anomalies: { direction: AnomalyDirection; month: { year: number; month: number } | null };
  spotlight: Spotlight | null;
}

export const DEFAULT_MAP_FILTERS: MapFilters = {
  sats: { terra: true, aqua: true, snpp: true, noaa20: true },
  conf: { low: true, nominal: true, high: true },
  types: "all",
  dayNight: "all",
};

const INITIAL: ViewState = {
  map: {
    mode: "points",
    filters: DEFAULT_MAP_FILTERS,
    basemap: false,
    showProvinces: true,
    streets: false,
    source: "archive",
    live: { territories: ["GAB", "FRA"], days: 7, sats: { terra: true, aqua: true, snpp: true, noaa20: true, noaa21: true } },
  },
  calendar: { granularity: "month", mode: "activity", month: null, dayYear: null },
  compare: { unit: "detections" },
  anomalies: { direction: "all", month: null },
  spotlight: null,
};

let state: ViewState = INITIAL;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getView(): ViewState {
  return state;
}

type Patch<T> = { [K in keyof T]?: T[K] extends object ? (T[K] extends unknown[] ? T[K] : Partial<T[K]>) : T[K] };

/** Met a jour une branche de l'etat (fusion superficielle de la branche). */
export function updateView<K extends keyof ViewState>(key: K, patch: Patch<ViewState>[K] | ViewState[K]) {
  const current = state[key];
  const next =
    patch === null || typeof patch !== "object" || current === null || typeof current !== "object" || Array.isArray(patch)
      ? patch
      : { ...current, ...patch };
  state = { ...state, [key]: next } as ViewState;
  listeners.forEach((l) => l());
}

export function useView<T>(select: (s: ViewState) => T): T {
  return useSyncExternalStore(subscribe, () => select(state), () => select(INITIAL));
}

export function setSpotlight(spotlight: Spotlight | null) {
  updateView("spotlight", spotlight);
}
