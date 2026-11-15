"use client";

/**
 * Globe de la page d'accueil : la Terre vue de l'espace, qui tourne lentement, les satellites MODIS et VIIRS
 * en orbite avec leur fauchee, et les cellules reellement actives (Gabon et France) qui brillent.
 *
 * Donnees reelles : cellules calculees cote serveur sur les archives chargees. Le globe se charge apres le
 * premier affichage ; en attendant, une sphere en CSS occupe exactement la meme place (aucun saut de mise en page).
 * Mouvement : rotation lente, arretee si l'utilisateur limite les animations, si l'onglet est cache
 * ou si le globe sort de l'ecran.
 */

import "maplibre-gl/dist/maplibre-gl.css";

import { Map as MapLibre, setWorkerUrl, type StyleSpecification } from "maplibre-gl";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { attachSatellites } from "@/components/map/satellites";

/** Cellule active : longitude et latitude du centre, intensite relative (0 a 1). */
export type GlowCell = [number, number, number];

/** Le globe se balance autour de l'axe Gabon-France : les deux territoires restent toujours visibles. */
const HOME: [number, number] = [8, 20];
const SWING_DEG = 26;
const SWING_PERIOD_S = 150;

/** Rayon apparent du globe en pixels, mesure sur la projection (independant de la version de MapLibre). */
function radiusPx(map: MapLibre) {
  const c = map.getCenter();
  const a = map.project([c.lng, c.lat]);
  const b = map.project([c.lng, c.lat + 10]);
  return Math.hypot(a.x - b.x, a.y - b.y) / Math.sin((10 * Math.PI) / 180);
}

/** Zoom qui donne au globe la taille voulue dans son cadre : grand, legerement coupe sur les grands ecrans. */
function fittingZoom(map: MapLibre) {
  const { clientWidth: w, clientHeight: h } = map.getContainer();
  const target = Math.min(h * 0.52, w * 0.44);
  return map.getZoom() + Math.log2(target / radiusPx(map));
}

function style(cells: GlowCell[]): StyleSpecification {
  return {
    version: 8,
    projection: { type: "globe" },
    sky: {
      "sky-color": "#0b1d3a",
      "horizon-color": "#1f6a92",
      "fog-color": "#0b1830",
      "sky-horizon-blend": 0.7,
      "horizon-fog-blend": 0.6,
      "fog-ground-blend": 0.9,
      "atmosphere-blend": 1,
    },
    sources: {
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
      { id: "ocean", type: "background", paint: { "background-color": "#06122a" } },
      {
        id: "land",
        type: "fill",
        source: "world",
        paint: { "fill-color": ["match", ["get", "iso"], ["GAB", "FRA"], "#183a63", "#0f2442"] },
      },
      { id: "borders", type: "line", source: "world", paint: { "line-color": "#24426a", "line-width": 0.5 } },
      {
        id: "focus",
        type: "line",
        source: "world",
        filter: ["match", ["get", "iso"], ["GAB", "FRA"], true, false],
        paint: { "line-color": "#12bfd2", "line-width": 1.1, "line-opacity": 0.75 },
      },
      // Halo puis noyau : chaque cellule active rayonne, d'autant plus qu'elle a ete active.
      {
        id: "glow",
        type: "circle",
        source: "cells",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "v"], 0, 1.5, 0.5, 4, 1, 9],
          "circle-color": "#f59e0b",
          "circle-opacity": ["interpolate", ["linear"], ["get", "v"], 0, 0.05, 0.5, 0.14, 1, 0.3],
          "circle-blur": 1,
        },
      },
      {
        id: "core",
        type: "circle",
        source: "cells",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["get", "v"], 0, 0.6, 1, 1.9],
          "circle-color": ["interpolate", ["linear"], ["get", "v"], 0, "#c46a12", 0.5, "#f59e0b", 1, "#fff1cf"],
          "circle-opacity": ["interpolate", ["linear"], ["get", "v"], 0, 0.45, 0.4, 0.8, 1, 1],
        },
      },
    ],
  };
}

export function HeroGlobe({ cells }: { cells: GlowCell[] }) {
  const container = useRef<HTMLDivElement>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const reduce = useReducedMotion();
  // En defilant, le globe s'eloigne doucement : il laisse la place a la suite sans disparaitre d'un coup.
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 700], [0, reduce ? 0 : 140]);
  const scale = useTransform(scrollY, [0, 700], [1, reduce ? 1 : 0.9]);
  const opacity = useTransform(scrollY, [0, 700], [1, 0.35]);

  useEffect(() => {
    if (!container.current) return;
    setWorkerUrl("/vendor/maplibre-gl-worker.mjs");
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let map: MapLibre;
    try {
      map = new MapLibre({
        container: container.current,
        style: style(cells),
        center: HOME,
        zoom: 1.2,
        interactive: !coarse,
        scrollZoom: false,
        boxZoom: false,
        doubleClickZoom: false,
        keyboard: false,
        dragRotate: false,
        touchZoomRotate: false,
        attributionControl: false,
        renderWorldCopies: false,
      });
    } catch {
      return; // WebGL indisponible : la sphere CSS reste affichee
    }
    const satellites = attachSatellites(map);
    let frame = 0;
    let paused = false;
    let resumeAt = 0;
    let visible = true;
    let intro = true;
    let clock = 0;
    let last = 0;
    // Balancement lent autour de l'axe Gabon-France ; le temps n'avance que lorsque le globe est visible.
    const spin = (now: number) => {
      frame = requestAnimationFrame(spin);
      const dt = last ? Math.min(now - last, 100) : 0;
      last = now;
      if (still || !visible || document.hidden) return;
      // Les halos respirent lentement : l'archive est vivante, pas une image figee.
      const breath = 0.75 + 0.25 * Math.sin(now / 900);
      map.setPaintProperty("glow", "circle-opacity", ["interpolate", ["linear"], ["get", "v"], 0, 0.05 * breath, 0.5, 0.14 * breath, 1, 0.3 * breath]);
      if (intro || paused || now < resumeAt) return;
      clock += dt / 1000;
      const c = map.getCenter();
      const goal = HOME[0] + SWING_DEG * Math.sin((2 * Math.PI * clock) / SWING_PERIOD_S);
      // Retour en douceur vers le balancement si l'utilisateur a tourne le globe a la main.
      map.setCenter([c.lng + (goal - c.lng) * 0.02, c.lat + (HOME[1] - c.lat) * 0.02]);
    };
    const fit = () => map.jumpTo({ zoom: fittingZoom(map) });
    map.on("load", () => {
      const zoom = fittingZoom(map);
      setReady(true);
      if (still) {
        map.jumpTo({ zoom });
        intro = false;
      } else {
        map.jumpTo({ zoom: zoom - 0.7, center: [HOME[0] - 40, HOME[1]] });
        map.easeTo({ zoom, center: HOME, duration: 2800, easing: (t) => 1 - Math.pow(1 - t, 3) });
        map.once("moveend", () => (intro = false));
      }
      map.on("resize", fit);
      frame = requestAnimationFrame(spin);
    });
    // L'utilisateur fait tourner le globe a la main : la rotation automatique reprend quelques secondes apres.
    map.on("dragstart", () => (paused = true));
    map.on("dragend", () => {
      paused = false;
      resumeAt = performance.now() + 4000;
    });
    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.05 });
    observer.observe(container.current);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      satellites.remove();
      map.remove();
    };
  }, [cells]);

  return (
    <motion.div ref={wrapper} style={{ y, scale, opacity }} className="relative size-full">
      {/* Sphere d'attente : meme place, meme lumiere, remplacee en fondu par le vrai globe. */}
      <div
        aria-hidden
        className={`absolute left-1/2 top-1/2 aspect-square w-[78%] max-w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-1000 ${ready ? "opacity-0" : "opacity-100"}`}
        style={{
          background: "radial-gradient(circle at 38% 34%, #1d4372 0%, #0f2442 45%, #06122a 72%)",
          boxShadow: "0 0 80px 10px rgb(31 106 146 / 0.35), inset -30px -40px 80px rgb(0 0 0 / 0.55)",
        }}
      />
      <div
        ref={container}
        role="img"
        aria-label="Globe terrestre : cellules où des feux ont été détectés par satellite au Gabon et en France, satellites MODIS et VIIRS en orbite."
        className={`absolute inset-0 transition-opacity duration-1000 ${ready ? "opacity-100" : "opacity-0"}`}
      />
    </motion.div>
  );
}
