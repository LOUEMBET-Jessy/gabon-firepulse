"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibre, Marker, NavigationControl, ScaleControl, setWorkerUrl, type GeoJSONSource, type MapMouseEvent, type MapTouchEvent, type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import { activityBreaks } from "@/components/heatmaps";
import { HEAT, SENSOR_COLOR } from "@/lib/labels";
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
  ctx.fillStyle = "#080d18";
  ctx.fillRect(1, 1, size - 2, size - 2);
  ctx.fillStyle = SENSOR_COLOR.modis;
  ctx.fillRect(3, 3, size - 6, size - 6);
  return ctx.getImageData(0, 0, size, size);
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
    { id: "background", type: "background", paint: { "background-color": "#070b14" } },
    {
      id: "basemap",
      type: "raster",
      source: "basemap",
      layout: { visibility: "none" },
      paint: { "raster-brightness-max": 0.5, "raster-saturation": -0.45, "raster-contrast": 0.1, "raster-fade-duration": 200 },
    },
    { id: "country-fill", type: "fill", source: "country", paint: { "fill-color": "#111a2d", "fill-opacity": 1 } },
    { id: "grid-fill", type: "fill", source: "grid", paint: { "fill-color": HEAT[1], "fill-opacity": 0.92 } },
    { id: "grid-line", type: "line", source: "grid", minzoom: 8.5, paint: { "line-color": "#070b14", "line-width": 0.6 } },
    { id: "provinces-line", type: "line", source: "provinces", paint: { "line-color": "#3a4b6e", "line-width": 0.8 } },
    { id: "country-line", type: "line", source: "country", paint: { "line-color": "#6a7ea6", "line-width": 1.2 } },
    {
      id: "province-active",
      type: "line",
      source: "provinces",
      filter: ["==", ["get", "index"], -1],
      paint: { "line-color": "#56c8ee", "line-width": 2 },
    },
    { id: "zone-line", type: "line", source: "zone", paint: { "line-color": "#56c8ee", "line-width": 2 } },
    {
      id: "points-viirs",
      type: "circle",
      source: "points",
      filter: [">=", ["get", "s"], 2],
      paint: {
        "circle-color": ["case", ["==", ["get", "s"], 2], SENSOR_COLOR.snpp, SENSOR_COLOR.noaa20],
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 1.3, 7, 2, 9, 3.4, 12, 6],
        "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.75, 9, 0.9],
        "circle-stroke-color": "#070b14",
        "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 7, 0, 9, 1],
      },
    },
    { id: "selected-ring", type: "circle", source: "selected", paint: { "circle-radius": 11, "circle-color": "transparent", "circle-stroke-color": "#e9edf5", "circle-stroke-width": 2 } },
    { id: "draw-fill", type: "fill", source: "draw", paint: { "fill-color": "#56c8ee", "fill-opacity": 0.12 } },
    { id: "draw-line", type: "line", source: "draw", paint: { "line-color": "#56c8ee", "line-width": 1.5, "line-dasharray": [3, 2] } },
  ],
};

let workerConfigured = false;

export default function FireMap(props: FireMapProps) {
  const { mode, points, grid, zone, selectedIndex, drawing, basemap, showProvinces = true, passive, className } = props;
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const callbacks = useRef(props);
  const provincesRef = useRef<ProvinceFeature[]>([]);
  const labelsRef = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
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
        style,
        bounds: GABON_BOUNDS,
        fitBoundsOptions: { padding: passive ? 12 : 40 },
        minZoom: 4,
        maxZoom: 13,
        maxBounds: [
          [2, -10],
          [21, 8.5],
        ],
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
          el.className = "pointer-events-none select-none whitespace-nowrap text-[10.5px] font-medium tracking-wide text-ink-2/80 [text-shadow:0_1px_3px_#070b14,0_0_2px_#070b14]";
          return new Marker({ element: el, anchor: "center" }).setLngLat([(w + e) / 2, (s + n) / 2]).addTo(map);
        });
      })
      .catch(() => {
        /* les limites sont un contexte facultatif : la carte reste utilisable sans etiquettes */
      });

    if (!passive) {
      const pick = (event: MapMouseEvent) => {
        const cb = callbacks.current;
        if (cb.drawing) return;
        const box: [[number, number], [number, number]] = [
          [event.point.x - 5, event.point.y - 5],
          [event.point.x + 5, event.point.y + 5],
        ];
        if (cb.mode === "points") {
          const hits = map.queryRenderedFeatures(box, { layers: ["points-modis", "points-viirs"].filter((id) => map.getLayer(id)) });
          cb.onSelectDetection?.(hits.length ? Number(hits[0].properties.i) : null);
        } else {
          const hits = map.queryRenderedFeatures(event.point, { layers: ["grid-fill"] });
          const id = hits.length ? Number(hits[0].properties.c) : null;
          cb.onSelectCell?.(id === null ? null : (cb.grid?.cells.find((c) => c.cell === id) ?? null));
        }
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
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, [passive]);

  // Detections natives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("points") as GeoJSONSource;
    if (mode !== "points" || !points) return void source.setData(empty);
    const features = new Array(points.index.length);
    for (let i = 0; i < points.index.length; i++) {
      features[i] = { type: "Feature", geometry: { type: "Point", coordinates: [points.lon[i], points.lat[i]] }, properties: { i: points.index[i], s: points.sat[i] } };
    }
    source.setData({ type: "FeatureCollection", features });
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
    const padding = passive ? 12 : 48;
    map.setFilter("province-active", ["==", ["get", "index"], zone.kind === "province" ? zone.index : -1]);
    if (zone.kind === "bbox") {
      zoneSource.setData({ type: "FeatureCollection", features: [bboxPolygon(zone.bbox)] });
      const [w, s, e, n] = zone.bbox;
      map.fitBounds([[w, s], [e, n]], { padding, duration: 500, maxZoom: 10 });
      return;
    }
    zoneSource.setData(empty);
    if (zone.kind === "country") return void map.fitBounds(GABON_BOUNDS, { padding: passive ? 12 : 40, duration: 500 });
    const fit = () => {
      const feature = provincesRef.current.find((f) => f.properties.index === zone.index);
      if (!feature) return false;
      const [w, s, e, n] = ringBounds(outerRing(feature.geometry));
      map.fitBounds([[w, s], [e, n]], { padding, duration: 500, maxZoom: 9.5 });
      return true;
    };
    if (!fit()) {
      const timer = window.setTimeout(fit, 600);
      return () => window.clearTimeout(timer);
    }
  }, [zone, ready, passive]);

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
      <div ref={container} className="size-full" aria-label="Carte du Gabon" />
    </div>
  );
}
