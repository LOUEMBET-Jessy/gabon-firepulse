"use client";

/**
 * « Du globe a la foret » : en defilant, l'image passe de l'Afrique vue de l'espace (NASA Blue Marble)
 * au Gabon, puis a une province en haute resolution (Sentinel-2), avec trois legendes sur ce que voit
 * un satellite. Images : vraies tuiles des services de la carte. Version statique (trois vignettes)
 * si l'utilisateur limite les animations.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { BLUE_MARBLE_TILES, SENTINEL_TILES } from "@/components/map/basemaps";
import { cx } from "@/lib/classes";

const tile = (template: string, z: number, x: number, y: number) => template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/** Quatre tuiles voisines (2 x 2) : une image nette de 512 px. */
const mosaic = (template: string, z: number, x: number, y: number) => [tile(template, z, x, y), tile(template, z, x + 1, y), tile(template, z, x, y + 1), tile(template, z, x + 1, y + 1)];

const STEPS = [
  {
    title: "Vue de l'espace",
    text: "À 705 km (MODIS) et 824 km (VIIRS) d'altitude, les satellites de la NASA photographient toute la Terre au moins deux fois par jour.",
    tiles: mosaic(BLUE_MARBLE_TILES, 3, 4, 3),
    credit: "NASA Blue Marble",
  },
  {
    title: "Au-dessus du Gabon",
    text: "Chaque pixel nettement plus chaud que ses voisins devient une détection : un carré de 1 km pour MODIS, de 375 m pour VIIRS.",
    tiles: mosaic(BLUE_MARBLE_TILES, 6, 33, 31),
    credit: "NASA Blue Marble",
  },
  {
    title: "Jusqu'à la forêt",
    text: "Une détection n'est pas un incendie confirmé : c'est un pixel chaud, à vérifier sur le terrain. Hot-Spots les compte par cellule de 5 km pour comparer les années.",
    tiles: mosaic(SENTINEL_TILES, 10, 550, 516),
    credit: "Sentinel-2 cloudless, EOX (Copernicus 2023), Haut-Ogooué",
  },
];

function Mosaic({ tiles, className }: { tiles: string[]; className?: string }) {
  return (
    <div className={cx("grid grid-cols-2 overflow-hidden", className)}>
      {tiles.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element -- tuile distante, deja a la bonne taille
        <img key={src} src={src} alt="" loading="lazy" className="block aspect-square w-full object-cover" />
      ))}
    </div>
  );
}

const REDUCE = "(prefers-reduced-motion: reduce)";
/** Preference de mouvement, sans ecart d'hydratation (le serveur suppose « animations permises »). */
function useReducedMotionSafe(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const q = window.matchMedia(REDUCE);
      q.addEventListener("change", notify);
      return () => q.removeEventListener("change", notify);
    },
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

export function GlobeToForest() {
  const reduce = useReducedMotionSafe();
  const [active, setActive] = useState(0);
  const steps = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (reduce) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step));
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    steps.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [reduce]);

  if (reduce) {
    return (
      <ol className="grid gap-4 md:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.title} className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
            <Mosaic tiles={s.tiles} />
            <div className="p-5">
              <h3 className="text-[17px] font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{s.text}</p>
              <p className="mt-2 text-[11.5px] text-ink-3">Image : {s.credit}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:gap-14">
      {/* Image collee pendant le defilement ; les trois echelles se succedent en fondu. */}
      <div className="order-first md:order-none">
        <div className="sticky top-24">
          <div className="relative aspect-square overflow-hidden rounded-[24px] shadow-float">
            {STEPS.map((s, i) => (
              <Mosaic
                key={s.title}
                tiles={s.tiles}
                className={cx("absolute inset-0 transition-[opacity,transform] duration-[1200ms] ease-out", i === active ? "scale-100 opacity-100" : i < active ? "scale-110 opacity-0" : "scale-95 opacity-0")}
              />
            ))}
            <p className="absolute bottom-3 left-3 rounded-full bg-space/70 px-3 py-1 text-[11.5px] text-space-ink backdrop-blur">Image : {STEPS[active].credit}</p>
          </div>
        </div>
      </div>
      <div className="flex flex-col">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            ref={(el) => {
              steps.current[i] = el;
            }}
            data-step={i}
            className="flex min-h-[46vh] flex-col justify-center py-8 md:min-h-[70vh]"
          >
            <p className="num text-[13px] font-medium text-lagoon">0{i + 1}</p>
            <h3 className={cx("mt-2 font-display text-[28px] leading-tight tracking-[-0.01em] transition-colors md:text-[34px]", i === active ? "text-ink" : "text-ink-3")}>{s.title}</h3>
            <p className={cx("mt-3 max-w-[42ch] text-[16px] leading-relaxed transition-colors", i === active ? "text-ink-2" : "text-ink-3")}>{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
