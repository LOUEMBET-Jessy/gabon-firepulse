"use client";

/**
 * Execution des actions de l'assistant et de la visite guidee, avec les fonctions de l'application :
 * memes setters que les selecteurs, memes routes, memes URL d'export. Rien n'est simule.
 */

import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

import { exportUrl } from "@/lib/api";
import { CONF_LABEL, SATELLITES } from "@/lib/labels";
import { fmtPeriod } from "@/lib/format";
import { PAGES, pageFromPath, type AssistantAction, type AssistantContext } from "@/lib/assistant/protocol";
import { setAssistant } from "@/state/assistant";
import { useFilters } from "@/state/filters";
import { DEFAULT_MAP_FILTERS, getView, setSpotlight, updateView } from "@/state/view";

const PRINT_FLAG = "hotspot.print";

/** Etat de l'application, tel que transmis a l'assistant. */
export function useAssistantContext(): () => AssistantContext {
  const pathname = usePathname();
  const { zone, from, to, country } = useFilters();
  return useCallback(() => {
    const view = getView();
    const f = view.map.filters;
    const page = pageFromPath(pathname);
    const ctx: AssistantContext = { page, country, zone, from, to };
    if (page === "map") {
      ctx.map = {
        mode: view.map.mode,
        sensors: (Object.keys(f.sats) as (keyof typeof f.sats)[]).filter((k) => f.sats[k]),
        confidence: (Object.keys(f.conf) as (keyof typeof f.conf)[]).filter((k) => f.conf[k]),
        sourceType: f.types,
        dayNight: f.dayNight,
      };
    }
    if (page === "calendar") ctx.calendar = { granularity: view.calendar.granularity, month: view.calendar.month };
    if (page === "compare") ctx.compare = { unit: view.compare.unit };
    if (page === "anomalies") ctx.anomalies = { month: view.anomalies.month };
    return ctx;
  }, [pathname, zone, from, to, country]);
}

/** Libelle court d'une action, pour l'accuse de reception dans la conversation. */
export function describeAction(action: AssistantAction): string {
  switch (action.type) {
    case "navigate":
      return `Page ouverte : ${PAGES[action.page].label}`;
    case "set_zone":
      return `Zone : ${action.label}`;
    case "set_period":
      return `Période : ${fmtPeriod(action.from, action.to)}`;
    case "set_map_view": {
      const parts = [action.mode === "grid" ? "grille harmonisée" : action.mode === "points" ? "détections natives" : null];
      if (action.sensors) parts.push(`satellites : ${action.sensors.map((k) => SATELLITES[k].name).join(", ")}`);
      if (action.confidence) parts.push(`confiance : ${action.confidence.map((k) => CONF_LABEL[k].toLowerCase()).join(", ")}`);
      if (action.sourceType && action.sourceType !== "all") parts.push(action.sourceType === "veg" ? "végétation" : "sources statiques");
      if (action.dayNight && action.dayNight !== "all") parts.push(action.dayNight === "day" ? "jour" : "nuit");
      return `Carte : ${parts.filter(Boolean).join(", ") || "ouverte"}`;
    }
    case "set_calendar_view":
      return `Calendrier${action.granularity ? `, vue ${{ month: "mensuelle", week: "hebdomadaire", day: "journalière", year: "annuelle" }[action.granularity]}` : ""}${action.heatMode === "deviation" ? ", écart à la référence" : ""}${action.month ? `, mois ${String(action.month).padStart(2, "0")}/${action.year}` : ""}`;
    case "set_compare_unit":
      return `Comparaison des capteurs : ${{ detections: "détections brutes", celldays: "cellules-jour", calibrated: "après calage" }[action.unit]}`;
    case "open_unusual_periods":
      return `Périodes inhabituelles${action.month ? `, ${String(action.month).padStart(2, "0")}/${action.year}` : ""}`;
    case "highlight":
      return `Mis en évidence : ${action.caption}`;
    case "start_tour":
      return "Visite guidée lancée";
    case "export":
      return action.label;
  }
}

/** Applique une action. Renvoie false si elle n'a pas pu l'etre. */
export function useActionRunner() {
  const router = useRouter();
  const pathname = usePathname();
  const { zone, from, to, setZone, setPeriod } = useFilters();

  const go = useCallback(
    (path: string) => {
      if (pathname !== path) router.push(path);
    },
    [pathname, router],
  );

  return useCallback(
    (action: AssistantAction): boolean => {
      switch (action.type) {
        case "navigate":
          go(PAGES[action.page].path);
          return true;
        case "set_zone":
          setZone(action.zone);
          return true;
        case "set_period":
          setPeriod(action.from, action.to);
          return true;
        case "set_map_view": {
          const current = getView().map;
          const filters = { ...current.filters, sats: { ...current.filters.sats }, conf: { ...current.filters.conf } };
          if (action.sensors) for (const k of Object.keys(filters.sats) as (keyof typeof filters.sats)[]) filters.sats[k] = action.sensors.includes(k);
          if (action.confidence) for (const k of Object.keys(filters.conf) as (keyof typeof filters.conf)[]) filters.conf[k] = action.confidence.includes(k);
          if (action.sourceType) filters.types = action.sourceType;
          if (action.dayNight) filters.dayNight = action.dayNight;
          // basemap de l'assistant : vrai = imagerie satellite (Terre), faux = plan.
          const basemap = action.basemap === undefined ? current.basemap : action.basemap ? (current.basemap === "plan" ? "earth" : current.basemap) : "plan";
          updateView("map", { mode: action.mode ?? current.mode, filters, basemap });
          go("/map");
          return true;
        }
        case "set_calendar_view": {
          const patch: Parameters<typeof updateView<"calendar">>[1] = {};
          if (action.granularity) patch.granularity = action.granularity;
          if (action.heatMode) patch.mode = action.heatMode;
          if (action.year) patch.dayYear = action.year;
          if (action.year && action.month) patch.month = { year: action.year, month: action.month };
          updateView("calendar", patch);
          go("/calendar");
          return true;
        }
        case "set_compare_unit":
          updateView("compare", { unit: action.unit });
          go("/compare");
          return true;
        case "open_unusual_periods":
          updateView("anomalies", {
            direction: action.direction ?? getView().anomalies.direction,
            ...(action.year && action.month ? { month: { year: action.year, month: action.month } } : {}),
          });
          go("/anomalies");
          return true;
        case "highlight":
          setSpotlight({ target: action.target, caption: action.caption });
          return true;
        case "start_tour":
          setAssistant({ tourStep: 0 });
          return true;
        case "export": {
          if (action.kind === "report_pdf") {
            try {
              window.sessionStorage.setItem(PRINT_FLAG, "1");
            } catch {
              /* sans stockage, l'utilisateur imprime depuis la page Rapports */
            }
            go("/reports");
            return true;
          }
          // Memes URL que les boutons d'export de l'application. Les filtres de carte s'appliquent depuis la carte.
          const onMap = pathname === "/map";
          const map = getView().map;
          const url =
            action.kind === "detections"
              ? exportUrl("detections", action.format === "geojson" ? "geojson" : "csv", zone, from, to, onMap && map.mode === "points" ? map.filters : undefined)
              : exportUrl(action.kind, "csv", zone);
          const link = document.createElement("a");
          link.href = url;
          link.download = "";
          document.body.appendChild(link);
          link.click();
          link.remove();
          return true;
        }
      }
    },
    [go, setZone, setPeriod, zone, from, to, pathname],
  );
}

export { DEFAULT_MAP_FILTERS, PRINT_FLAG };
