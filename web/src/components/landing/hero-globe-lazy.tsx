"use client";

/**
 * Chargement differe du globe : MapLibre ne s'execute que dans le navigateur. Pendant le telechargement,
 * la meme sphere lumineuse que celle du globe occupe la place, pour que l'arrivee du vrai globe soit un fondu.
 */

import dynamic from "next/dynamic";

import type { GlowCell } from "./hero-globe";

export function GlobeSphere() {
  return (
    <div
      aria-hidden
      className="absolute left-1/2 top-1/2 aspect-square w-[78%] max-w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        background: "radial-gradient(circle at 38% 34%, #1d4372 0%, #0f2442 45%, #06122a 72%)",
        boxShadow: "0 0 80px 10px rgb(31 106 146 / 0.35), inset -30px -40px 80px rgb(0 0 0 / 0.55)",
      }}
    />
  );
}

const Globe = dynamic(() => import("./hero-globe").then((m) => m.HeroGlobe), {
  ssr: false,
  loading: () => <GlobeSphere />,
});

export function HeroGlobeLazy({ cells }: { cells: GlowCell[] }) {
  return <Globe cells={cells} />;
}
