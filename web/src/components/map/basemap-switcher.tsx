"use client";

/**
 * Choix du fond de carte : quatre boutons segmentes avec vignette (en bas a gauche de la carte),
 * et le relief 3D en option. Les vignettes sont de vraies tuiles des services utilises.
 */

import { Mountains } from "@phosphor-icons/react/dist/ssr";

import { cx } from "@/lib/classes";
import { fmtDateShort } from "@/lib/format";

import { BASEMAPS, BLUE_MARBLE_TILES, SENTINEL_TILES, dailyTiles, type BasemapKind } from "./basemaps";

const tile = (template: string, z: number, x: number, y: number) => template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));

/** Vignettes : Afrique centrale (Blue Marble, image du jour), estuaire du Gabon a 10 m (Sentinel-2). */
function thumbnail(kind: BasemapKind, daily: { layer: string; date: string } | null): string | null {
  if (kind === "earth") return tile(BLUE_MARBLE_TILES, 3, 4, 4);
  if (kind === "daily") return daily ? tile(dailyTiles(daily.layer, daily.date), 3, 4, 4) : null;
  if (kind === "hires") return tile(SENTINEL_TILES, 9, 269, 255);
  return null;
}

export function BasemapSwitcher({
  value,
  onChange,
  daily,
  relief3d,
  onRelief3d,
  className,
}: {
  value: BasemapKind;
  onChange: (kind: BasemapKind) => void;
  daily: { layer: string; date: string } | null;
  relief3d: boolean;
  onRelief3d: (on: boolean) => void;
  className?: string;
}) {
  return (
    // Relief 3D au-dessus des vignettes : la barre du bas reste libre pour la legende.
    <div className={cx("pointer-events-auto flex flex-col-reverse items-start gap-2", className)}>
      <div role="radiogroup" aria-label="Fond de carte" className="flex gap-1 rounded-panel border border-line/70 bg-surface/85 p-1 shadow-float backdrop-blur-[12px]">
        {BASEMAPS.map((b) => {
          const src = thumbnail(b.value, daily);
          const active = value === b.value;
          return (
            <button
              key={b.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={b.hint}
              onClick={() => onChange(b.value)}
              className={cx(
                "group flex w-[64px] flex-col items-center gap-1 rounded-[11px] p-1 text-[10.5px] font-medium leading-tight transition-colors sm:w-[72px]",
                active ? "bg-accent/12 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
              )}
            >
              <span className={cx("relative block h-10 w-full overflow-hidden rounded-[8px] border-2 transition-colors", active ? "border-accent" : "border-transparent group-hover:border-line-strong")}>
                {src ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tuile distante, pas d'optimisation d'image utile
                  <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                ) : (
                  <span aria-hidden className="plan-thumb block size-full" />
                )}
              </span>
              <span className="text-center">{b.label}</span>
            </button>
          );
        })}
      </div>
      {value !== "plan" ? (
        <button
          type="button"
          aria-pressed={relief3d}
          onClick={() => onRelief3d(!relief3d)}
          title="Relief 3D : inclinez la carte (clic droit ou Ctrl + glisser) pour voir le terrain"
          className={cx(
            "hidden h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium shadow-float backdrop-blur-[12px] transition-colors sm:flex",
            relief3d ? "border-accent bg-accent text-accent-ink" : "border-line/70 bg-surface/85 text-ink hover:bg-surface",
          )}
        >
          <Mountains size={15} weight="bold" />
          Relief 3D
        </button>
      ) : null}
    </div>
  );
}

/** Badge de l'image du jour : capteur et date reelle de l'image affichee. */
export function ImageryBadge({ sensor, date, shifted }: { sensor: string; date: string; shifted: boolean }) {
  return (
    <p className="pointer-events-auto rounded-full border border-line/70 bg-surface/85 px-3 py-1.5 text-[12px] font-medium text-ink shadow-float backdrop-blur-[12px]" role="status">
      Image {sensor} du {fmtDateShort(date)}
      {shifted ? <span className="font-normal text-ink-3"> · dernière image publiée</span> : null}
    </p>
  );
}
