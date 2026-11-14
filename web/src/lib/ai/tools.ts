/**
 * Outils de Hot-Spot AI.
 *
 * Deux familles :
 * - lecture (executes ici, sur le serveur) : interrogent les memes fonctions que l'API de l'application ;
 * - actions d'interface (validees ici, appliquees dans le navigateur avec les fonctions de l'application).
 *
 * Toute entree du modele est validee avant usage. Une entree invalide produit une erreur
 * renvoyee au modele, jamais une action.
 */

import type Anthropic from "@anthropic-ai/sdk";

import {
  PAGE_KEYS,
  TARGETS,
  type AssistantAction,
  type AssistantContext,
  type ConfidenceKey,
  type PageKey,
  type TargetKey,
} from "../assistant/protocol";
import { ANOMALY_SETTINGS } from "../science/anomaly";
import { calendar } from "../server/engine";
import { overview, regions } from "../server/queries";
import { dayToIso, getStore, isoToDay, type Store } from "../server/store";
import { BadRequest, parseZone, zoneInfo } from "../server/zone";
import { SATELLITE_KEYS, type SatelliteKey, type ZoneSpec } from "../types";

type Tool = Anthropic.Beta.Messages.BetaTool;

/* ------------------------------------------------------------------ Validation */

export class ToolInputError extends Error {}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Zone en langage du modele : "country", "Gabon", nom de province, "province:3" ou "bbox:ouest,sud,est,nord". */
export function resolveZone(raw: unknown, store: Store): ZoneSpec {
  if (typeof raw !== "string" || !raw.trim()) throw new ToolInputError("zone manquante");
  const value = raw.trim();
  const plain = normalize(value);
  if (["country", "gabon", "pays", "pays entier", "tout le gabon"].includes(plain)) return { kind: "country" };
  if (value.startsWith("bbox:") || value.startsWith("province:")) {
    try {
      return parseZone(value, store);
    } catch (error) {
      throw new ToolInputError(error instanceof Error ? error.message : "zone invalide");
    }
  }
  const match = store.meta.provinces.find((p) => normalize(p.name) === plain || normalize(p.name).replace(/ /g, "") === plain.replace(/ /g, ""));
  if (match) return { kind: "province", index: match.index };
  throw new ToolInputError(
    `zone inconnue : « ${value.slice(0, 60)} ». Zones possibles : country, ${store.meta.provinces.map((p) => p.name).join(", ")}, ou bbox:ouest,sud,est,nord.`,
  );
}

function isoDate(raw: unknown, name: string, store: Store): string {
  if (typeof raw !== "string" || Number.isNaN(isoToDay(store, raw))) throw new ToolInputError(`${name} invalide : format attendu AAAA-MM-JJ`);
  return raw;
}

/** Periode bornee a la couverture reelle ; refuse une periode entierement hors donnees. */
export function resolvePeriod(fromRaw: unknown, toRaw: unknown, store: Store): { from: string; to: string; clamped: boolean } {
  const from = isoDate(fromRaw, "from", store);
  const to = isoDate(toRaw, "to", store);
  if (from > to) throw new ToolInputError("la date de début doit précéder la date de fin");
  const first = dayToIso(store, store.firstDay);
  const last = dayToIso(store, store.lastDay);
  if (to < first || from > last) throw new ToolInputError(`période hors des données disponibles (du ${first} au ${last})`);
  const a = from < first ? first : from;
  const b = to > last ? last : to;
  return { from: a, to: b, clamped: a !== from || b !== to };
}

function oneOf<T extends string>(raw: unknown, allowed: readonly T[], name: string): T {
  if (typeof raw !== "string" || !allowed.includes(raw as T)) throw new ToolInputError(`${name} invalide : valeurs possibles ${allowed.join(", ")}`);
  return raw as T;
}

function optionalOneOf<T extends string>(raw: unknown, allowed: readonly T[], name: string): T | undefined {
  return raw === undefined || raw === null ? undefined : oneOf(raw, allowed, name);
}

function listOf<T extends string>(raw: unknown, allowed: readonly T[], name: string): T[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.length === 0) throw new ToolInputError(`${name} doit être une liste non vide`);
  return [...new Set(raw.map((v) => oneOf(v, allowed, name)))];
}

function intIn(raw: unknown, min: number, max: number, name: string): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) throw new ToolInputError(`${name} doit être un entier entre ${min} et ${max}`);
  return n;
}

function asObject(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>) : {};
}

/* ------------------------------------------------------------------ Contexte applicatif */

const SENSORS_ALL: readonly SatelliteKey[] = SATELLITE_KEYS;
const CONFIDENCE_ALL: readonly ConfidenceKey[] = ["low", "nominal", "high"];

/** Valide le contexte envoye par le navigateur. Tout champ invalide est rejete ou ramene a une valeur sure. */
export function validateContext(raw: unknown, store: Store = getStore()): AssistantContext {
  const o = asObject(raw);
  const page = PAGE_KEYS.includes(o.page as PageKey) ? (o.page as PageKey) : "home";
  let zone: ZoneSpec = { kind: "country" };
  const z = asObject(o.zone);
  try {
    if (z.kind === "province") zone = parseZone(`province:${Number(z.index)}`, store);
    else if (z.kind === "bbox" && Array.isArray(z.bbox)) zone = parseZone(`bbox:${(z.bbox as unknown[]).map(Number).join(",")}`, store);
  } catch {
    zone = { kind: "country" };
  }
  let from = dayToIso(store, store.firstDay);
  let to = dayToIso(store, store.lastDay);
  try {
    const period = resolvePeriod(o.from, o.to, store);
    from = period.from;
    to = period.to;
  } catch {
    /* periode absente ou invalide : couverture complete */
  }
  const ctx: AssistantContext = { page, zone, from, to };
  const m = asObject(o.map);
  if (m.mode === "points" || m.mode === "grid") {
    const filter = <T extends string>(v: unknown, all: readonly T[]) => (Array.isArray(v) ? (v.filter((x) => all.includes(x as T)) as T[]) : [...all]);
    ctx.map = {
      mode: m.mode,
      sensors: filter(m.sensors, SENSORS_ALL),
      confidence: filter(m.confidence, CONFIDENCE_ALL),
      sourceType: m.sourceType === "veg" || m.sourceType === "static" ? m.sourceType : "all",
      dayNight: m.dayNight === "day" || m.dayNight === "night" ? m.dayNight : "all",
    };
  }
  const c = asObject(o.calendar);
  if (["month", "week", "day", "year"].includes(c.granularity as string)) {
    const month = asObject(c.month);
    ctx.calendar = {
      granularity: c.granularity as "month",
      month: Number.isInteger(month.year) && Number.isInteger(month.month) ? { year: Number(month.year), month: Number(month.month) } : null,
    };
  }
  const cmp = asObject(o.compare);
  if (["detections", "celldays", "calibrated"].includes(cmp.unit as string)) ctx.compare = { unit: cmp.unit as "detections" };
  const an = asObject(asObject(o.anomalies).month);
  if (Number.isInteger(an.year) && Number.isInteger(an.month)) ctx.anomalies = { month: { year: Number(an.year), month: Number(an.month) } };
  return ctx;
}

/** Contexte lisible par le modele : une description factuelle, pas des instructions. */
export function describeContext(ctx: AssistantContext, store: Store = getStore()): string {
  const zone = zoneInfo(ctx.zone, store);
  const lines = [
    "Contexte applicatif actuel (fourni par l'interface Hot-Spot, à jour) :",
    `- page ouverte : ${ctx.page}`,
    `- zone d'analyse : ${zone.label}${ctx.zone.kind === "province" ? ` (province:${ctx.zone.index})` : ctx.zone.kind === "bbox" ? ` (bbox:${ctx.zone.bbox.join(",")})` : " (country)"}`,
    `- période sélectionnée : du ${ctx.from} au ${ctx.to}`,
    `- données disponibles : du ${dayToIso(store, store.firstDay)} au ${dayToIso(store, store.lastDay)}`,
  ];
  if (ctx.map) {
    lines.push(
      `- carte : mode ${ctx.map.mode === "points" ? "détections natives" : "grille harmonisée"}, satellites ${ctx.map.sensors.join(", ") || "aucun"}, confiance ${ctx.map.confidence.join(", ") || "aucune"}, type ${ctx.map.sourceType}, ${ctx.map.dayNight}`,
    );
  }
  if (ctx.calendar) lines.push(`- calendrier : pas de temps ${ctx.calendar.granularity}${ctx.calendar.month ? `, mois ouvert ${ctx.calendar.month.year}-${ctx.calendar.month.month}` : ""}`);
  if (ctx.compare) lines.push(`- comparaison des capteurs : unité ${ctx.compare.unit}`);
  if (ctx.anomalies?.month) lines.push(`- période inhabituelle examinée : ${ctx.anomalies.month.year}-${ctx.anomalies.month.month}`);
  return lines.join("\n");
}

/* ------------------------------------------------------------------ Definitions */

const ZONE_DESC = "Zone : « country » pour le Gabon entier, le nom d'une province (ex. « Haut-Ogooué »), ou « bbox:ouest,sud,est,nord » en degrés décimaux. Par défaut : la zone sélectionnée dans l'interface.";
const DATE_DESC = "Date au format AAAA-MM-JJ.";

const schema = (properties: Record<string, unknown>, required: string[] = []): Tool["input_schema"] => ({
  type: "object",
  properties: properties as Tool["input_schema"]["properties"],
  required,
  additionalProperties: false,
});

export const TOOL_DEFINITIONS: Tool[] = [
  {
    name: "get_activity_summary",
    description:
      "Lecture. Synthèse d'une zone sur une période : indice harmonisé (cellules-jour, équivalent Suomi-NPP) et son intervalle, comparaison aux mêmes dates des autres années (médiane, score robuste, rang, fiabilité, réserves), détections natives par satellite, sources statiques, jours non observés, interruptions de capteur, et chaque capteur mesuré séparément. Utiliser pour résumer ou interpréter une période.",
    input_schema: schema({ zone: { type: "string", description: ZONE_DESC }, from: { type: "string", description: DATE_DESC }, to: { type: "string", description: DATE_DESC } }),
  },
  {
    name: "get_history",
    description:
      "Lecture. Historique 2000-2025 d'une zone : totaux annuels harmonisés (avec part estimée depuis MODIS et complétude), mois habituellement critiques, médiane par mois calendaire, tendances (Theil-Sen et Mann-Kendall, série harmonisée et VIIRS seul), mois signalés comme inhabituels, calage ajusté à la zone.",
    input_schema: schema({ zone: { type: "string", description: ZONE_DESC } }),
  },
  {
    name: "get_month_detail",
    description: "Lecture. Détail d'un mois pour une zone : valeur harmonisée, origine (VIIRS observé ou MODIS estimé), complétude, référence saisonnière, score robuste, rang, fiabilité, réserves, détections natives par satellite.",
    input_schema: schema(
      { year: { type: "integer", description: "Année, 2000 à 2025." }, month: { type: "integer", description: "Mois, 1 à 12." }, zone: { type: "string", description: ZONE_DESC } },
      ["year", "month"],
    ),
  },
  {
    name: "get_province_ranking",
    description: "Lecture. Classement des 9 provinces sur une période : indice harmonisé, part, densité pour 1 000 km², statut par rapport à la saison.",
    input_schema: schema({ from: { type: "string", description: DATE_DESC }, to: { type: "string", description: DATE_DESC } }),
  },
  {
    name: "get_method_facts",
    description:
      "Lecture. Faits documentés sur la méthode et les données : 'donnees' (sources, couverture, dates d'accès, volumes), 'capteurs' (MODIS et VIIRS), 'harmonisation' (règles et calage), 'calage' (validation hors échantillon), 'anomalies' (méthode et seuils), 'limites'.",
    input_schema: schema({ topic: { type: "string", enum: ["donnees", "capteurs", "harmonisation", "calage", "anomalies", "limites"] } }, ["topic"]),
  },
  {
    name: "navigate",
    description: "Action. Ouvre une page de l'application.",
    input_schema: schema({ page: { type: "string", enum: PAGE_KEYS } }, ["page"]),
  },
  {
    name: "set_zone",
    description: "Action. Change la zone d'analyse de toute l'application (carte, calendrier, graphiques).",
    input_schema: schema({ zone: { type: "string", description: ZONE_DESC } }, ["zone"]),
  },
  {
    name: "set_period",
    description: "Action. Change la période d'analyse de toute l'application. Bornée aux données disponibles (2000-11-01 au 2025-12-31).",
    input_schema: schema({ from: { type: "string", description: DATE_DESC }, to: { type: "string", description: DATE_DESC } }, ["from", "to"]),
  },
  {
    name: "set_map_view",
    description: "Action. Règle la carte et l'ouvre : mode (points = détections natives, grid = grille harmonisée), satellites affichés, niveaux de confiance, type de source, jour ou nuit, fond de relief en ligne. Les champs omis restent inchangés.",
    input_schema: schema({
      mode: { type: "string", enum: ["points", "grid"] },
      sensors: { type: "array", items: { type: "string", enum: SATELLITE_KEYS } },
      confidence: { type: "array", items: { type: "string", enum: ["low", "nominal", "high"] } },
      source_type: { type: "string", enum: ["all", "veg", "static"] },
      day_night: { type: "string", enum: ["all", "day", "night"] },
      basemap: { type: "boolean" },
    }),
  },
  {
    name: "set_calendar_view",
    description: "Action. Ouvre le calendrier et règle sa vue : pas de temps, mode (activity = activité, deviation = écart à la référence), année affichée en vue jour, mois à détailler.",
    input_schema: schema({
      granularity: { type: "string", enum: ["month", "week", "day", "year"] },
      heat_mode: { type: "string", enum: ["activity", "deviation"] },
      year: { type: "integer" },
      month: { type: "integer" },
    }),
  },
  {
    name: "compare_sensors",
    description: "Action. Ouvre la comparaison MODIS / VIIRS avec l'unité choisie : detections (brut), celldays (cellules-jour), calibrated (après calage).",
    input_schema: schema({ unit: { type: "string", enum: ["detections", "celldays", "calibrated"] } }),
  },
  {
    name: "show_unusual_periods",
    description: "Action. Ouvre la page des périodes inhabituelles, filtrée par sens d'écart, et peut ouvrir le détail d'un mois.",
    input_schema: schema({ direction: { type: "string", enum: ["all", "high", "low"] }, year: { type: "integer" }, month: { type: "integer" } }),
  },
  {
    name: "highlight",
    description: "Action. Met en évidence un élément de l'interface avec une courte légende, pour montrer où se trouve une fonction. L'élément doit être visible sur la page ouverte : ouvrir la bonne page avant si besoin.",
    input_schema: schema(
      { target: { type: "string", enum: Object.keys(TARGETS) }, caption: { type: "string", description: "Légende courte, 12 mots au plus." } },
      ["target", "caption"],
    ),
  },
  {
    name: "start_guided_tour",
    description: "Action. Lance la visite guidée pas à pas de Hot-Spot (choisir une période, la carte, les capteurs, le calendrier, les tendances).",
    input_schema: schema({}),
  },
  {
    name: "prepare_export",
    description:
      "Action soumise à confirmation. Prépare un export des résultats actuels (zone, période et filtres de carte en cours) : detections (csv ou geojson), monthly (série mensuelle csv), anomalies (csv), report_pdf (synthèse imprimable). L'utilisateur confirme lui-même le téléchargement.",
    input_schema: schema({ kind: { type: "string", enum: ["detections", "monthly", "anomalies", "report_pdf"] }, format: { type: "string", enum: ["csv", "geojson", "pdf"] } }, ["kind"]),
  },
];

/* ------------------------------------------------------------------ Execution */

export interface ToolOutcome {
  content: string;
  isError?: boolean;
  action?: AssistantAction;
  /** Nom lisible de la source consultee (outils de lecture). */
  source?: string;
}

const r1 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 10) / 10);
const r2 = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);
const json = (value: unknown) => JSON.stringify(value);

function zoneFrom(input: Record<string, unknown>, ctx: AssistantContext, store: Store): ZoneSpec {
  return input.zone === undefined || input.zone === null || input.zone === "" ? ctx.zone : resolveZone(input.zone, store);
}

function periodFrom(input: Record<string, unknown>, ctx: AssistantContext, store: Store) {
  if (input.from === undefined && input.to === undefined) return { from: ctx.from, to: ctx.to, clamped: false };
  return resolvePeriod(input.from ?? ctx.from, input.to ?? ctx.to, store);
}

const READ_NOTE = "Rappel : détections satellitaires, pas incendies confirmés ; un écart statistique n'est pas une prédiction.";

export function runTool(name: string, rawInput: unknown, ctx: AssistantContext, store: Store = getStore()): ToolOutcome {
  const input = asObject(rawInput);
  try {
    switch (name) {
      case "get_activity_summary": {
        const zone = zoneFrom(input, ctx, store);
        const period = periodFrom(input, ctx, store);
        const o = overview(zone, isoToDay(store, period.from), isoToDay(store, period.to), store);
        return {
          source: `Synthèse ${o.zone.label}, ${o.from} au ${o.to}`,
          content: json({
            zone: o.zone.label,
            periode: { du: o.from, au: o.to, bornee_aux_donnees: period.clamped },
            unite: "cellules-jour actives, équivalent VIIRS Suomi-NPP",
            indice_harmonise: r1(o.harmonized),
            intervalle_calage: o.estimatedShare > 0 ? [r1(o.low), r1(o.high)] : null,
            part_estimee_depuis_modis: r2(o.estimatedShare),
            jours: o.days,
            jours_sans_capteur: o.unobservedDays,
            comparaison_memes_dates_autres_annees: o.window
              ? {
                  statut: o.window.status,
                  mediane: r1(o.window.median),
                  quartiles: [r1(o.window.q25), r1(o.window.q75)],
                  score_robuste: r2(o.window.robustZ),
                  rang_centile: r1(o.window.percentile),
                  annees_reference: o.window.referenceCount,
                  fiabilite: o.window.reliability,
                  reserves: o.window.caveats,
                }
              : "période de plus d'un an : pas de comparaison saisonnière",
            detections_natives_par_satellite: o.detections,
            detections_retenues_dans_indice: o.eligible,
            sources_statiques_ecartees: o.staticSources,
            cellules_actives: o.activeCells,
            interruptions_capteur: o.gaps.map((g) => `${g.satellite} du ${g.start} au ${g.end}`),
            chaque_capteur_separement: o.sensors.map((s) => ({
              configuration: s.config,
              jours_en_service: s.daysObserved,
              cellules_jour_brutes: r1(s.cellDays),
              equivalent_suomi_npp: r1(s.equivalent),
            })),
            note: `${READ_NOTE} Les lignes « chaque_capteur_separement » ne s'additionnent pas.`,
          }),
        };
      }
      case "get_history": {
        const zone = zoneFrom(input, ctx, store);
        const c = calendar(zone, store);
        const flagged = c.months.filter((m) => ["strong_high", "high", "low"].includes(m.assessment.status));
        const strongest = [...flagged].sort((a, b) => Math.abs(b.assessment.robustZ ?? 0) - Math.abs(a.assessment.robustZ ?? 0)).slice(0, 8);
        const recent = flagged.slice(-8);
        const fmtMonth = (m: (typeof flagged)[number]) => ({
          mois: `${m.year}-${String(m.month).padStart(2, "0")}`,
          statut: m.assessment.status,
          valeur: r1(m.harmonized),
          mediane: r1(m.assessment.median),
          score: r2(m.assessment.robustZ),
          fiabilite: m.assessment.reliability,
          origine: m.kind,
        });
        const t = (x: (typeof c.trends)["full"]) =>
          x ? { annees: `${x.firstYear}-${x.lastYear}`, n: x.n, pente_par_an: r1(x.slope), pente_pct_mediane_par_an: r2(x.slopePctOfMedian), valeur_p: r2(x.pValue) } : null;
        const ta = c.calibration.configs.TA;
        return {
          source: `Historique ${c.zone.label}`,
          content: json({
            zone: c.zone.label,
            unite: c.unit,
            totaux_annuels: c.years.map((y) => ({
              annee: y.year,
              indice: r1(y.harmonized),
              complete: y.complete,
              part_estimee_modis: r2(y.estimatedShare),
              intervalle: y.estimatedShare > 0 ? [r1(y.low), r1(y.high)] : null,
            })),
            mois_critiques: c.criticalMonths,
            mediane_par_mois_calendaire: c.baselines.map((b) => ({ mois: b.month, mediane: r1(b.median), annees: b.n })),
            tendance_serie_harmonisee: t(c.trends.full),
            tendance_viirs_seul: t(c.trends.viirsOnly),
            nombre_mois_signales: flagged.length,
            mois_signales_les_plus_forts: strongest.map(fmtMonth),
            mois_signales_les_plus_recents: recent.map(fmtMonth),
            calage_zone: ta
              ? { local: c.calibration.local, correction_k: r2(ta.k), erreur_annuelle_validation: r2(ta.annualErrorLoyo), verifie: ta.verified }
              : null,
            note: READ_NOTE,
          }),
        };
      }
      case "get_month_detail": {
        const zone = zoneFrom(input, ctx, store);
        const year = intIn(input.year, 2000, 2025, "year");
        const month = intIn(input.month, 1, 12, "month");
        const c = calendar(zone, store);
        const m = c.months.find((x) => x.year === year && x.month === month);
        if (!m) return { content: `Aucune donnée pour ${year}-${month} : hors de la couverture (novembre 2000 à décembre 2025).`, isError: true };
        const a = m.assessment;
        return {
          source: `Mois ${year}-${String(month).padStart(2, "0")}, ${c.zone.label}`,
          content: json({
            zone: c.zone.label,
            mois: `${year}-${String(month).padStart(2, "0")}`,
            indice_harmonise: r1(m.harmonized),
            intervalle_calage: m.estimatedShare > 0 ? [r1(m.low), r1(m.high)] : null,
            origine: m.kind,
            observation_complete: m.complete,
            jours_sans_capteur: m.unobservedDays,
            statut: a.status,
            mediane_reference: r1(a.median),
            quartiles_reference: [r1(a.q25), r1(a.q75)],
            min_max_reference: [r1(a.referenceMin), r1(a.referenceMax)],
            score_robuste: r2(a.robustZ),
            score_classique: r2(a.classicZ),
            rang_centile: r1(a.percentile),
            annees_reference: a.referenceCount,
            fiabilite: a.reliability,
            reserves: a.caveats,
            detections_natives_par_satellite: m.detections,
            note: READ_NOTE,
          }),
        };
      }
      case "get_province_ranking": {
        const period = periodFrom(input, ctx, store);
        const r = regions(isoToDay(store, period.from), isoToDay(store, period.to), store);
        return {
          source: `Provinces, ${r.from} au ${r.to}`,
          content: json({
            periode: { du: r.from, au: r.to },
            provinces: [...r.regions]
              .sort((a, b) => b.harmonized - a.harmonized)
              .map((p) => ({ province: p.name, indice: r1(p.harmonized), part: r2(p.share), densite_pour_1000_km2: r1(p.density), statut_saison: p.window?.status ?? null })),
            note: "Une cellule à cheval sur deux provinces compte dans chacune. " + READ_NOTE,
          }),
        };
      }
      case "get_method_facts":
        return { source: "Méthode et données", content: methodFacts(oneOf(input.topic, ["donnees", "capteurs", "harmonisation", "calage", "anomalies", "limites"] as const, "topic"), store) };

      /* --- actions d'interface --- */
      case "navigate": {
        const page = oneOf(input.page, PAGE_KEYS, "page");
        ctx.page = page;
        return { action: { type: "navigate", page }, content: `Page « ${page} » ouverte dans l'interface.` };
      }
      case "set_zone": {
        const zone = resolveZone(input.zone, store);
        const label = zoneInfo(zone, store).label;
        ctx.zone = zone;
        return { action: { type: "set_zone", zone, label }, content: `Zone d'analyse appliquée : ${label}.` };
      }
      case "set_period": {
        const p = resolvePeriod(input.from, input.to, store);
        ctx.from = p.from;
        ctx.to = p.to;
        return {
          action: { type: "set_period", from: p.from, to: p.to },
          content: `Période appliquée : du ${p.from} au ${p.to}.${p.clamped ? " Elle a été bornée aux données disponibles : signale-le à l'utilisateur." : ""}`,
        };
      }
      case "set_map_view": {
        const action: AssistantAction = {
          type: "set_map_view",
          mode: optionalOneOf(input.mode, ["points", "grid"] as const, "mode"),
          sensors: listOf(input.sensors, SATELLITE_KEYS, "sensors"),
          confidence: listOf(input.confidence, ["low", "nominal", "high"] as const, "confidence"),
          sourceType: optionalOneOf(input.source_type, ["all", "veg", "static"] as const, "source_type"),
          dayNight: optionalOneOf(input.day_night, ["all", "day", "night"] as const, "day_night"),
          basemap: typeof input.basemap === "boolean" ? input.basemap : undefined,
        };
        ctx.page = "map";
        return { action, content: "Carte ouverte et réglée." };
      }
      case "set_calendar_view": {
        const year = input.year === undefined || input.year === null ? undefined : intIn(input.year, 2000, 2025, "year");
        const month = input.month === undefined || input.month === null ? undefined : intIn(input.month, 1, 12, "month");
        if (month !== undefined && year === undefined) throw new ToolInputError("month exige year");
        ctx.page = "calendar";
        return {
          action: {
            type: "set_calendar_view",
            granularity: optionalOneOf(input.granularity, ["month", "week", "day", "year"] as const, "granularity"),
            heatMode: optionalOneOf(input.heat_mode, ["activity", "deviation"] as const, "heat_mode"),
            year,
            month,
          },
          content: "Calendrier ouvert et réglé.",
        };
      }
      case "compare_sensors": {
        const unit = optionalOneOf(input.unit, ["detections", "celldays", "calibrated"] as const, "unit") ?? "detections";
        ctx.page = "compare";
        return { action: { type: "set_compare_unit", unit }, content: `Comparaison des capteurs ouverte, unité : ${unit}.` };
      }
      case "show_unusual_periods": {
        const year = input.year === undefined || input.year === null ? undefined : intIn(input.year, 2000, 2025, "year");
        const month = input.month === undefined || input.month === null ? undefined : intIn(input.month, 1, 12, "month");
        if ((year === undefined) !== (month === undefined)) throw new ToolInputError("year et month vont ensemble");
        ctx.page = "anomalies";
        return {
          action: { type: "open_unusual_periods", direction: optionalOneOf(input.direction, ["all", "high", "low"] as const, "direction"), year, month },
          content: "Page des périodes inhabituelles ouverte.",
        };
      }
      case "highlight": {
        const target = oneOf(input.target, Object.keys(TARGETS) as TargetKey[], "target");
        const caption = typeof input.caption === "string" ? input.caption.trim().slice(0, 120) : "";
        return { action: { type: "highlight", target, caption }, content: `Élément « ${target} » mis en évidence s'il est visible sur la page ouverte.` };
      }
      case "start_guided_tour":
        return { action: { type: "start_tour" }, content: "Visite guidée lancée dans l'interface." };
      case "prepare_export": {
        const kind = oneOf(input.kind, ["detections", "monthly", "anomalies", "report_pdf"] as const, "kind");
        const allowed = kind === "detections" ? (["csv", "geojson"] as const) : kind === "report_pdf" ? (["pdf"] as const) : (["csv"] as const);
        const format = input.format === undefined || input.format === null ? allowed[0] : oneOf(input.format, allowed as readonly ("csv" | "geojson" | "pdf")[], "format");
        const zoneLabel = zoneInfo(ctx.zone, store).label;
        const label =
          kind === "detections"
            ? `Détections ${format === "csv" ? "CSV" : "GeoJSON"}, ${zoneLabel}, du ${ctx.from} au ${ctx.to}`
            : kind === "monthly"
              ? `Calendrier mensuel harmonisé CSV, ${zoneLabel}, 2000 à 2025`
              : kind === "anomalies"
                ? `Périodes inhabituelles CSV, ${zoneLabel}`
                : `Rapport de synthèse PDF, ${zoneLabel}, du ${ctx.from} au ${ctx.to}`;
        return {
          action: { type: "export", kind, format, label },
          content: `Export préparé : ${label}. Il attend la confirmation de l'utilisateur, qui verra un bouton de téléchargement. Ne dis pas que le fichier est téléchargé.`,
        };
      }
      default:
        return { content: `Outil inconnu : ${name}.`, isError: true };
    }
  } catch (error) {
    if (error instanceof ToolInputError || error instanceof BadRequest) return { content: `Paramètre invalide : ${error.message}. Aucune action effectuée.`, isError: true };
    throw error;
  }
}

function methodFacts(topic: "donnees" | "capteurs" | "harmonisation" | "calage" | "anomalies" | "limites", store: Store): string {
  const h = store.harmonization;
  const m = store.metadata;
  const ta = h.calibration.TA;
  switch (topic) {
    case "donnees":
      return json({
        source: "NASA FIRMS, archives annuelles par pays (Gabon)",
        couverture: `${m.coverage.first_date} au ${m.coverage.last_date}`,
        fichiers: store.meta.sources.length,
        lignes: m.rows,
        consulte_le: m.firms.accessed_last,
        annees_absentes_cote_nasa: m.firms.missing_years.map((y) => `${y.dataset} ${y.year}`),
        limites_administratives: "geoBoundaries (CC BY-SA 3.0), état représenté 2005",
        nature: "archive réelle figée, pas de temps réel",
      });
    case "capteurs":
      return json({
        satellites: store.meta.satellites.map((s) => ({ satellite: s.name, capteur: s.sensor, debut: s.first_date, fin: s.last_date, detections: s.detections, retenues: s.eligible })),
        pixel: { MODIS: "1 km au nadir", VIIRS: "environ 375 m au nadir" },
        confiance: "MODIS : pourcentage (faible < 30, élevée >= 80) ; VIIRS : classes l, n, h. Échelles non converties l'une dans l'autre.",
        passages: "Terra vers 10 h 30 et 22 h 30 ; Aqua et Suomi-NPP vers 13 h 30 et 1 h 30 ; NOAA-20 environ 50 minutes d'écart.",
      });
    case "harmonisation":
      return json({
        regle_1: "Retenir les détections « feu de végétation présumé » de confiance non faible ; écarter les sources statiques.",
        regle_2: `Compter des cellules-jour sur une grille de ${h.grid.step_deg}° : une cellule compte une fois par jour.`,
        regle_3: "Caler chaque configuration MODIS sur VIIRS Suomi-NPP, par mois calendaire, sur les jours communs ; facteur ajusté à chaque zone.",
        regle_4: `Un seul capteur par jour, dans l'ordre ${h.relay_priority.join(" > ")} : aucun total MODIS + VIIRS.`,
        interruptions_detectees: h.gaps.map((g) => `${g.satellite} ${g.start} au ${g.end}`),
      });
    case "calage":
      return json({
        terra_aqua: ta
          ? {
              facteurs_par_mois: ta.factors_by_month.map((f) => r2(f)),
              annees_communes: `${ta.overlap_first_year}-${ta.overlap_last_year}`,
              erreur_mensuelle_mediane: r2(ta.validation.monthly_median_abs_pct_error),
              erreur_annuelle_moyenne: r2(ta.validation.annual_mean_abs_pct_error),
              erreur_annuelle_max: r2(ta.validation.annual_max_abs_pct_error),
            }
          : null,
        noaa20_vers_suomi: h.calibration.N ? r2(h.calibration.N.factors_by_month[0]) : null,
        methode: h.calibration_settings.method,
        rapport_annuel_variable: h.diagnostics.yearly_ratio.filter((y) => y.TA !== null).map((y) => ({ annee: y.year, rapport: r2(y.TA) })),
      });
    case "anomalies":
      return json({
        score: "(valeur − médiane) / (1,4826 × écart absolu médian), sur le même mois calendaire des autres années, l'année évaluée exclue",
        seuils: { superieur_ou_inferieur: ANOMALY_SETTINGS.thresholdNotable, tres_superieur: ANOMALY_SETTINGS.thresholdStrong },
        annees_reference_minimum: ANOMALY_SETTINGS.minReferenceYears,
        activite_minimale: ANOMALY_SETTINGS.minActivity,
        mois_non_evalue_si: "plus de 10 % des jours sans capteur en service",
        mois_critiques: "mois qui concentrent 80 % de l'activité médiane annuelle",
        nature: "signal d'analyse, ni preuve ni prédiction",
      });
    case "limites":
      return json([
        "Les nuages et la fumée masquent des feux : une valeur nulle signifie « aucune détection ».",
        "Deux passages par jour par satellite : un feu bref entre deux passages n'est pas vu.",
        "Avant 2012, valeurs estimées depuis MODIS, avec une incertitude affichée.",
        "Petites zones : écarts relatifs instables, fiabilité abaissée.",
        "Grille de 0,05° : deux feux dans la même cellule le même jour comptent pour un.",
        "Limites administratives simplifiées (2005).",
        "Archive figée au 31 décembre 2025 : pas de temps réel.",
      ]);
  }
}
