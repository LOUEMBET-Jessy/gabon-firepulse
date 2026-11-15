"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibre, Marker, NavigationControl, Popup, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent, type MapTouchEvent, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { activityBreaks } from "@/components/heatmaps";
import { HEAT, SENSOR_COLOR } from "@/lib/labels";

import { attachSatellites, type SatelliteLayer } from "./satellites";
import type { DetectionsResponse, GridResponse, ZoneSpec } from "@/lib/types";

export const GABON_BOUNDS: [[number, number], [number, number]] = [
  [8.45, -4.1],
  [14.75, 2.45],
];

const BASEMAP_TILES =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg";

type Bbox = [number, number, number, number];
type Geometry = { type: string; coordinates: unknown };
type ProvinceFeature = { properties: { index: number; name: string }; geometry: Geometry };

export interface FireMapProps {
  mode: "points" | "grid";
  points: DetectionsResponse["points"] | undefined;
  grid: GridResponse | undefined;
  zone: ZoneSpec;
  selectedIndex?: number | null;
  onSelectDetection?: (index: number | null) => void;
  onSelectCell?: (cell: GridResponse["cells"][number] | null) => void;
  drawing?: boolean;
  onDrawn?: (bbox: Bbox) => void;
  onCancelDraw?: () => void;
  basemap?: boolean;
  onBasemapError?: () => void;
  showProvinces?: boolean;
  /** Carte de synthese : pas de selection ni de controles. */
  passive?: boolean;
  className?: string;
  /** Globe 3D, navigation mondiale, niveaux de detail et regroupement des detections. */
  globe?: boolean;
  /** Arrivee depuis l'espace : la carte part de la vue Terre puis rejoint la zone. */
  intro?: boolean;
  highlight?: Highlight;
  onPickArea?: (pick: AreaPick | null) => void;
  /** Deplacement demande par la navigation : emprise a cadrer, ou vue Terre. `key` relance le vol. */
  flight?: { key: number; bbox: Bbox | null; maxZoom?: number } | null;
  onZoom?: (zoom: number) => void;
  placeRadiusKm?: number;
  /** Satellites MODIS et VIIRS en orbite (illustration, vue Terre seulement). */
  showSatellites?: boolean;
}

const empty = { type: "FeatureCollection" as const, features: [] };

function bboxPolygon([w, s, e, n]: Bbox) {
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] } };
}

function outerRing(geometry: Geometry): number[][] {
  const polygons = (geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) as number[][][][];
  return polygons.reduce((best, p) => (p[0].length > best.length ? p[0] : best), [] as number[][]);
}

function ringBounds(ring: number[][]): Bbox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of ring) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** Carre MODIS dessine sur un canevas : la forme distingue le capteur sans dependre de la couleur. */
function squareIcon(): ImageData {
  const size = 20;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "#0b1830";
  ctx.fillRect(1, 1, size - 2, size - 2);
  ctx.fillStyle = SENSOR_COLOR.modis;
  ctx.fillRect(3, 3, size - 6, size - 6);
  return ctx.getImageData(0, 0, size, size);
}

/* ------------------------------------------------------------------ Globe : style, niveaux de detail, regroupement */

/** Zoom en dessous duquel les detections sont regroupees (vue continent et Terre). */
export const CLUSTER_MAX_ZOOM = 5.4;
/** Seuils de detail : departements, villes, villages. */
const ZOOM_DEPARTMENTS = 6.6;
const ZOOM_TOWNS = 6.2;
const ZOOM_VILLAGES = 9;
/** Vue de depart du globe : l'Afrique centrale vue de l'espace. */
export const SPACE_VIEW = { center: [14, 2] as [number, number], zoom: 1.35 };

export type AreaPick =
  | { kind: "country"; iso: string; name: string; continent: string; bbox: Bbox }
  | { kind: "province"; index: number }
  | { kind: "department"; index: number }
  | { kind: "place"; id: number; name: string; province?: number; department?: number };

export interface Highlight {
  country?: string | null;
  province?: number | null;
  department?: number | null;
}

/** Couches propres au globe, inserees sous les limites du Gabon. */
function globeLayers(): StyleSpecification["layers"] {
  return [
    { id: "world-fill", type: "fill", source: "world", paint: { "fill-color": ["case", ["==", ["get", "iso"], "GAB"], "#163257", "#0f2340"], "fill-opacity": 1 } },
    { id: "world-hover", type: "fill", source: "world", filter: ["==", ["get", "iso"], ""], paint: { "fill-color": "#1b3a63", "fill-opacity": 1 } },
    { id: "world-line", type: "line", source: "world", paint: { "line-color": "#2c4a70", "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.4, 5, 0.9] } },
    { id: "world-active", type: "line", source: "world", filter: ["==", ["get", "iso"], ""], paint: { "line-color": "#12bfd2", "line-width": 2 } },
  ];
}

function placeCircle(lon: number, lat: number, radiusKm: number) {
  const coords: [number, number][] = [];
  const dLat = radiusKm / 111.32;
  const dLon = radiusKm / (111.32 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    coords.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [coords] } };
}

/** Anneau de regroupement : la part de chaque capteur se lit sur le cercle, le total au centre. */
function clusterElement(m: number, s: number, n: number, onClick: () => void): HTMLElement {
  const total = m + s + n;
  const size = total >= 5000 ? 66 : total >= 1000 ? 56 : total >= 100 ? 46 : 36;
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = [
    [m, SENSOR_COLOR.modis],
    [s, SENSOR_COLOR.snpp],
    [n, SENSOR_COLOR.noaa20],
  ]
    .filter(([v]) => (v as number) > 0)
    .map(([v, color]) => {
      const len = ((v as number) / total) * c;
      const arc = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
      offset += len;
      return arc;
    })
    .join("");
  const el = document.createElement("button");
  el.type = "button";
  el.className = "cluster-marker";
  el.setAttribute("aria-label", `${total} détections regroupées : MODIS ${m}, Suomi-NPP ${s}, NOAA-20 ${n}. Zoomer`);
  el.style.width = el.style.height = `${size}px`;
  const label = total >= 10000 ? `${Math.round(total / 1000)} k` : total >= 1000 ? `${(total / 1000).toFixed(1).replace(".", ",")} k` : String(total);
  el.innerHTML = `<svg width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="rgb(8 18 38 / 0.82)"/>${arcs}</svg><span>${label}</span>`;
  el.addEventListener("click", (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

const style: StyleSpecification = {
  version: 8,
  sources: {
    country: { type: "geojson", data: "/geo/country.geojson" },
    provinces: { type: "geojson", data: "/geo/provinces.geojson", promoteId: "index" },
    basemap: {
      type: "raster",
      tiles: [BASEMAP_TILES],
      tileSize: 256,
      maxzoom: 8,
      attribution: "Fond : NASA GIBS, Blue Marble",
    },
    grid: { type: "geojson", data: empty },
    points: { type: "geojson", data: empty },
    selected: { type: "geojson", data: empty },
    zone: { type: "geojson", data: empty },
    draw: { type: "geojson", data: empty },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": "#081226" } },
    {
      id: "basemap",
      type: "raster",
      source: "basemap",
      layout: { visibility: "none" },
      paint: { "raster-brightness-max": 0.5, "raster-saturation": -0.45, "raster-contrast": 0.1, "raster-fade-duration": 200 },
    },
    { id: "country-fill", type: "fill", source: "country", paint: { "fill-color": "#12284a", "fill-opacity": 1 } },
    { id: "grid-fill", type: "fill", source: "grid", paint: { "fill-color": HEAT[1], "fill-opacity": 0.92 } },
    { id: "grid-line", type: "line", source: "grid", minzoom: 8.5, paint: { "line-color": "#081226", "line-width": 0.6 } },
    { id: "provinces-line", type: "line", source: "provinces", paint: { "line-color": "#36557d", "line-width": 0.8 } },
    { id: "country-line", type: "line", source: "country", paint: { "line-color": "#7c95bc", "line-width": 1.2 } },
    {
      id: "province-active",
      type: "line",
      source: "provinces",
      filter: ["==", ["get", "index"], -1],
      paint: { "line-color": "#12bfd2", "line-width": 2 },
    },
    { id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#12bfd2", "line-width": 2 } },
    {
      id: "points-viirs",
      type: "circle",
      source: "points",
      filter: [">=", ["get", "s"], 2],
      paint: {
        "circle-color": ["case", ["==", ["get", "s"], 2], SENSOR_COLOR.snpp, SENSOR_COLOR.noaa20],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.3, 7, 2, 9, 3.4, 12, 6],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.75, 9, 0.9],
        "circle-stroke-color": "#081226",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 1],
      },
    },
    { id: "selected-ring", type: "circle", source: "selected", paint: { "circle-radius": 11, "circle-color": "transparent", "circle-stroke-color": "#f4f7fa", "circle-stroke-width": 2 } },
    { id: "draw-fill", type: "fill", source: "draw", paint: { "fill-color": "#12bfd2", "fill-opacity": 0.12 } },
    { id: "draw-line", type: "line", source: "draw", paint: { "line-color": "#12bfd2", "line-width": 1.5, "line-dasharray": [3, 2] } },
  ],
};

/** Style du globe : pays du monde, departements, localites, regroupements, atmosphere. */
function globeStyle(): StyleSpecification {
  const layers = [...style.layers];
  const at = layers.findIndex((l) => l.id === "country-fill");
  layers.splice(at, 0, ...globeLayers());
  const prov = layers.findIndex((l) => l.id === "provinces-line");
  layers.splice(
    prov,
    0,
    { id: "provinces-pick", type: "fill", source: "provinces", paint: { "fill-color": "#000", "fill-opacity": 0 } },
    { id: "departments-pick", type: "fill", source: "departments", minzoom: ZOOM_DEPARTMENTS - 0.4, paint: { "fill-color": "#000", "fill-opacity": 0 } },
    { id: "departments-line", type: "line", source: "departments", minzoom: ZOOM_DEPARTMENTS - 0.4, paint: { "line-color": "#2c4a70", "line-width": 0.7, "line-dasharray": [2, 2], "line-opacity": ["interpolate", ["linear"], ["zoom"], ZOOM_DEPARTMENTS - 0.4, 0, ZOOM_DEPARTMENTS + 0.3, 1] } },
  );
  const zoneLine = layers.findIndex((l) => l.id === "zone-line");
  layers.splice(
    zoneLine,
    0,
    { id: "department-active", type: "line", source: "departments", filter: ["==", ["get", "index"], -1], paint: { "line-color": "#5ad8e6", "line-width": 2 } },
    { id: "zone-fill", type: "fill", source: "zone", paint: { "fill-color": "#12bfd2", "fill-opacity": 0.08 } },
  );
  layers.push(
    { id: "villages", type: "circle", source: "places", minzoom: ZOOM_VILLAGES, filter: ["==", ["get", "kind"], "village"], paint: { "circle-radius": 2.4, "circle-color": "#b9c6d8", "circle-opacity": 0.75, "circle-stroke-color": "#081226", "circle-stroke-width": 1 } },
    { id: "cluster-dots", type: "circle", source: "clusters", maxzoom: CLUSTER_MAX_ZOOM, filter: ["!", ["has", "point_count"]], paint: { "circle-radius": 2.5, "circle-color": ["case", ["<", ["get", "s"], 2], SENSOR_COLOR.modis, ["==", ["get", "s"], 2], SENSOR_COLOR.snpp, SENSOR_COLOR.noaa20], "circle-stroke-color": "#081226", "circle-stroke-width": 1 } },
  );
  return {
    ...style,
    projection: { type: "globe" },
    sky: {
      "sky-color": "#0b1d3a",
      "horizon-color": "#1a4f78",
      "fog-color": "#0b1830",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.8,
      "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7.5, 0],
    },
    sources: {
      ...style.sources,
      world: { type: "geojson", data: "/geo/world.geojson" },
      departments: { type: "geojson", data: "/geo/departments.geojson" },
      places: { type: "geojson", data: "/geo/places.geojson" },
      clusters: {
        type: "geojson",
        data: empty,
        cluster: true,
        clusterMaxZoom: CLUSTER_MAX_ZOOM,
        clusterRadius: 46,
        clusterProperties: {
          m: ["+", ["case", ["<", ["get", "s"], 2], 1, 0]],
          v: ["+", ["case", ["==", ["get", "s"], 2], 1, 0]],
          w: ["+", ["case", ["==", ["get", "s"], 3], 1, 0]],
        },
      },
    },
    layers,
  };
}

const CONTINENT_LABELS: [string, number, number][] = [
  ["Afrique", 20, 6],
  ["Europe", 15, 52],
  ["Asie", 90, 45],
  ["Amérique du Nord", -100, 45],
  ["Amérique du Sud", -60, -15],
  ["Océanie", 135, -25],
];

let workerConfigured = false;

export default function FireMap(props: FireMapProps) {
  const { mode, points, grid, zone, selectedIndex, drawing, basemap, showProvinces = true, passive, className, globe, intro, highlight, flight, placeRadiusKm = 15 } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const callbacks = useRef(props);
  const provincesRef = useRef<ProvinceFeature[]>([]);
  const labelsRef = useRef<Marker[]>([]);
  const departmentsRef = useRef<ProvinceFeature[]>([]);
  const placesRef = useRef<Map<number, { lon: number; lat: number; name: string }>>(new Map());
  const detailMarkers = useRef<{ marker: Marker; min: number; max: number }[]>([]);
  const satellitesRef = useRef<SatelliteLayer | null>(null);
  const [ready, setReady] = useState(false);
  const introDone = useRef(false);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    callbacks.current = props;
  });

  // Creation de la carte (une seule fois).
  useEffect(() => {
    if (!container.current) return;
    if (!workerConfigured) {
      setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
      workerConfigured = true;
    }
    let map: MapLibre;
    try {
      map = new MapLibre({
        container: container.current,
        style: globe ? globeStyle() : style,
        ...(globe && intro ? { center: SPACE_VIEW.center, zoom: SPACE_VIEW.zoom } : { bounds: GABON_BOUNDS, fitBoundsOptions: { padding: passive ? 12 : 40 } }),
        minZoom: globe ? 0.6 : 4,
        maxZoom: globe ? 14 : 13,
        ...(globe
          ? {}
          : {
              maxBounds: [
                [2, -10],
                [21, 8.5],
              ] as [[number, number], [number, number]],
            }),
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        interactive: !passive,
        cooperativeGestures: false,
      });
    } catch (error) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- echec d'initialisation WebGL signale a l'utilisateur
      setFailed(error instanceof Error ? error.message : "WebGL indisponible");
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    if (!passive) {
      map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      map.addControl(new ScaleControl({ unit: "metric", maxWidth: 110 }), "bottom-left");
    }

    map.on("error", (event) => {
      const sourceId = (event as unknown as { sourceId?: string }).sourceId;
      if (sourceId === "basemap") callbacks.current.onBasemapError?.();
    });

    map.on("load", () => {
      map.addImage("modis-square", squareIcon(), { pixelRatio: 2 });
      map.addLayer(
        {
          id: "points-modis",
          type: "symbol",
          source: "points",
          filter: ["<", ["get", "s"], 2],
          layout: {
            "icon-image": "modis-square",
            "icon-size": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 7, 0.58, 9, 0.95, 12, 1.7],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
          paint: { "icon-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 9, 0.95] },
        },
        "points-viirs",
      );
      if (globe) {
        // Detections une a une a partir de l'echelle du pays ; regroupees en dessous.
        map.setLayerZoomRange("points-viirs", CLUSTER_MAX_ZOOM, 24);
        map.setLayerZoomRange("points-modis", CLUSTER_MAX_ZOOM, 24);
      }
      setReady(true);
    });

    // Etiquettes de provinces en HTML : aucune police distante n'est necessaire.
    fetch("/geo/provinces.geojson")
      .then((r) => r.json())
      .then((collection: { features: ProvinceFeature[] }) => {
        provincesRef.current = collection.features;
        if (passive) return;
        labelsRef.current = collection.features.map((feature) => {
          const [w, s, e, n] = ringBounds(outerRing(feature.geometry));
          const el = document.createElement("div");
          el.textContent = feature.properties.name;
          el.className = "pointer-events-none select-none whitespace-nowrap text-[10.5px] font-medium tracking-wide text-ink-2/80 [text-shadow:0_1px_3px_#081226,0_0_2px_#081226]";
          return new Marker({ element: el, anchor: "center" }).setLngLat([(w + e) / 2, (s + n) / 2]).addTo(map);
        });
      })
      .catch(() => {
        /* les limites sont un contexte facultatif : la carte reste utilisable sans etiquettes */
      });

    if (globe && !passive) {
      satellitesRef.current = attachSatellites(map);
      satellitesRef.current.setVisible(callbacks.current.showSatellites !== false);
    }
    if (globe) {
      const label = (text: string, cls: string, lngLat: [number, number], min: number, max: number) => {
        const el = document.createElement("div");
        el.textContent = text;
        el.className = `map-label ${cls}`;
        el.style.display = "none";
        detailMarkers.current.push({ marker: new Marker({ element: el, anchor: "center", opacityWhenCovered: "0" }).setLngLat(lngLat).addTo(map), min, max });
      };
      CONTINENT_LABELS.forEach(([name, lon, lat]) => label(name, "map-label-continent", [lon, lat], 0, 3.2));
      fetch("/geo/departments.geojson")
        .then((r) => r.json())
        .then((c: { features: (ProvinceFeature & { properties: { label?: [number, number] } })[] }) => {
          departmentsRef.current = c.features;
          c.features.forEach((f) => {
            const [w, s, e, n] = ringBounds(outerRing(f.geometry));
            label(f.properties.name, "map-label-department", [(w + e) / 2, (s + n) / 2], ZOOM_DEPARTMENTS + 0.3, 24);
          });
          syncLabels();
        })
        .catch(() => {});
      fetch("/geo/places.geojson")
        .then((r) => r.json())
        .then((c: { features: { properties: { id: number; name: string; kind: string; pop: number }; geometry: { coordinates: [number, number] } }[] }) => {
          for (const f of c.features) {
            placesRef.current.set(f.properties.id, { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: f.properties.name });
            if (f.properties.kind === "village") continue;
            const min = f.properties.kind === "capital" ? 4.2 : f.properties.kind === "admin" || f.properties.pop >= 100000 ? ZOOM_TOWNS : f.properties.pop >= 20000 ? ZOOM_TOWNS + 1.2 : ZOOM_TOWNS + 1.8;
            label(f.properties.name, f.properties.kind === "capital" ? "map-label-capital" : "map-label-town", f.geometry.coordinates, min, 24);
          }
          syncLabels();
        })
        .catch(() => {});
      const syncLabels = () => {
        const z = map.getZoom();
        for (const { marker, min, max } of detailMarkers.current) marker.getElement().style.display = z >= min && z < max ? "" : "none";
        labelsRef.current.forEach((m) => (m.getElement().style.visibility = z >= 4.6 && z < ZOOM_DEPARTMENTS + 0.3 ? "" : "hidden"));
        callbacks.current.onZoom?.(z);
      };
      map.on("zoom", syncLabels);
      map.once("idle", syncLabels);

      // Regroupements : un anneau par groupe, reconstruit quand la vue change.
      const clusterMarkers = new Map<number, Marker>();
      const drawClusters = () => {
        if (!map.getSource("clusters") || !map.isSourceLoaded("clusters")) return;
        const keep = new Set<number>();
        if (map.getZoom() < CLUSTER_MAX_ZOOM && callbacks.current.mode === "points") {
          for (const f of map.querySourceFeatures("clusters")) {
            const props = f.properties as { cluster?: boolean; cluster_id: number; m: number; v: number; w: number };
            if (!props.cluster || keep.has(props.cluster_id)) continue;
            keep.add(props.cluster_id);
            if (clusterMarkers.has(props.cluster_id)) continue;
            const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
            const el = clusterElement(props.m, props.v, props.w, async () => {
              const zoom = await (map.getSource("clusters") as GeoJSONSource).getClusterExpansionZoom(props.cluster_id);
              map.easeTo({ center: [lon, lat], zoom: Math.max(zoom, map.getZoom() + 1.2), duration: 900 });
            });
            clusterMarkers.set(props.cluster_id, new Marker({ element: el, opacityWhenCovered: "0" }).setLngLat([lon, lat]).addTo(map));
          }
        }
        for (const [id, marker] of clusterMarkers) {
          if (!keep.has(id)) {
            marker.remove();
            clusterMarkers.delete(id);
          }
        }
      };
      map.on("render", drawClusters);
    }

    if (!passive) {
      const tooltip = new Popup({ closeButton: false, closeOnClick: false, className: "map-tooltip", offset: 10 });
      const pickArea = (event: MapMouseEvent): AreaPick | null => {
        const z = map.getZoom();
        const at = (layer: string) => (map.getLayer(layer) ? map.queryRenderedFeatures(event.point, { layers: [layer] }) : []);
        if (z < 4.4) {
          const c = at("world-fill")[0];
          if (!c) return null;
          const props = c.properties as { iso: string; name: string; continent: string };
          const ring = outerRing(c.geometry as unknown as Geometry);
          return { kind: "country", iso: props.iso, name: props.name, continent: props.continent, bbox: ringBounds(ring) };
        }
        const village = z >= ZOOM_VILLAGES ? at("villages")[0] : undefined;
        if (village) return { kind: "place", id: Number(village.properties.id), name: String(village.properties.name), province: Number(village.properties.province), department: Number(village.properties.department) };
        const dept = z >= ZOOM_DEPARTMENTS ? at("departments-pick")[0] : undefined;
        if (dept) return { kind: "department", index: Number(dept.properties.index) };
        const prov = at("provinces-pick")[0];
        if (prov) return { kind: "province", index: Number(prov.properties.index) };
        const c = at("world-fill")[0];
        if (c) {
          const props = c.properties as { iso: string; name: string; continent: string };
          return { kind: "country", iso: props.iso, name: props.name, continent: props.continent, bbox: ringBounds(outerRing(c.geometry as unknown as Geometry)) };
        }
        return null;
      };
      if (globe) {
        map.on("mousemove", (event) => {
          if (callbacks.current.drawing) return;
          const z = map.getZoom();
          const layer = z < 4.4 ? "world-fill" : z >= ZOOM_VILLAGES ? "villages" : null;
          const hit = layer && map.getLayer(layer) ? map.queryRenderedFeatures(event.point, { layers: [layer] })[0] : undefined;
          if (z < 4.4) map.setFilter("world-hover", ["==", ["get", "iso"], hit ? String(hit.properties.iso) : ""]);
          if (hit) {
            const props = hit.properties as { name: string; continent?: string; iso?: string };
            const detail = props.iso ? (props.iso === "GAB" ? "Données de détection disponibles" : props.continent) : "Localité";
            tooltip.setLngLat(event.lngLat).setHTML(`<strong>${props.name}</strong><span>${detail ?? ""}</span>`).addTo(map);
          } else tooltip.remove();
        });
        map.on("mouseout", () => {
          tooltip.remove();
          map.setFilter("world-hover", ["==", ["get", "iso"], ""]);
        });
      }
      const pick = (event: MapMouseEvent) => {
        const cb = callbacks.current;
        if (cb.drawing) return;
        const box: [[number, number], [number, number]] = [
          [event.point.x - 5, event.point.y - 5],
          [event.point.x + 5, event.point.y + 5],
        ];
        if (cb.mode === "points") {
          const hits = map.getZoom() >= (globe ? CLUSTER_MAX_ZOOM : 0) ? map.queryRenderedFeatures(box, { layers: ["points-modis", "points-viirs"].filter((id) => map.getLayer(id)) }) : [];
          cb.onSelectDetection?.(hits.length ? Number(hits[0].properties.i) : null);
          if (hits.length) return;
        } else {
          const hits = map.queryRenderedFeatures(event.point, { layers: ["grid-fill"] });
          const id = hits.length ? Number(hits[0].properties.c) : null;
          cb.onSelectCell?.(id === null ? null : (cb.grid?.cells.find((c) => c.cell === id) ?? null));
          if (id !== null) return;
        }
        if (globe) cb.onPickArea?.(pickArea(event));
      };
      map.on("click", pick);
      const hover = (event: MapMouseEvent) => {
        const cb = callbacks.current;
        if (cb.drawing) return;
        const layers = (cb.mode === "points" ? ["points-modis", "points-viirs"] : ["grid-fill"]).filter((id) => map.getLayer(id));
        map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(event.point, { layers }).length ? "pointer" : "";
      };
      map.on("mousemove", hover);
    }

    return () => {
      labelsRef.current.forEach((m) => m.remove());
      labelsRef.current = [];
      detailMarkers.current.forEach(({ marker }) => marker.remove());
      detailMarkers.current = [];
      satellitesRef.current?.remove();
      satellitesRef.current = null;
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carte creee une seule fois ; globe et intro sont fixes pour une instance
  }, [passive]);

  // Detections natives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("points") as GeoJSONSource;
    const clusters = map.getSource("clusters") as GeoJSONSource | undefined;
    if (mode !== "points" || !points) {
      clusters?.setData(empty);
      return void source.setData(empty);
    }
    const features = new Array(points.index.length);
    for (let i = 0; i < points.index.length; i++) {
      features[i] = { type: "Feature", geometry: { type: "Point", coordinates: [points.lon[i], points.lat[i]] }, properties: { i: points.index[i], s: points.sat[i] } };
    }
    source.setData({ type: "FeatureCollection", features });
    clusters?.setData({ type: "FeatureCollection", features });
  }, [points, mode, ready]);

  // Grille harmonisee.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("grid") as GeoJSONSource;
    if (mode !== "grid" || !grid) return void source.setData(empty);
    const step = grid.step;
    source.setData({
      type: "FeatureCollection",
      features: grid.cells.map((c) => ({
        type: "Feature",
        properties: { c: c.cell, h: c.harmonized },
        geometry: { type: "Polygon", coordinates: [[[c.lon, c.lat], [c.lon + step, c.lat], [c.lon + step, c.lat + step], [c.lon, c.lat + step], [c.lon, c.lat]]] },
      })),
    });
    const breaks = activityBreaks(grid.cells.map((c) => c.harmonized));
    const expression: unknown[] = ["step", ["get", "h"], HEAT[1]];
    breaks.forEach((b, i) => expression.push(b, HEAT[1 + Math.round(((i + 1) / breaks.length) * 6)]));
    map.setPaintProperty("grid-fill", "fill-color", breaks.length ? (expression as never) : HEAT[3]);
  }, [grid, mode, ready]);

  // Detection selectionnee.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("selected") as GeoJSONSource;
    const at = points && selectedIndex !== null && selectedIndex !== undefined ? points.index.indexOf(selectedIndex) : -1;
    source.setData(at >= 0 && points ? { type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [points.lon[at], points.lat[at]] } }] } : empty);
  }, [selectedIndex, points, ready]);

  // Zone d'analyse : surlignage et cadrage.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const zoneSource = map.getSource("zone") as GeoJSONSource;
    const wide = globe && map.getContainer().clientWidth > 900;
    const padding = passive ? 12 : wide ? { top: 64, bottom: 72, left: 390, right: 64 } : 48;
    map.setFilter("province-active", ["==", ["get", "index"], zone.kind === "province" ? zone.index : -1]);
    const duration = globe ? (intro && !introDone.current ? 2600 : 1400) : 500;
    introDone.current = true;
    if (zone.kind === "bbox") {
      zoneSource.setData({ type: "FeatureCollection", features: [bboxPolygon(zone.bbox)] });
      const [w, s, e, n] = zone.bbox;
      map.fitBounds([[w, s], [e, n]], { padding, duration, maxZoom: 10 });
      return;
    }
    if (zone.kind === "place") {
      const fitPlace = () => {
        const place = placesRef.current.get(zone.id);
        if (!place) return false;
        const circle = placeCircle(place.lon, place.lat, placeRadiusKm);
        zoneSource.setData({ type: "FeatureCollection", features: [circle] });
        const [w, s, e, n] = ringBounds(circle.geometry.coordinates[0]);
        map.fitBounds([[w, s], [e, n]], { padding, duration, maxZoom: 11 });
        return true;
      };
      if (!fitPlace()) {
        const timer = window.setTimeout(fitPlace, 900);
        return () => window.clearTimeout(timer);
      }
      return;
    }
    zoneSource.setData(empty);
    if (zone.kind === "country") return void map.fitBounds(GABON_BOUNDS, { padding: passive ? 12 : wide ? padding : 40, duration });
    const fit = () => {
      const list = zone.kind === "department" ? departmentsRef.current : provincesRef.current;
      const feature = list.find((f) => f.properties.index === zone.index);
      if (feature && zone.kind === "department" && map.getLayer("department-active")) map.setFilter("department-active", ["==", ["get", "index"], zone.index]);
      if (!feature) return false;
      const [w, s, e, n] = ringBounds(outerRing(feature.geometry));
      map.fitBounds([[w, s], [e, n]], { padding, duration, maxZoom: zone.kind === "department" ? 10 : 9.5 });
      return true;
    };
    if (!fit()) {
      const timer = window.setTimeout(fit, 900);
      return () => window.clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- le cadrage suit la zone ; les autres valeurs sont fixes pour une instance
  }, [zone, ready, passive]);

  // Surlignage du territoire selectionne sur le globe (sans changer la zone d'analyse).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !globe) return;
    map.setFilter("world-active", ["==", ["get", "iso"], highlight?.country ?? ""]);
    if (highlight?.province !== undefined && highlight.province !== null) map.setFilter("province-active", ["==", ["get", "index"], highlight.province]);
    else map.setFilter("province-active", ["==", ["get", "index"], zone.kind === "province" ? zone.index : -1]);
    map.setFilter("department-active", ["==", ["get", "index"], highlight?.department ?? (zone.kind === "department" ? zone.index : -1)]);
  }, [highlight, zone, ready, globe]);

  useEffect(() => {
    satellitesRef.current?.setVisible(props.showSatellites !== false);
  }, [props.showSatellites, ready]);

  // Vols demandes par la navigation (fil d'Ariane, recherche, continents).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flight) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!flight.bbox) {
      map.flyTo({ center: SPACE_VIEW.center, zoom: SPACE_VIEW.zoom + 0.25, duration: reduce ? 0 : 2200, essential: true });
      return;
    }
    const [w, s, e, n] = flight.bbox;
    const padding = map.getContainer().clientWidth > 900 ? { top: 64, bottom: 72, left: 390, right: 64 } : 40;
    map.fitBounds([[w, s], [e, n]], { padding, maxZoom: flight.maxZoom ?? 9.5, duration: reduce ? 0 : 2000, essential: true, curve: 1.5 });
  }, [flight, ready]);

  // Couches de contexte.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("basemap", "visibility", basemap ? "visible" : "none");
    map.setPaintProperty("country-fill", "fill-opacity", basemap ? 0 : 1);
    map.setLayoutProperty("provinces-line", "visibility", showProvinces ? "visible" : "none");
    labelsRef.current.forEach((m) => (m.getElement().style.display = showProvinces ? "" : "none"));
  }, [basemap, showProvinces, ready]);

  // Dessin d'un rectangle (souris et tactile).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !drawing) return;
    const source = map.getSource("draw") as GeoJSONSource;
    let start: [number, number] | null = null;
    let current: [number, number] | null = null;
    map.dragPan.disable();
    map.getCanvas().style.cursor = "crosshair";

    const box = (): Bbox | null =>
      start && current ? [Math.min(start[0], current[0]), Math.min(start[1], current[1]), Math.max(start[0], current[0]), Math.max(start[1], current[1])] : null;
    const down = (e: MapMouseEvent | MapTouchEvent) => {
      e.preventDefault();
      start = [e.lngLat.lng, e.lngLat.lat];
      current = start;
    };
    const move = (e: MapMouseEvent | MapTouchEvent) => {
      if (!start) return;
      current = [e.lngLat.lng, e.lngLat.lat];
      const b = box();
      if (b) source.setData({ type: "FeatureCollection", features: [bboxPolygon(b)] });
    };
    const up = () => {
      const b = box();
      start = null;
      source.setData(empty);
      if (b && b[2] - b[0] > 0.02 && b[3] - b[1] > 0.02) {
        const r = (v: number) => Math.round(v * 1000) / 1000;
        callbacks.current.onDrawn?.([r(b[0]), r(b[1]), r(b[2]), r(b[3])]);
      }
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") callbacks.current.onCancelDraw?.();
    };
    map.on("mousedown", down);
    map.on("mousemove", move);
    map.on("mouseup", up);
    map.on("touchstart", down);
    map.on("touchmove", move);
    map.on("touchend", up);
    window.addEventListener("keydown", key);
    return () => {
      map.off("mousedown", down);
      map.off("mousemove", move);
      map.off("mouseup", up);
      map.off("touchstart", down);
      map.off("touchmove", move);
      map.off("touchend", up);
      window.removeEventListener("keydown", key);
      source.setData(empty);
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
  }, [drawing, ready]);

  if (failed) {
    return (
      <div className={className}>
        <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <p className="text-[14px] font-medium text-ink">La carte ne peut pas s'afficher</p>
          <p className="max-w-[46ch] text-[13px] text-ink-3">Le navigateur n'a pas pu initialiser WebGL ({failed}). Les autres écrans restent utilisables : calendrier, tendances et exports.</p>
        </div>
      </div>
    );
  }
  // MapLibre impose "position: relative" a son conteneur : la mise en page est portee par l'element parent.
  return (
    <div className={className}>
      <div ref={container} className="size-full" aria-label={globe ? "Globe terrestre et carte du Gabon" : "Carte du Gabon"} />
    </div>
  );
}
