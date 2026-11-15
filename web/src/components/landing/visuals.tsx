/** Visuels de la page d'accueil. Rendus cote serveur a partir des donnees chargees : aucun chiffre decoratif. */

import fs from "node:fs";
import path from "node:path";

import { MONTHS_LETTER } from "@/lib/format";
import { SENSOR_COLOR } from "@/lib/labels";
import { activityBreaks, activityColor } from "@/lib/scales";
import type { GridResponse, MonthBaseline, MonthRecord, YearRecord } from "@/lib/types";

/** Calendrier annees x mois, version statique. */
export function HeroCalendar({ months }: { months: MonthRecord[] }) {
  const breaks = activityBreaks(months.filter((m) => m.complete).map((m) => m.harmonized));
  const years = [...new Set(months.map((m) => m.year))].sort((a, b) => b - a);
  const byKey = new Map(months.map((m) => [m.year * 12 + m.month, m]));
  return (
    <div role="img" aria-label={`Calendrier de l'indice harmonisé d'activité des feux au Gabon, par mois, de ${years[years.length - 1]} à ${years[0]}`} className="flex flex-col gap-[3px]">
      <div className="grid grid-cols-[34px_repeat(12,minmax(0,1fr))] gap-[3px]">
        <span />
        {MONTHS_LETTER.map((m, i) => (
          <span key={i} className="pb-0.5 text-center text-[10.5px] text-ink-3">
            {m}
          </span>
        ))}
      </div>
      {years.map((year) => (
        <div key={year} className="grid grid-cols-[34px_repeat(12,minmax(0,1fr))] gap-[3px]">
          <span className="num flex items-center text-[10.5px] text-ink-3">{year}</span>
          {Array.from({ length: 12 }, (_, i) => {
            const m = byKey.get(year * 12 + i + 1);
            if (!m || !m.complete) return <span key={i} className="hatch-missing h-[15px] rounded-[2.5px] border border-line opacity-60" />;
            return (
              <span key={i} className="relative h-[15px] rounded-[2.5px]" style={{ backgroundColor: activityColor(m.harmonized, breaks) }}>
                {m.estimatedShare > 0.5 ? <span className="hatch absolute inset-0 rounded-[2.5px]" /> : null}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Detections retenues par an, MODIS contre VIIRS : la comparaison brute qui trompe. */
export function RawGapChart({ months }: { months: MonthRecord[] }) {
  const byYear = new Map<number, { modis: number; viirs: number; n: number }>();
  for (const m of months) {
    const row = byYear.get(m.year) ?? { modis: 0, viirs: 0, n: 0 };
    row.modis += m.eligible.terra + m.eligible.aqua;
    row.viirs += m.eligible.snpp;
    row.n++;
    byYear.set(m.year, row);
  }
  const rows = [...byYear.entries()].filter(([y, r]) => r.n === 12 && y >= 2003).map(([year, r]) => ({ year, modis: r.modis, viirs: year >= 2013 ? r.viirs : null }));
  const W = 560, H = 250, L = 44, R = 12, T = 14, B = 26;
  const max = Math.max(...rows.map((r) => Math.max(r.modis, r.viirs ?? 0)));
  const top = Math.ceil(max / 2000) * 2000;
  const x = (i: number) => L + (i / (rows.length - 1)) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const line = (key: "modis" | "viirs") => {
    let d = "";
    rows.forEach((r, i) => {
      const v = r[key];
      if (v === null) return;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  };
  const ticks = Array.from({ length: top / 2000 + 1 }, (_, i) => i * 2000);
  const lastModis = rows[rows.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Détections retenues par an au Gabon, MODIS Terra et Aqua comparé à VIIRS Suomi-NPP" className="h-auto w-full">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
            {t === 0 ? "0" : `${t / 1000} k`}
          </text>
        </g>
      ))}
      {rows.map((r, i) =>
        r.year % 5 === 0 ? (
          <text key={r.year} x={x(i)} y={H - 6} textAnchor="middle" fontSize="11" fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
            {r.year}
          </text>
        ) : null,
      )}
      <path d={line("modis")} fill="none" stroke={SENSOR_COLOR.modis} strokeWidth="2" strokeLinejoin="round" />
      <path d={line("viirs")} fill="none" stroke={SENSOR_COLOR.snpp} strokeWidth="2" strokeLinejoin="round" />
      {rows.map((r, i) => (
        <g key={r.year}>
          <rect x={x(i) - 2.5} y={y(r.modis) - 2.5} width="5" height="5" fill={SENSOR_COLOR.modis} />
          {r.viirs !== null ? <circle cx={x(i)} cy={y(r.viirs)} r="3" fill={SENSOR_COLOR.snpp} /> : null}
        </g>
      ))}
      <text x={x(rows.length - 1)} y={y(lastModis.modis) - 10} textAnchor="end" fontSize="12" fill="var(--color-ink-2)">
        MODIS Terra + Aqua
      </text>
      <text x={x(rows.length - 1)} y={y(lastModis.viirs ?? 0) - 12} textAnchor="end" fontSize="12" fill="var(--color-ink-2)">
        VIIRS Suomi-NPP
      </text>
    </svg>
  );
}

/** Serie annuelle harmonisee : continue a travers le changement de capteur. */
export function HarmonizedYears({ years }: { years: YearRecord[] }) {
  const rows = years.filter((y) => y.complete);
  const W = 560, H = 150, L = 8, R = 8, T = 10, B = 24;
  const max = Math.max(...rows.map((r) => r.harmonized));
  const bw = (W - L - R) / rows.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Indice harmonisé annuel au Gabon, années complètes" className="h-auto w-full">
      <defs>
        <pattern id="lp-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--color-heat-5)" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="var(--color-surface)" strokeWidth="2" strokeOpacity="0.6" />
        </pattern>
      </defs>
      {rows.map((r, i) => {
        const h = (r.harmonized / max) * (H - T - B);
        return (
          <g key={r.year}>
            <rect x={L + i * bw + 2} y={H - B - h} width={bw - 4} height={h} rx="3" fill={r.estimatedShare > 0.5 ? "url(#lp-hatch)" : "var(--color-heat-5)"} />
            {r.year % 5 === 0 || i === 0 ? (
              <text x={L + i * bw + bw / 2} y={H - 7} textAnchor="middle" fontSize="11" fill="var(--color-ink-3)" fontFamily="var(--font-mono)">
                {r.year}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/** Activite mediane par mois calendaire. */
export function SeasonBars({ baselines }: { baselines: MonthBaseline[] }) {
  const max = Math.max(...baselines.map((b) => b.median ?? 0), 1);
  return (
    <div role="img" aria-label="Activité médiane de l'indice harmonisé par mois calendaire" className="flex h-[92px] items-end gap-1.5">
      {baselines.map((b) => (
        <div key={b.month} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(((b.median ?? 0) / max) * 70, 2)}px`, backgroundColor: b.critical ? "var(--color-heat-5)" : "var(--color-muted-bar)" }} />
          <span className="text-[10px] text-ink-3">{MONTHS_LETTER[b.month - 1]}</span>
        </div>
      ))}
    </div>
  );
}

type Ring = number[][];

/** Carte du Gabon : cellules actives de la derniere annee, sur les limites des provinces. */
export function GabonGrid({ grid }: { grid: GridResponse }) {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "geo", name), "utf8")) as { features: { geometry: { type: string; coordinates: unknown } }[] };
  const provinces = read("provinces.geojson");
  const W0 = 8.55, E0 = 14.65, S0 = -4.05, N0 = 2.45;
  const scale = 100;
  const px = (lon: number) => ((lon - W0) * scale).toFixed(1);
  const py = (lat: number) => ((N0 - lat) * scale).toFixed(1);
  const paths = provinces.features.map((f) => {
    const polygons = (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates]) as Ring[][];
    return polygons
      .map((poly) =>
        poly
          .map((ring) =>
            ring
              // Un sommet sur trois suffit a cette taille d'affichage.
              .filter((_, i) => i % 3 === 0 || i === ring.length - 1)
              .map(([lon, lat], i) => `${i ? "L" : "M"}${px(lon)},${py(lat)}`)
              .join("") + "Z",
          )
          .join(""),
      )
      .join("");
  });
  const breaks = activityBreaks(grid.cells.map((c) => c.harmonized));
  const size = grid.step * scale;
  return (
    <svg viewBox={`0 0 ${((E0 - W0) * scale).toFixed(0)} ${((N0 - S0) * scale).toFixed(0)}`} role="img" aria-label="Carte du Gabon : cellules de la grille où une activité a été détectée la dernière année" className="h-auto w-full">
      {paths.map((d, i) => (
        <path key={i} d={d} fill="var(--color-surface-3)" stroke="var(--color-line-strong)" strokeWidth="1" />
      ))}
      {grid.cells.map((c) => (
        <rect key={c.cell} x={px(c.lon)} y={py(c.lat + grid.step)} width={size} height={size} fill={activityColor(c.harmonized, breaks)} />
      ))}
    </svg>
  );
}
