"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ErrorBar,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SensorMark, StatusBadge } from "@/components/ui";
import { fmt1, fmtDelta, fmtInt, fmtPct, MONTHS, MONTHS_LETTER, MONTHS_SHORT, monthLabel } from "@/lib/format";
import { KIND_LABEL, SENSOR_COLOR, UNIT_SHORT } from "@/lib/labels";
import type { TrendResult } from "@/lib/science/stats";
import type { CalendarResponse, MonthBaseline, MonthRecord, YearRecord } from "@/lib/types";

// Les couleurs de structure passent par des variables CSS : le rapport imprime les redefinit en clair.
const AXIS = { fill: "var(--color-ink-3)", fontSize: 11.5, fontFamily: "var(--font-mono)" } as const;
const GRID = "var(--color-line)";
const INK = "var(--color-ink)";
const MUTED = "var(--color-ink-3)";
const SURFACE = "var(--color-surface)";
const HEAT = "#e88c12";

const NARROW = "(max-width: 640px)";
/** Vrai sur un ecran etroit : les graphiques y abregent leurs etiquettes. */
export function useNarrow(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(NARROW);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}
/** Etiquette d'axe d'un mois : abreviation, ou initiale sur ecran etroit. */
export const monthTick = (narrow: boolean) => (name: string) => (narrow ? MONTHS_LETTER[MONTHS_SHORT.indexOf(name)] ?? name : name);

const axisNumber = (value: number) => (Math.abs(value) >= 1000 ? `${fmt1(value / 1000).replace(",0", "")} k` : fmtInt(value));

export function TooltipCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none min-w-[190px] max-w-[280px] rounded-control border border-line-strong bg-surface-3 px-3 py-2.5 text-[12.5px] shadow-[0_12px_32px_-8px_rgb(0_0_0/0.75)]">
      <p className="mb-1.5 font-medium text-ink">{title}</p>
      <div className="flex flex-col gap-1 text-ink-2">{children}</div>
    </div>
  );
}

export function TooltipRow({ label, value, mark }: { label: string; value: React.ReactNode; mark?: React.ReactNode }) {
  return (
    <p className="flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5">
        {mark}
        {label}
      </span>
      <span className="num text-ink">{value}</span>
    </p>
  );
}

function LegendItem({ children, swatch }: { children: React.ReactNode; swatch: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
      {swatch}
      {children}
    </span>
  );
}

export function Legend({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pb-1 pt-3">{children}</div>;
}

const lineSwatch = (color: string, dashed = false) => (
  <svg width="18" height="8" aria-hidden>
    <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
  </svg>
);
const bandSwatch = (color: string) => <span aria-hidden className="inline-block h-2.5 w-4 rounded-[2px]" style={{ backgroundColor: color, opacity: 0.35 }} />;

/* ------------------------------------------------------------------ Profil saisonnier */

/**
 * Une annee comparee a sa reference saisonniere (mediane et intervalle interquartile
 * du meme mois des autres annees). Repond a : ce mois est-il habituel pour la saison ?
 */
export function SeasonalChart({
  months,
  baselines,
  year,
  height = 260,
  onSelect,
}: {
  months: MonthRecord[];
  baselines: MonthBaseline[];
  year: number;
  height?: number;
  onSelect?: (month: number) => void;
}) {
  const narrow = useNarrow();
  const data = useMemo(
    () =>
      baselines.map((b) => {
        const record = months.find((m) => m.year === year && m.month === b.month);
        return {
          month: b.month,
          name: MONTHS_SHORT[b.month - 1],
          median: b.median,
          iqr: b.q25 !== null && b.q75 !== null ? [b.q25, b.q75] : null,
          range: b.min !== null && b.max !== null ? [b.min, b.max] : null,
          value: record && record.complete ? record.harmonized : null,
          record,
        };
      }),
    [months, baselines, year],
  );

  return (
    <>
      <Legend>
        <LegendItem swatch={lineSwatch(INK)}>{year}</LegendItem>
        <LegendItem swatch={lineSwatch(MUTED, true)}>Médiane des autres années</LegendItem>
        <LegendItem swatch={bandSwatch(MUTED)}>Entre le 1er et le 3e quartile</LegendItem>
        <LegendItem swatch={<span aria-hidden className="inline-block size-2.5 rounded-full border-2 border-warning" />}>Mois inhabituel</LegendItem>
      </Legend>
      <div style={{ height }} className="px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 18, bottom: 0, left: 0 }}
            onClick={(state) => {
              const label = (state as { activeLabel?: string | number } | undefined)?.activeLabel;
              const index = MONTHS_SHORT.indexOf(String(label));
              if (onSelect && index >= 0) onSelect(index + 1);
            }}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} tickFormatter={monthTick(narrow)} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={axisNumber} />
            <Tooltip
              cursor={{ stroke: "var(--color-line-strong)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !row) return null;
                const a = row.record?.assessment;
                return (
                  <TooltipCard title={monthLabel(row.month, year).replace(/^./, (c) => c.toUpperCase())}>
                    {row.record ? (
                      <>
                        <TooltipRow label="Indice harmonisé" value={row.record.complete ? fmtInt(row.record.harmonized) : "incomplet"} />
                        <TooltipRow label="Médiane de référence" value={fmtInt(row.median)} />
                        {row.record.complete && row.median ? <TooltipRow label="Écart" value={fmtDelta(row.record.harmonized, row.median)} /> : null}
                        {a ? (
                          <div className="mt-1">
                            <StatusBadge status={a.status} />
                          </div>
                        ) : null}
                        <p className="mt-1 text-[11.5px] text-ink-3">{KIND_LABEL[row.record.kind].label}</p>
                      </>
                    ) : (
                      <p>Hors de la couverture des données.</p>
                    )}
                  </TooltipCard>
                );
              }}
            />
            <Area dataKey="iqr" stroke="none" fill={MUTED} fillOpacity={0.2} isAnimationActive={false} connectNulls activeDot={false} />
            <Line dataKey="median" stroke={MUTED} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} activeDot={false} />
            <Line
              dataKey="value"
              stroke={INK}
              strokeWidth={2}
              isAnimationActive={false}
              connectNulls={false}
              activeDot={{ r: 5, fill: INK, stroke: SURFACE, strokeWidth: 2 }}
              dot={(props: { cx?: number; cy?: number; index?: number }) => {
                const row = data[props.index ?? 0];
                const status = row?.record?.assessment.status;
                if (props.cx === undefined || props.cy === undefined || row?.value === null) return <g key={props.index} />;
                const flagged = status === "strong_high" || status === "high" || status === "low";
                const ring = status === "strong_high" ? "#ef5350" : status === "high" ? "#f5b025" : "#95a9cc";
                return (
                  <g key={props.index}>
                    {flagged ? <circle cx={props.cx} cy={props.cy} r={8} fill="none" stroke={ring} strokeWidth={2} /> : null}
                    <circle cx={props.cx} cy={props.cy} r={3.5} fill={INK} stroke={SURFACE} strokeWidth={2} />
                  </g>
                );
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Serie mensuelle complete */

/** Indice harmonise mois par mois sur tout l'historique, avec l'ere d'estimation MODIS et l'incertitude de calage. */
export function HistoryChart({ months, selection, height = 280 }: { months: MonthRecord[]; selection?: { from: string; to: string }; height?: number }) {
  const data = useMemo(
    () =>
      months.map((m, i) => ({
        i,
        year: m.year,
        month: m.month,
        value: m.complete ? m.harmonized : null,
        band: m.complete && m.estimatedShare > 0 ? [m.low, m.high] : null,
        record: m,
      })),
    [months],
  );
  const ticks = data.filter((d) => d.month === 1 && d.year % 5 === 0).map((d) => d.i);
  const eraEnd = useMemo(() => {
    let last = -1;
    data.forEach((d) => {
      if (d.record.kind === "estimated") last = d.i;
    });
    return last;
  }, [data]);
  const selected = useMemo(() => {
    if (!selection) return null;
    const key = (y: number, m: number) => y * 12 + m - 1;
    const a = key(Number(selection.from.slice(0, 4)), Number(selection.from.slice(5, 7)));
    const b = key(Number(selection.to.slice(0, 4)), Number(selection.to.slice(5, 7)));
    const inside = data.filter((d) => key(d.year, d.month) >= a && key(d.year, d.month) <= b);
    return inside.length ? { x1: inside[0].i - 0.5, x2: inside[inside.length - 1].i + 0.5 } : null;
  }, [data, selection]);

  return (
    <>
      <Legend>
        <LegendItem swatch={lineSwatch(HEAT)}>Indice harmonisé mensuel</LegendItem>
        <LegendItem swatch={bandSwatch(HEAT)}>Incertitude de calage (10 % à 90 %)</LegendItem>
        <LegendItem swatch={<span aria-hidden className="hatch inline-block h-2.5 w-4 rounded-[2px] bg-ink-3/40" />}>Période estimée depuis MODIS</LegendItem>
        {selected ? <LegendItem swatch={<span aria-hidden className="inline-block h-2.5 w-4 rounded-[2px] border border-accent bg-accent/15" />}>Période sélectionnée</LegendItem> : null}
      </Legend>
      <div style={{ height }} className="px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
            <defs>
              <pattern id="era-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke={MUTED} strokeWidth="1" strokeOpacity="0.22" />
              </pattern>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="i" type="number" domain={[0, data.length - 1]} ticks={ticks} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(i: number) => String(data[i]?.year ?? "")} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={axisNumber} />
            {eraEnd >= 0 ? <ReferenceArea x1={0} x2={eraEnd + 0.5} fill="url(#era-hatch)" stroke="none" ifOverflow="hidden" /> : null}
            {selected ? <ReferenceArea x1={selected.x1} x2={selected.x2} fill="#12bfd2" fillOpacity={0.12} stroke="#12bfd2" strokeOpacity={0.6} ifOverflow="hidden" /> : null}
            <Tooltip
              cursor={{ stroke: "var(--color-line-strong)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !row) return null;
                const m = row.record;
                return (
                  <TooltipCard title={monthLabel(m.month, m.year).replace(/^./, (c) => c.toUpperCase())}>
                    <TooltipRow label="Indice harmonisé" value={m.complete ? fmtInt(m.harmonized) : "incomplet"} />
                    {m.estimatedShare > 0 && m.complete ? <TooltipRow label="Intervalle" value={`${fmtInt(m.low)} à ${fmtInt(m.high)}`} /> : null}
                    <TooltipRow label="Médiane du mois" value={fmtInt(m.assessment.median)} />
                    <p className="mt-1 text-[11.5px] text-ink-3">{KIND_LABEL[m.kind].label}</p>
                  </TooltipCard>
                );
              }}
            />
            <Area dataKey="band" stroke="none" fill={HEAT} fillOpacity={0.28} isAnimationActive={false} connectNulls={false} activeDot={false} />
            <Line dataKey="value" stroke={HEAT} strokeWidth={1.75} dot={false} isAnimationActive={false} connectNulls={false} activeDot={{ r: 4, fill: HEAT, stroke: SURFACE, strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Totaux annuels */

/** Totaux annuels. Les annees estimees depuis MODIS sont hachurees et portent leur intervalle d'incertitude. */
export function AnnualChart({
  years,
  trend,
  highlight,
  height = 280,
  onSelect,
}: {
  years: YearRecord[];
  trend?: TrendResult | null;
  highlight?: number;
  height?: number;
  onSelect?: (year: number) => void;
}) {
  const data = useMemo(
    () =>
      years.map((y) => ({
        year: y.year,
        value: y.harmonized,
        error: y.complete && y.estimatedShare > 0.5 ? [Math.max(y.harmonized - y.low, 0), Math.max(y.high - y.harmonized, 0)] : undefined,
        estimated: y.estimatedShare > 0.5,
        complete: y.complete,
        trend: trend && y.year >= trend.firstYear && y.year <= trend.lastYear ? trend.intercept + trend.slope * y.year : null,
        record: y,
      })),
    [years, trend],
  );
  const medianAll = useMemo(() => {
    const v = years.filter((y) => y.complete).map((y) => y.harmonized).sort((a, b) => a - b);
    return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.ceil((v.length - 1) / 2)]) / 2 : null;
  }, [years]);

  return (
    <>
      <Legend>
        <LegendItem swatch={<span aria-hidden className="inline-block h-2.5 w-3 rounded-[2px]" style={{ backgroundColor: HEAT }} />}>Observé par VIIRS</LegendItem>
        <LegendItem swatch={<span aria-hidden className="hatch inline-block h-2.5 w-3 rounded-[2px]" style={{ backgroundColor: HEAT }} />}>Estimé depuis MODIS, avec intervalle</LegendItem>
        <LegendItem swatch={<span aria-hidden className="inline-block h-2.5 w-3 rounded-[2px] border border-ink-3" />}>Année incomplète</LegendItem>
        {medianAll !== null ? <LegendItem swatch={lineSwatch(MUTED, true)}>Médiane des années complètes</LegendItem> : null}
        {trend ? <LegendItem swatch={lineSwatch(INK)}>Pente de Theil-Sen</LegendItem> : null}
      </Legend>
      <div style={{ height }} className="px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 12, right: 18, bottom: 0, left: 0 }}
            barCategoryGap="22%"
            onClick={(state) => {
              const label = Number((state as { activeLabel?: string | number } | undefined)?.activeLabel);
              if (onSelect && Number.isFinite(label)) onSelect(label);
            }}
            style={onSelect ? { cursor: "pointer" } : undefined}
          >
            <defs>
              <pattern id="bar-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="5" height="5" fill={HEAT} />
                <line x1="0" y1="0" x2="0" y2="5" stroke={SURFACE} strokeWidth="2" strokeOpacity="0.6" />
              </pattern>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={axisNumber} />
            <Tooltip
              cursor={{ fill: "var(--color-surface-3)", fillOpacity: 0.6 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !row) return null;
                const y = row.record;
                return (
                  <TooltipCard title={`Année ${y.year}`}>
                    <TooltipRow label="Indice harmonisé" value={fmtInt(y.harmonized)} />
                    {row.estimated && y.complete ? <TooltipRow label="Intervalle annuel" value={`${fmtInt(y.low)} à ${fmtInt(y.high)}`} /> : null}
                    {medianAll !== null && y.complete ? <TooltipRow label="Écart à la médiane" value={fmtDelta(y.harmonized, medianAll)} /> : null}
                    <TooltipRow label="Part estimée depuis MODIS" value={fmtPct(y.estimatedShare)} />
                    <p className="mt-1 text-[11.5px] text-ink-3">
                      {y.complete ? "Année complète." : `Année incomplète : ${y.monthsWithData} mois de données, ${y.unobservedDays} jour(s) sans capteur. Total non comparable.`}
                    </p>
                  </TooltipCard>
                );
              }}
            />
            {medianAll !== null ? <ReferenceLine y={medianAll} stroke={MUTED} strokeDasharray="4 3" strokeWidth={1.25} /> : null}
            <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={30}>
              {data.map((d) => (
                <Cell
                  key={d.year}
                  fill={!d.complete ? "transparent" : d.estimated ? "url(#bar-hatch)" : HEAT}
                  stroke={!d.complete ? MUTED : d.year === highlight ? INK : "none"}
                  strokeWidth={!d.complete ? 1 : 2}
                />
              ))}
              <ErrorBar dataKey="error" width={4} strokeWidth={1.25} stroke={INK} opacity={0.75} />
            </Bar>
            {trend ? <Line dataKey="trend" stroke={INK} strokeWidth={1.5} dot={false} isAnimationActive={false} activeDot={false} /> : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Comparaison des capteurs */

export type CompareUnit = "detections" | "celldays" | "calibrated";

/**
 * MODIS et VIIRS sur la periode commune, dans trois unites :
 * detections brutes, cellules-jour actives, puis cellules-jour apres calage.
 * Montre ce que l'harmonisation corrige, et ce qu'elle ne corrige pas.
 */
export function SensorCompareChart({
  calendar,
  factors,
  unit,
  height = 280,
}: {
  calendar: CalendarResponse;
  factors: { TA: number[]; N: number[] } | null;
  unit: CompareUnit;
  height?: number;
}) {
  const data = useMemo(() => {
    const byYear = new Map<number, { year: number; modis: number; snpp: number; noaa20: number; months: number }>();
    for (const m of calendar.months) {
      const row = byYear.get(m.year) ?? { year: m.year, modis: 0, snpp: 0, noaa20: 0, months: 0 };
      row.months++;
      if (unit === "detections") {
        row.modis += m.eligible.terra + m.eligible.aqua;
        row.snpp += m.eligible.snpp;
        row.noaa20 += m.eligible.noaa20;
      } else {
        const fTA = unit === "calibrated" && factors ? factors.TA[m.month - 1] : 1;
        const fN = unit === "calibrated" && factors ? factors.N[m.month - 1] : 1;
        row.modis += m.cellDays.TA * fTA;
        row.snpp += m.cellDays.S;
        row.noaa20 += m.cellDays.N * fN;
      }
      byYear.set(m.year, row);
    }
    return [...byYear.values()]
      .filter((r) => r.months === 12)
      .map((r) => ({
        year: r.year,
        // Aqua n'observe une annee entiere qu'a partir de 2003, Suomi-NPP de 2013, NOAA-20 de 2019.
        modis: r.year >= 2003 ? r.modis : null,
        snpp: r.year >= 2013 ? r.snpp : null,
        noaa20: r.year >= 2019 ? r.noaa20 : null,
      }));
  }, [calendar, factors, unit]);

  const label = unit === "detections" ? "détections retenues" : unit === "celldays" ? UNIT_SHORT : `${UNIT_SHORT}, équivalent Suomi-NPP`;
  const series = [
    { key: "modis", name: "MODIS Terra + Aqua", color: SENSOR_COLOR.modis, shape: "square" as const },
    { key: "snpp", name: "VIIRS Suomi-NPP", color: SENSOR_COLOR.snpp, shape: "circle" as const },
    { key: "noaa20", name: "VIIRS NOAA-20", color: SENSOR_COLOR.noaa20, shape: "circle" as const },
  ];

  return (
    <>
      <Legend>
        {series.map((s) => (
          <LegendItem key={s.key} swatch={<SensorMark color={s.color} shape={s.shape} />}>
            {s.name}
          </LegendItem>
        ))}
        <span className="text-[12px] text-ink-3">Unité : {label} par an</span>
      </Legend>
      <div style={{ height }} className="px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={18} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={axisNumber} domain={[0, "auto"]} />
            <Tooltip
              cursor={{ stroke: "var(--color-line-strong)" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <TooltipCard title={`Année ${row.year}`}>
                    {series.map((s) => {
                      const v = row[s.key as "modis" | "snpp" | "noaa20"];
                      return v === null ? null : <TooltipRow key={s.key} label={s.name} value={fmtInt(v)} mark={<SensorMark color={s.color} shape={s.shape} size={8} />} />;
                    })}
                    {row.modis !== null && row.snpp !== null ? <TooltipRow label="Rapport VIIRS / MODIS" value={fmt1(row.snpp / row.modis)} /> : null}
                  </TooltipCard>
                );
              }}
            />
            {series.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                stroke={s.color}
                strokeWidth={2}
                isAnimationActive={false}
                connectNulls={false}
                dot={
                  s.shape === "square"
                    ? (p: { cx?: number; cy?: number; index?: number; value?: number | null }) =>
                        p.cx === undefined || p.cy === undefined || p.value === null || p.value === undefined ? (
                          <g key={p.index} />
                        ) : (
                          <rect key={p.index} x={p.cx - 3} y={p.cy - 3} width={6} height={6} fill={s.color} stroke={SURFACE} strokeWidth={1.5} />
                        )
                    : { r: 3, fill: s.color, stroke: SURFACE, strokeWidth: 1.5 }
                }
                activeDot={{ r: 5, fill: s.color, stroke: SURFACE, strokeWidth: 2 }}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ Climatologie */

/** Activite mediane par mois calendaire : quels mois sont habituellement les plus actifs. */
export function ClimatologyChart({ baselines, height = 220 }: { baselines: MonthBaseline[]; height?: number }) {
  const narrow = useNarrow();
  const data = baselines.map((b) => ({
    name: MONTHS_SHORT[b.month - 1],
    month: b.month,
    median: b.median ?? 0,
    spread: b.q25 !== null && b.q75 !== null && b.median !== null ? [b.median - b.q25, b.q75 - b.median] : undefined,
    b,
  }));
  return (
    <>
      <Legend>
        <LegendItem swatch={<span aria-hidden className="inline-block h-2.5 w-3 rounded-[2px]" style={{ backgroundColor: HEAT }} />}>Mois critique (80 % de l'activité médiane)</LegendItem>
        <LegendItem swatch={<span aria-hidden className="inline-block h-2.5 w-3 rounded-[2px] bg-ink-3/50" />}>Autre mois</LegendItem>
        <LegendItem swatch={<span aria-hidden className="inline-block h-3 w-px bg-ink" />}>1er au 3e quartile</LegendItem>
      </Legend>
      <div style={{ height }} className="px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 0, left: 0 }} barCategoryGap="24%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} tickFormatter={monthTick(narrow)} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} tickFormatter={axisNumber} />
            <Tooltip
              cursor={{ fill: "var(--color-surface-3)", fillOpacity: 0.6 }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <TooltipCard title={MONTHS[row.month - 1].replace(/^./, (c) => c.toUpperCase())}>
                    <TooltipRow label="Médiane" value={fmtInt(row.b.median)} />
                    <TooltipRow label="1er au 3e quartile" value={`${fmtInt(row.b.q25)} à ${fmtInt(row.b.q75)}`} />
                    <TooltipRow label="Minimum à maximum" value={`${fmtInt(row.b.min)} à ${fmtInt(row.b.max)}`} />
                    <TooltipRow label="Années de référence" value={fmtInt(row.b.n)} />
                    {row.b.critical ? <p className="mt-1 text-[11.5px] text-ink-3">Mois habituellement critique pour cette zone.</p> : null}
                  </TooltipCard>
                );
              }}
            />
            <Bar dataKey="median" radius={[4, 4, 0, 0]} isAnimationActive={false} maxBarSize={38}>
              {data.map((d) => (
                <Cell key={d.month} fill={d.b.critical ? HEAT : "#4a6283"} />
              ))}
              <ErrorBar dataKey="spread" width={4} strokeWidth={1.25} stroke={INK} opacity={0.8} />
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Courbe miniature sans axes, pour les tuiles d'indicateurs. */
export function Sparkline({ values, highlightLast = true, width = 120, height = 34 }: { values: (number | null)[]; highlightLast?: boolean; width?: number; height?: number }) {
  const clean = values.filter((v): v is number => v !== null);
  if (clean.length < 2) return null;
  const max = Math.max(...clean);
  const min = Math.min(...clean);
  const x = (i: number) => (i / (values.length - 1)) * (width - 6) + 3;
  const y = (v: number) => height - 4 - ((v - min) / (max - min || 1)) * (height - 8);
  let path = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) return void (pen = false);
    path += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  const lastIndex = values.length - 1;
  const last = values[lastIndex];
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={path} fill="none" stroke={MUTED} strokeWidth="1.5" strokeLinejoin="round" />
      {highlightLast && last !== null ? <circle cx={x(lastIndex)} cy={y(last)} r="3" fill={INK} stroke={SURFACE} strokeWidth="1.5" /> : null}
    </svg>
  );
}
