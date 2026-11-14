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
          <rect width="5" height="5" fill="#e88c12" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#10213a" strokeWidth="2" strokeOpacity="0.6" />
        </pattern>
      </defs>
      {rows.map((r, i) => {
        const h = (r.harmonized / max) * (H - T - B);
        return (
          <g key={r.year}>
            <rect x={L + i * bw + 2} y={H - B - h} width={bw - 4} height={h} rx="3" fill={r.estimatedShare > 0.5 ? "url(#lp-hatch)" : "#e88c12"} />
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
          <div className="w-full rounded-t-[3px]" style={{ height: `${Math.max(((b.median ?? 0) / max) * 70, 2)}px`, backgroundColor: b.critical ? "#e88c12" : "#4a6283" }} />
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
        <path key={i} d={d} fill="#12284a" stroke="#36557d" strokeWidth="1" />
      ))}
      {grid.cells.map((c) => (
        <rect key={c.cell} x={px(c.lon)} y={py(c.lat + grid.step)} width={size} height={size} fill={activityColor(c.harmonized, breaks)} />
      ))}
    </svg>
  );
}

/** Chemins des provinces dans un repere lineaire (lon, lat) vers (x, y). */
function provincePaths(px: (lon: number) => string, py: (lat: number) => string, keepEvery = 3): string[] {
  const collection = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public", "geo", "provinces.geojson"), "utf8")) as {
    features: { geometry: { type: string; coordinates: unknown } }[];
  };
  return collection.features.map((f) => {
    const polygons = (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates : [f.geometry.coordinates]) as Ring[][];
    return polygons
      .map((poly) => poly.map((ring) => ring.filter((_, i) => i % keepEvery === 0 || i === ring.length - 1).map(([lon, lat], i) => `${i ? "L" : "M"}${px(lon)},${py(lat)}`).join("") + "Z").join(""))
      .join("");
  });
}

/**
 * Visuel d'accueil : le Gabon vu d'orbite. Les cellules lumineuses sont les cellules reellement actives
 * pendant la derniere annee ; les deux orbites figurent les familles de capteurs, leurs satellites s'y deplacent.
 */
export function HeroOrbit({ grid, year }: { grid: GridResponse; year: number }) {
  const W = 640, H = 600;
  // Gabon : 8,55 a 14,65 E et -4,05 a 2,45 N, place au centre de la scene.
  const scale = 62, x0 = 135, y0 = 110;
  const px = (lon: number) => (x0 + (lon - 8.55) * scale).toFixed(1);
  const py = (lat: number) => (y0 + (2.45 - lat) * scale).toFixed(1);
  const paths = provincePaths(px, py);
  const breaks = activityBreaks(grid.cells.map((c) => c.harmonized));
  const size = grid.step * scale + 0.4;
  const modisOrbit = "M -60 470 C 120 360, 360 120, 700 40";
  const viirsOrbit = "M -40 150 C 200 250, 430 420, 700 560";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Le Gabon vu d'orbite : cellules où une activité a été détectée en ${year}, survolées par les orbites des satellites MODIS et VIIRS`} className="h-auto w-full overflow-hidden rounded-[28px]">
      <defs>
        <radialGradient id="hero-earth" cx="50%" cy="0%" r="75%">
          <stop offset="0%" stopColor="#173a63" />
          <stop offset="60%" stopColor="#0f2443" />
          <stop offset="100%" stopColor="#0b1830" />
        </radialGradient>
        <linearGradient id="hero-limb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#12bfd2" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#12bfd2" stopOpacity="0" />
        </linearGradient>
        <filter id="hero-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {/* Fond et limbe terrestre */}
      <rect width={W} height={H} fill="#0d1c35" />
      <circle cx={W / 2} cy={H + 380} r={760} fill="url(#hero-earth)" />
      <circle cx={W / 2} cy={H + 380} r={760} fill="none" stroke="url(#hero-limb)" strokeWidth="2" />
      {/* Graticule leger : un degre */}
      {Array.from({ length: 7 }, (_, i) => 9 + i).map((lon) => (
        <line key={`lon${lon}`} x1={px(lon)} x2={px(lon)} y1={y0 - 20} y2={y0 + 6.5 * scale + 20} stroke="#1e3352" strokeWidth="1" />
      ))}
      {Array.from({ length: 7 }, (_, i) => 2 - i).map((lat) => (
        <line key={`lat${lat}`} y1={py(lat)} y2={py(lat)} x1={x0 - 20} x2={x0 + 6.1 * scale + 20} stroke="#1e3352" strokeWidth="1" />
      ))}
      <text x={px(9)} y={y0 - 28} fill="#8ea0b9" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">9° E</text>
      <text x={px(14)} y={y0 - 28} fill="#8ea0b9" fontSize="11" fontFamily="var(--font-mono)" textAnchor="middle">14° E</text>
      <text x={x0 - 26} y={Number(py(0)) + 4} fill="#8ea0b9" fontSize="11" fontFamily="var(--font-mono)" textAnchor="end">0°</text>
      {/* Pays et provinces */}
      {paths.map((d, i) => (
        <path key={i} d={d} fill="#12284a" stroke="#36557d" strokeWidth="1" />
      ))}
      {/* Cellules actives, avec un halo */}
      <g filter="url(#hero-glow)" opacity="0.7">
        {grid.cells.filter((c) => c.harmonized >= (breaks[3] ?? 0)).map((c) => (
          <rect key={`g${c.cell}`} x={px(c.lon)} y={py(c.lat + grid.step)} width={size} height={size} fill="#f59e0b" />
        ))}
      </g>
      {grid.cells.map((c) => (
        <rect key={c.cell} x={px(c.lon)} y={py(c.lat + grid.step)} width={size} height={size} fill={activityColor(c.harmonized, breaks)} />
      ))}
      {/* Orbites et fauchees */}
      <path d={modisOrbit} fill="none" stroke="#d95926" strokeOpacity="0.09" strokeWidth="70" />
      <path d={modisOrbit} fill="none" stroke="#d95926" strokeOpacity="0.75" strokeWidth="1.5" strokeDasharray="2 6" />
      <path d={viirsOrbit} fill="none" stroke="#3987e5" strokeOpacity="0.09" strokeWidth="110" />
      <path d={viirsOrbit} fill="none" stroke="#3987e5" strokeOpacity="0.8" strokeWidth="1.5" strokeDasharray="2 6" />
      <g className="hero-sat" style={{ offsetPath: `path("${modisOrbit}")`, animationDuration: "19s" } as React.CSSProperties}>
        <rect x="-5" y="-5" width="10" height="10" rx="1.5" fill="#d95926" stroke="#f4f7fa" strokeWidth="1.5" />
      </g>
      <g className="hero-sat" style={{ offsetPath: `path("${viirsOrbit}")`, animationDuration: "15s", animationDelay: "-6s" } as React.CSSProperties}>
        <circle r="5.5" fill="#3987e5" stroke="#f4f7fa" strokeWidth="1.5" />
      </g>
      <text x="24" y="560" fill="#f4f7fa" fontSize="12.5" fontWeight="600">MODIS</text>
      <text x="24" y="576" fill="#8ea0b9" fontSize="11">Terra · Aqua · pixel de 1 km</text>
      <text x="456" y="520" fill="#f4f7fa" fontSize="12.5" fontWeight="600">VIIRS</text>
      <text x="456" y="536" fill="#8ea0b9" fontSize="11">Suomi-NPP · NOAA-20 · 375 m</text>
    </svg>
  );
}

/** Calendrier compact des dernieres annees. */
export function MiniCalendar({ months, years = 6 }: { months: MonthRecord[]; years?: number }) {
  const last = Math.max(...months.map((m) => m.year));
  const recent = months.filter((m) => m.year > last - years);
  return <HeroCalendar months={recent} />;
}
