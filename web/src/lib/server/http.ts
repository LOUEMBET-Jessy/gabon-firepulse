/** Analyse et validation des parametres d'API, reponses d'erreur homogenes. */

import type { ZoneSpec } from "../types";
import type { DetectionFilter } from "./queries";
import { getStore, isoToDay, type Store } from "./store";
import { BadRequest, parseZone } from "./zone";

export { BadRequest };

export interface Period {
  first: number;
  last: number;
}

export function parsePeriod(params: URLSearchParams, store: Store): Period {
  const from = params.get("from");
  const to = params.get("to");
  const first = from ? isoToDay(store, from) : store.firstDay;
  const last = to ? isoToDay(store, to) : store.lastDay;
  if (Number.isNaN(first) || Number.isNaN(last)) throw new BadRequest("Date invalide : format attendu AAAA-MM-JJ.");
  if (first > last) throw new BadRequest("La date de début doit précéder la date de fin.");
  if (last < store.firstDay || first > store.lastDay) {
    throw new BadRequest("Période entièrement hors de la couverture des données.");
  }
  // La periode est bornee a la couverture reelle : aucun jour hors donnees n'est invente.
  return { first: Math.max(first, store.firstDay), last: Math.min(last, store.lastDay) };
}

function flags(raw: string | null, names: readonly string[], label: string): boolean[] {
  if (raw === null) return names.map(() => true);
  const wanted = raw.split(",").filter(Boolean);
  for (const w of wanted) if (!names.includes(w)) throw new BadRequest(`${label} inconnu : ${w}.`);
  return names.map((n) => wanted.includes(n));
}

function oneOf<T extends string>(raw: string | null, allowed: readonly T[], fallback: T, label: string): T {
  if (raw === null) return fallback;
  if (!allowed.includes(raw as T)) throw new BadRequest(`${label} invalide : ${raw}.`);
  return raw as T;
}

export function parseDetectionFilter(params: URLSearchParams, store: Store): DetectionFilter {
  const zone: ZoneSpec = parseZone(params.get("zone"), store);
  const period = parsePeriod(params, store);
  return {
    zone,
    ...period,
    sats: flags(params.get("sats"), ["terra", "aqua", "snpp", "noaa20"], "Satellite"),
    conf: flags(params.get("conf"), ["low", "nominal", "high"], "Niveau de confiance"),
    types: oneOf(params.get("types"), ["veg", "static", "all"] as const, "all", "Type"),
    dayNight: oneOf(params.get("dn"), ["day", "night", "all"] as const, "all", "Filtre jour/nuit"),
  };
}

/** Enveloppe un gestionnaire : 400 pour une demande invalide, 500 explique pour le reste. */
export async function handle(request: Request, fn: (params: URLSearchParams, store: Store) => unknown | Promise<unknown>): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const result = await fn(params, getStore());
    if (result instanceof Response) return result;
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof BadRequest) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    console.error("[api]", error);
    return Response.json(
      { error: "Erreur interne lors de la lecture des données. Vérifiez que le pipeline a bien produit web/data/." },
      { status: 500 },
    );
  }
}
