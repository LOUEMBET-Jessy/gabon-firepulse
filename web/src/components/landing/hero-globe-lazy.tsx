"use client";

/**
 * Chargement differe du globe : MapLibre ne s'execute que dans le navigateur. Pendant le telechargement,
 * la meme sphere que celle du globe occupe la place, pour que l'arrivee du vrai globe soit un fondu.
 */

import dynamic from "next/dynamic";

import { GlobePlaceholder, type GlowCell } from "./globe-placeholder";

const Globe = dynamic(() => import("./hero-globe").then((m) => m.HeroGlobe), {
  ssr: false,
  loading: () => <GlobePlaceholder />,
});

export function HeroGlobeLazy({ cells }: { cells: GlowCell[] }) {
  return <Globe cells={cells} />;
}
