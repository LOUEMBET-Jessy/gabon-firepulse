/**
 * Selection partagee par tous les ecrans (pays, zone, periode) : forme, validation et nom du cookie.
 * Module sans directive client : le serveur le lit pour rendre directement la bonne selection,
 * le navigateur l'ecrit a chaque changement. Le HTML du serveur et l'hydratation partent du meme etat.
 */
import type { ZoneSpec } from "./types";

export const FILTERS_COOKIE = "hotspot_filters";

export interface FiltersState {
  /** Pays de l'archive : Gabon ou France metropolitaine. */
  country: "GAB" | "FRA";
  zone: ZoneSpec;
  from: string;
  to: string;
}

export interface Coverage {
  /** Premiere et derniere dates presentes dans les donnees chargees. */
  first: string;
  last: string;
}

/** Derniere annee civile entierement couverte par les donnees. */
export function defaultPeriod(coverage: Coverage): { from: string; to: string } {
  const lastYear = Number(coverage.last.slice(0, 4));
  const year = coverage.last.slice(5) === "12-31" ? lastYear : lastYear - 1;
  const from = `${year}-01-01`;
  return { from: from < coverage.first ? coverage.first : from, to: `${year}-12-31` };
}

export function isValidFilters(value: unknown, coverage: Coverage): value is FiltersState {
  if (!value || typeof value !== "object") return false;
  const v = value as FiltersState;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (v.country !== "GAB" && v.country !== "FRA") return false;
  if (!iso.test(v.from) || !iso.test(v.to) || v.from > v.to || v.from < coverage.first || v.to > coverage.last) return false;
  if (!v.zone || !["country", "province", "department", "place", "bbox"].includes(v.zone.kind)) return false;
  if (v.zone.kind === "bbox" && (!Array.isArray(v.zone.bbox) || v.zone.bbox.length !== 4 || v.zone.bbox.some((n) => typeof n !== "number"))) return false;
  if ((v.zone.kind === "province" || v.zone.kind === "department") && !Number.isInteger(v.zone.index)) return false;
  if (v.zone.kind === "place" && !Number.isInteger(v.zone.id)) return false;
  return true;
}

/** Couverture de chaque pays : les archives peuvent s'arreter a des dates differentes. */
export type Coverages = Record<"GAB" | "FRA", Coverage>;

export function initialFilters(raw: unknown, coverages: Coverages): FiltersState {
  const country = raw && typeof raw === "object" && (raw as FiltersState).country === "FRA" ? "FRA" : "GAB";
  return isValidFilters(raw, coverages[country]) ? raw : { country: "GAB", zone: { kind: "country" }, ...defaultPeriod(coverages.GAB) };
}

/** Borne une periode a la couverture d'un pays ; si elle en sort entierement, revient a la derniere annee complete. */
export function clampPeriod(from: string, to: string, coverage: Coverage): { from: string; to: string } {
  const a = from < coverage.first ? coverage.first : from;
  const b = to > coverage.last ? coverage.last : to;
  return a <= b ? { from: a, to: b } : defaultPeriod(coverage);
}
