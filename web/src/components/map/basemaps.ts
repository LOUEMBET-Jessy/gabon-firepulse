/**
 * Fonds de carte : la Terre telle que la voient les satellites.
 *
 *   Terre             NASA GIBS Blue Marble (relief et bathymetrie), relaye par Sentinel-2 cloudless au-dela du zoom 8
 *   Image du jour     NASA GIBS couleurs vraies du jour choisi (VIIRS, ou MODIS Terra avant fin 2015)
 *   Haute resolution  EOX Sentinel-2 cloudless 2023 (10 m)
 *   Plan              OpenFreeMap « liberty » (vectoriel, OpenStreetMap)
 *
 * Seule la source active est chargee (les couches masquees ne demandent aucune tuile). Le relief ombre
 * (Mapzen Terrain Tiles) s'ajoute aux trois vues satellite. Les contours locaux restent par-dessus :
 * blancs a 70 % sur l'imagerie, vert foret sur le plan. Si les tuiles ne repondent pas, le fond simplifie
 * local (aplats et limites) reprend la main.
 */

import type { Map as MapLibre, SourceSpecification, StyleSpecification } from "maplibre-gl";

import { MAP_HEX } from "@/lib/palette";

export type BasemapKind = "earth" | "daily" | "hires" | "plan";

export const BASEMAPS: { value: BasemapKind; label: string; hint: string }[] = [
  { value: "earth", label: "Terre", hint: "NASA Blue Marble, puis Sentinel-2 en zoomant" },
  { value: "daily", label: "Image du jour", hint: "Image satellite du jour sélectionné (NASA GIBS)" },
  { value: "hires", label: "Haute résolution", hint: "Sentinel-2 sans nuages, pixels de 10 m" },
  { value: "plan", label: "Plan", hint: "Routes, villes et noms de lieux (OpenStreetMap)" },
];

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
export const BLUE_MARBLE_TILES = `${GIBS}/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg`;
export const SENTINEL_TILES = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg";
const TERRARIUM_TILES = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const PLAN_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const dailyTiles = (layer: string, date: string) => `${GIBS}/${layer}/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

/** Zoom de relais Blue Marble -> Sentinel-2 dans la vue « Terre ». */
const HANDOFF = 8;

export const ATTRIBUTION = {
  blueMarble: '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> / Blue Marble',
  sentinel: 'Sentinel-2 cloudless – <a href="https://s2maps.eu" target="_blank" rel="noopener">https://s2maps.eu</a> by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2023)',
  daily: '<a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA GIBS</a> / Worldview, image du jour',
  relief: 'Relief : <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">Mapzen Terrain Tiles</a>',
  plan: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>',
  detections: "Détections : NASA FIRMS",
  boundaries: "Limites : geoBoundaries, Natural Earth",
};

/** Sources raster des fonds, a fusionner dans le style de la carte. */
export function basemapSources(): Record<string, SourceSpecification> {
  return {
    "bm-blue-marble": { type: "raster", tiles: [BLUE_MARBLE_TILES], tileSize: 256, maxzoom: 8, attribution: ATTRIBUTION.blueMarble },
    "bm-sentinel": { type: "raster", tiles: [SENTINEL_TILES], tileSize: 256, maxzoom: 17, attribution: ATTRIBUTION.sentinel },
    "bm-daily": { type: "raster", tiles: [dailyTiles("VIIRS_NOAA20_CorrectedReflectance_TrueColor", "2025-01-01")], tileSize: 256, maxzoom: 9, attribution: ATTRIBUTION.daily },
    "bm-dem": { type: "raster-dem", tiles: [TERRARIUM_TILES], tileSize: 256, maxzoom: 15, encoding: "terrarium", attribution: ATTRIBUTION.relief },
    "bm-terrain": { type: "raster-dem", tiles: [TERRARIUM_TILES], tileSize: 256, maxzoom: 15, encoding: "terrarium" },
  };
}

/** Couches des fonds, sous toutes les couches de donnees. Toutes masquees au depart : `applyBasemap` choisit. */
export function basemapLayers(): StyleSpecification["layers"] {
  const hidden = { visibility: "none" as const };
  return [
    { id: "bm-blue-marble", type: "raster", source: "bm-blue-marble", layout: hidden, paint: { "raster-fade-duration": 250 } },
    { id: "bm-sentinel", type: "raster", source: "bm-sentinel", layout: hidden, paint: { "raster-fade-duration": 250 } },
    { id: "bm-daily", type: "raster", source: "bm-daily", layout: hidden, paint: { "raster-fade-duration": 250 } },
    {
      id: "bm-hillshade",
      type: "hillshade",
      source: "bm-dem",
      layout: hidden,
      paint: {
        "hillshade-exaggeration": 0.3,
        "hillshade-shadow-color": MAP_HEX.hillshadeShadow,
        "hillshade-highlight-color": MAP_HEX.hillshadeHighlight,
        "hillshade-accent-color": MAP_HEX.hillshadeShadow,
      },
    },
  ];
}

/** Couches de contour et leur couleur selon le fond : blanc sur l'imagerie, vert foret sur le plan. */
const BOUNDARY_LAYERS: [string, number][] = [
  ["world-line", 0.55],
  ["provinces-line", 0.7],
  ["country-line", 0.85],
  ["departments-line", 0.6],
  ["fra-regions-line", 0.7],
  ["fra-departments-line", 0.55],
];

/** Etat interne du style « Plan » (couches OpenFreeMap ajoutees a la demande). */
const planLayers = new WeakMap<MapLibre, string[]>();
const planLoading = new WeakMap<MapLibre, Promise<void>>();

/** Ajoute une seule fois les sources et couches OpenFreeMap sous la premiere couche de donnees. */
async function ensurePlan(map: MapLibre, beforeId: string): Promise<void> {
  if (planLayers.has(map)) return;
  const existing = planLoading.get(map);
  if (existing) return existing;
  const job = (async () => {
    const style = (await fetch(PLAN_STYLE_URL).then((r) => {
      if (!r.ok) throw new Error(`OpenFreeMap ${r.status}`);
      return r.json();
    })) as StyleSpecification;
    if (style.glyphs) map.setGlyphs(style.glyphs);
    if (typeof style.sprite === "string") map.setSprite(style.sprite);
    for (const [id, source] of Object.entries(style.sources)) {
      if (map.getSource(`ofm-${id}`)) continue;
      const spec = { ...source } as SourceSpecification & { attribution?: string };
      if (spec.type === "vector") spec.attribution = ATTRIBUTION.plan;
      map.addSource(`ofm-${id}`, spec);
    }
    const ids: string[] = [];
    for (const layer of style.layers) {
      if (layer.type === "background") continue;
      const id = `ofm-${layer.id}`;
      const copy = { ...layer, id, ...("source" in layer && layer.source ? { source: `ofm-${layer.source}` } : {}) } as typeof layer;
      map.addLayer(copy, map.getLayer(beforeId) ? beforeId : undefined);
      ids.push(id);
    }
    planLayers.set(map, ids);
  })();
  planLoading.set(map, job);
  try {
    await job;
  } finally {
    planLoading.delete(map);
  }
}

function setVisible(map: MapLibre, id: string, on: boolean) {
  if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
}

function setPaint(map: MapLibre, id: string, property: string, value: unknown) {
  if (map.getLayer(id)) map.setPaintProperty(id, property as never, value as never);
}

export interface BasemapOptions {
  /** Couche et date GIBS pour « Image du jour ». */
  daily?: { layer: string; date: string } | null;
  /** Relief ombre (vues satellite). */
  hillshade?: boolean;
  /** Fond local simplifie : tuiles indisponibles, ou hors ligne. */
  fallback?: boolean;
  /** Premiere couche de donnees, sous laquelle se glisse le plan. */
  beforeId: string;
}

/**
 * Affiche un fond et regle les contours en consequence. Renvoie une promesse resolue quand le fond est pret
 * (le plan charge son style la premiere fois ; une erreur est remontee pour basculer sur le fond local).
 */
export async function applyBasemap(map: MapLibre, kind: BasemapKind, options: BasemapOptions): Promise<void> {
  const { fallback = false, hillshade = true } = options;
  const imagery = kind !== "plan" && !fallback;

  if (kind === "daily" && options.daily) {
    const source = map.getSource("bm-daily") as unknown as { setTiles?: (tiles: string[]) => void } | undefined;
    source?.setTiles?.([dailyTiles(options.daily.layer, options.daily.date)]);
  }
  setVisible(map, "bm-blue-marble", !fallback && kind === "earth");
  // Terre : Blue Marble s'efface au profit de Sentinel-2 au-dela du zoom 8 ; Haute resolution : Sentinel-2 partout.
  setVisible(map, "bm-sentinel", !fallback && (kind === "earth" || kind === "hires"));
  if (map.getLayer("bm-sentinel")) {
    map.setLayerZoomRange("bm-sentinel", kind === "earth" ? HANDOFF - 0.5 : 0, 24);
    setPaint(map, "bm-sentinel", "raster-opacity", kind === "earth" ? ["interpolate", ["linear"], ["zoom"], HANDOFF - 0.5, 0, HANDOFF + 0.3, 1] : 1);
  }
  setVisible(map, "bm-daily", !fallback && kind === "daily");
  setVisible(map, "bm-hillshade", imagery && hillshade);

  if (kind === "plan" && !fallback) await ensurePlan(map, options.beforeId);
  for (const id of planLayers.get(map) ?? []) setVisible(map, id, kind === "plan" && !fallback);

  // Aplats locaux : visibles seulement en secours (sinon l'imagerie ou le plan dessinent la Terre).
  const flat = fallback;
  setPaint(map, "background", "background-color", flat ? MAP_HEX.fallbackOcean : kind === "plan" ? MAP_HEX.planBackground : MAP_HEX.fallbackOcean);
  setPaint(map, "country-fill", "fill-color", MAP_HEX.fallbackLandFocus);
  setPaint(map, "country-fill", "fill-opacity", flat ? 1 : 0);
  if (map.getLayer("world-fill")) {
    setPaint(map, "world-fill", "fill-color", ["case", ["in", ["get", "iso"], ["literal", ["GAB", "FRA"]]], MAP_HEX.fallbackLandFocus, MAP_HEX.fallbackLand]);
    setPaint(map, "world-fill", "fill-opacity", flat ? 1 : 0);
  }
  const lineColor = imagery ? MAP_HEX.boundaryOnImagery : MAP_HEX.boundaryOnPlan;
  for (const [id, opacity] of BOUNDARY_LAYERS) {
    setPaint(map, id, "line-color", lineColor);
    setPaint(map, id, "line-opacity", imagery ? opacity : Math.min(1, opacity + 0.15));
  }
}

/** Sources de fond suivies pour detecter une panne de tuiles. */
export const BASEMAP_SOURCE_OF: Record<BasemapKind, string[]> = {
  earth: ["bm-blue-marble", "bm-sentinel"],
  daily: ["bm-daily"],
  hires: ["bm-sentinel"],
  plan: ["ofm-openmaptiles"],
};

/** Relief 3D (desactive par defaut) : terrain exagere et inclinaison permise. */
export function setRelief3d(map: MapLibre, on: boolean) {
  try {
    map.setTerrain(on ? { source: "bm-terrain", exaggeration: 1.4 } : null);
  } catch {
    /* projection ou navigateur sans terrain : on garde la vue a plat */
    return;
  }
  if (on) {
    map.dragRotate.enable();
    map.easeTo({ pitch: 55, duration: 900 });
  } else {
    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
    map.dragRotate.disable();
  }
}
