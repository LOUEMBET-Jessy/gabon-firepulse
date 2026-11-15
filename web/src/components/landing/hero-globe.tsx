"use client";

/**
 * Globe de l'accueil : la Terre photorealiste (NASA Blue Marble, relief et fonds marins) avec son atmosphere,
 * les satellites MODIS et VIIRS en orbite, et les cellules reellement actives cette annee (Gabon, France)
 * qui pulsent doucement. Le globe part de l'Afrique et pivote vers le Gabon, puis s'arrete.
 * Arret immediat si l'utilisateur interagit ; globe fixe, sans pulsation, si les animations sont limitees.
 * En attendant le chargement (ou sans WebGL), une sphere bleue occupe exactement la meme place.
 */

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibre, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { ATTRIBUTION, BLUE_MARBLE_TILES } from "@/components/map/basemaps";
import { attachSatellites } from "@/components/map/satellites";
import { FIRE_HEX, MAP_HEX } from "@/lib/palette";

import { GlobePlaceholder, type GlowCell } from "./globe-placeholder";

/** Depart : l'Afrique entiere ; arrivee : le Gabon, legerement decale pour laisser voir l'Europe. */
const START: [number, number] = [18, 8];
const GABON: [number, number] = [11.6, 2];

function style(cells: GlowCell[]): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    sky: {
      "sky-color": MAP_HEX.sky,
      "horizon-color": MAP_HEX.horizon,
      "fog-color": MAP_HEX.fog,
      "sky-horizon-blend": 0.8,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.9,
      "atmosphere-blend": 1,
    },
    sources: {
      earth: { type: "raster", tiles: [BLUE_MARBLE_TILES], tileSize: 256, maxzoom: 8, attribution: ATTRIBUTION.blueMarble },
      world: { type: "geojson", data: "/geo/world.geojson" },
      cells: {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: cells.map(([lon, lat, v]) => ({ type: "Feature", properties: { v }, geometry: { type: "Point", coordinates: [lon, lat] } })),
        },
      },
    },
    layers: [
      { id: "ocean", type: "background", paint: { "background-color": MAP_HEX.fallbackOcean } },
      { id: "earth", type: "raster", source: "earth", paint: { "raster-fade-duration": 400 } },
      {
        id: "focus",
        type: "line",
        source: "world",
        filter: ["match", ["get", "iso"], ["GAB", "FRA"], true, false],
        paint: { "line-color": MAP_HEX.boundaryOnImagery, "line-width": 1, "line-opacity": 0.8 },
      },
      // Halo puis noyau : chaque cellule active rayonne, d'autant plus qu'elle a ete active.
      {
        id: "glow",
        type: "circle",
        source: "cells",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "v"], 0, 2, 0.5, 4, 1, 8],
          "circle-color": FIRE_HEX[2],
          "circle-opacity": ["interpolate", ["linear"], ["get", "v"], 0, 0.12, 1, 0.4],
          "circle-blur": 1,
        },
      },
      {
        id: "core",
        type: "circle",
        source: "cells",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "v"], 0, 0.7, 1, 2],
          "circle-color": ["interpolate", ["linear"], ["get", "v"], 0, FIRE_HEX[2], 0.5, FIRE_HEX[3], 1, FIRE_HEX[4]],
          "circle-opacity": 0.95,
        },
      },
    ],
  };
}

/**
 * Zoom qui donne au globe la taille voulue dans son cadre. En projection globe, le rayon apparent vaut
 * 512 x 2^zoom / 2 pi pixels (verifie : 188 px au zoom 1,2) : on en deduit le zoom, sans mesure fragile.
 */
function fittingZoom(map: MapLibre) {
  const rect = map.getContainer().getBoundingClientRect();
  const canvas = map.getCanvas();
  const w = rect.width || canvas.width / window.devicePixelRatio;
  const h = rect.height || canvas.height / window.devicePixelRatio;
  const target = Math.min(h * 0.5, w * 0.44);
  return target > 0 ? Math.log2((target * 2 * Math.PI) / 512) : 1.9;
}

export function HeroGlobe({ cells }: { cells: GlowCell[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();
  // En defilant, le globe s'eloigne doucement et laisse la place a la suite.
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 700], [0, reduce ? 0 : 120]);
  const opacity = useTransform(scrollY, [0, 700], [1, 0.4]);

  useEffect(() => {
    if (!container.current) return;
    setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let map: MapLibre;
    try {
      map = new MapLibre({
        container: container.current,
        style: style(cells),
        center: still ? GABON : START,
        zoom: 1.2,
        interactive: !coarse,
        scrollZoom: false,
        boxZoom: false,
        doubleClickZoom: false,
        keyboard: false,
        dragRotate: false,
        touchZoomRotate: false,
        attributionControl: { compact: true },
        renderWorldCopies: false,
      });
    } catch {
      return; // WebGL indisponible : la sphere d'attente reste affichee
    }
    const satellites = attachSatellites(map);
    let frame = 0;
    let stopped = still;
    const stop = () => {
      stopped = true;
      map.stop();
    };
    // Les points de feu respirent doucement (fire-3 -> fire-5), sauf animations limitees.
    const pulse = (now: number) => {
      frame = requestAnimationFrame(pulse);
      if (still || document.hidden) return;
      const k = 0.7 + 0.3 * Math.sin(now / 800);
      map.setPaintProperty("glow", "circle-opacity", ["interpolate", ["linear"], ["get", "v"], 0, 0.12 * k, 1, 0.4 * k]);
    };
    map.on("load", () => {
      container.current?.querySelector("details.maplibregl-ctrl-attrib")?.removeAttribute("open");
      const zoom = fittingZoom(map);
      setReady(true);
      if (still) map.jumpTo({ zoom, center: GABON });
      else {
        map.jumpTo({ zoom: zoom - 0.5 });
        // Rotation lente de l'Afrique vers le Gabon, puis arret.
        window.setTimeout(() => {
          if (!stopped) map.easeTo({ center: GABON, zoom, duration: 5200, easing: (t) => 1 - Math.pow(1 - t, 3) });
        }, 400);
      }
      frame = requestAnimationFrame(pulse);
      map.on("resize", () => map.jumpTo({ zoom: fittingZoom(map) }));
    });
    // Toute interaction arrete la rotation automatique.
    map.on("dragstart", stop);
    map.on("mousedown", stop);
    map.on("touchstart", stop);
    return () => {
      cancelAnimationFrame(frame);
      satellites.remove();
      map.remove();
    };
  }, [cells]);

  return (
    <motion.div style={{ y, opacity }} className="relative size-full">
      <GlobePlaceholder visible={!ready} />
      <div
        ref={container}
        role="img"
        aria-label="La Terre vue de l'espace (image NASA Blue Marble) : cellules où des feux ont été détectés par satellite au Gabon et en France, satellites MODIS et VIIRS en orbite."
        className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
      />
    </motion.div>
  );
}
