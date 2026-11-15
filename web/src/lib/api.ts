"use client";

import { useSyncExternalStore } from "react";
import useSWR, { type SWRConfiguration } from "swr";

import type { LiveResponse, LiveSatellite, LiveTerritory,
  CalendarResponse,
  DailyResponse,
  DetectionDetail,
  DetectionsResponse,
  GridResponse,
  MetadataResponse,
  OverviewResponse,
  RegionsResponse,
  ZoneSpec,
} from "./types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function fetchJson<T>(url: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new ApiError("Le serveur de l'application ne répond pas. Vérifiez qu'il est démarré.", 0);
  }
  if (!response.ok) {
    let message = `Erreur ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* corps non JSON : on garde le code HTTP */
    }
    throw new ApiError(message, response.status);
  }
  return (await response.json()) as T;
}

const config: SWRConfiguration = { revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true, shouldRetryOnError: false };

/**
 * Pays de l'archive consultee (GAB par defaut). Fixe par FiltersProvider pendant son rendu, avant les ecrans :
 * chaque adresse d'API (et donc chaque cle de cache SWR) porte le pays, les archives ne se melangent jamais.
 */
let currentCountry: "GAB" | "FRA" = "GAB";
export function setApiCountry(country: "GAB" | "FRA") {
  currentCountry = country;
}
export function getApiCountry() {
  return currentCountry;
}
function archive(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}country=${currentCountry}`;
}

export function zoneParam(zone: ZoneSpec): string {
  if (zone.kind === "country") return "country";
  if (zone.kind === "province") return `province:${zone.index}`;
  if (zone.kind === "department") return `department:${zone.index}`;
  if (zone.kind === "place") return `place:${zone.id}`;
  return `bbox:${zone.bbox.join(",")}`;
}

export interface MapFilters {
  sats: { terra: boolean; aqua: boolean; snpp: boolean; noaa20: boolean };
  conf: { low: boolean; nominal: boolean; high: boolean };
  types: "veg" | "static" | "all";
  dayNight: "day" | "night" | "all";
}

export function detectionQuery(zone: ZoneSpec, from: string, to: string, filters?: MapFilters): string {
  const p = new URLSearchParams({ zone: zoneParam(zone), from, to });
  if (filters) {
    p.set("sats", Object.entries(filters.sats).filter(([, on]) => on).map(([k]) => k).join(","));
    p.set("conf", Object.entries(filters.conf).filter(([, on]) => on).map(([k]) => k).join(","));
    p.set("types", filters.types);
    p.set("dn", filters.dayNight);
  }
  return p.toString();
}

export function useMetadata() {
  return useSWR<MetadataResponse, ApiError>(archive("/api/metadata"), fetchJson, config);
}

export function useCalendar(zone: ZoneSpec) {
  return useSWR<CalendarResponse, ApiError>(archive(`/api/calendar?zone=${encodeURIComponent(zoneParam(zone))}`), fetchJson, config);
}

export function useDaily(zone: ZoneSpec, enabled = true) {
  return useSWR<DailyResponse, ApiError>(enabled ? archive(`/api/daily?zone=${encodeURIComponent(zoneParam(zone))}`) : null, fetchJson, config);
}

export function useOverview(zone: ZoneSpec, from: string, to: string) {
  return useSWR<OverviewResponse, ApiError>(archive(`/api/overview?${new URLSearchParams({ zone: zoneParam(zone), from, to })}`), fetchJson, config);
}

export function useRegions(from: string, to: string) {
  return useSWR<RegionsResponse, ApiError>(archive(`/api/regions?${new URLSearchParams({ from, to })}`), fetchJson, config);
}

/** Activite par departement d'une province (ou de tout le pays). `enabled` a false : aucune requete. */
export function useDepartmentRegions(from: string, to: string, province: number | null, enabled = true) {
  const p = new URLSearchParams({ from, to, level: "department" });
  if (province !== null) p.set("province", String(province));
  return useSWR<RegionsResponse, ApiError>(enabled ? archive(`/api/regions?${p}`) : null, fetchJson, config);
}

export function useDetections(zone: ZoneSpec, from: string, to: string, filters: MapFilters, enabled = true) {
  return useSWR<DetectionsResponse, ApiError>(enabled ? archive(`/api/detections?${detectionQuery(zone, from, to, filters)}`) : null, fetchJson, config);
}

export function useGrid(zone: ZoneSpec, from: string, to: string, enabled = true) {
  return useSWR<GridResponse, ApiError>(enabled ? archive(`/api/aggregates?${new URLSearchParams({ zone: zoneParam(zone), from, to })}`) : null, fetchJson, config);
}

export function useDetection(id: number | null) {
  return useSWR<DetectionDetail, ApiError>(id === null ? null : archive(`/api/detections/${id}`), fetchJson, config);
}

export function exportUrl(kind: "detections" | "monthly" | "anomalies", format: "csv" | "geojson", zone: ZoneSpec, from?: string, to?: string, filters?: MapFilters) {
  const base = kind === "detections" && from && to ? detectionQuery(zone, from, to, filters) : new URLSearchParams({ zone: zoneParam(zone) }).toString();
  return archive(`/api/export?kind=${kind}&format=${format}&${base}`);
}

/**
 * Dernieres detections NASA FIRMS. Rafraichies toutes les 10 minutes et au retour sur l'onglet :
 * le serveur decide s'il faut interroger la NASA (cache et requetes conditionnelles).
 */
export function useLive(territories: LiveTerritory[], days: number, sats: LiveSatellite[], enabled = true) {
  const p = new URLSearchParams({ territories: territories.join(","), days: String(days), sats: sats.join(",") });
  return useSWR<LiveResponse, ApiError>(enabled && territories.length && sats.length ? `/api/live?${p}` : null, fetchJson, {
    keepPreviousData: true,
    revalidateOnFocus: true,
    refreshInterval: 10 * 60_000,
    shouldRetryOnError: true,
    errorRetryCount: 2,
  });
}

/**
 * Vrai une fois la page hydratee. Les liens qui dependent du pays restaure depuis la session (exports)
 * attendent ce moment : le HTML du serveur et celui de l'hydratation restent identiques.
 */
const noop = () => () => {};
export function useHydrated(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
