"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { TooltipCard, TooltipRow } from "@/components/charts";
import { StatusBadge, cx } from "@/components/ui";
import { addDays, fmtDate, fmtDelta, fmtInt, fmtScore, isoToMs, MONTHS_LETTER, MONTHS_SHORT, monthLabel } from "@/lib/format";
import { CONFIG_LABEL, DIVERGING, HEAT, KIND_LABEL, STATUS } from "@/lib/labels";
import { activityBreaks, activityColor, deviationColor } from "@/lib/scales";
import type { DailyResponse, MonthRecord, YearRecord } from "@/lib/types";
import { CONFIG_KEYS } from "@/lib/types";

export type HeatMode = "activity" | "deviation";

export { activityBreaks, activityColor, deviationColor };

/* ------------------------------------------------------------------ Echelles */

export function ScaleLegend({ mode, breaks, unit }: { mode: HeatMode; breaks: number[]; unit: string }) {
  if (mode === "deviation") {
    const labels = ["< −3,5", "−3,5 à −2", "−2 à −1", "−1 à +1", "+1 à +2", "+2 à +3,5", "> +3,5"];
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-ink-3">
        <span>Score robuste d'écart à la médiane du mois :</span>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {DIVERGING.map((color, i) => (
            <li key={color} className="flex items-center gap-1.5">
              <span aria-hidden className="size-3 rounded-[3px]" style={{ backgroundColor: color }} />
              <span className="num whitespace-nowrap text-[11px]">{labels[i]}</span>
            </li>
          ))}
        </ul>
        <span>bleu : inférieur, rouge : supérieur</span>
      </div>
    );
  }
  const stops = [0, ...breaks];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-ink-3">
      <span>{unit} :</span>
      <span className="flex items-end gap-px">
        <span className="flex flex-col items-center gap-1">
          <span className="h-3 w-7 rounded-l-[3px] border border-line" style={{ backgroundColor: HEAT[0] }} />
          <span className="num text-[10.5px]">0</span>
        </span>
        {stops.map((stop, i) => (
          <span key={i} className="flex flex-col items-start gap-1">
            <span className="h-3 w-9" style={{ backgroundColor: activityColor(i === 0 ? 0.0001 : stop, breaks) }} />
            <span className="num -ml-1 text-[10.5px]">{i === 0 ? "> 0" : fmtInt(stop)}</span>
          </span>
        ))}
      </span>
      <span>plus clair : plus d'activité détectée</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Infobulle flottante */

interface Tip {
  x: number;
  y: number;
  content: React.ReactNode;
}

function useTip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = useCallback((target: HTMLElement, content: React.ReactNode) => {
    const host = ref.current;
    if (!host) return;
    const a = host.getBoundingClientRect();
    const b = target.getBoundingClientRect();
    setTip({ x: b.left - a.left + b.width / 2, y: b.bottom - a.top + 6, content });
  }, []);
  const hide = useCallback(() => setTip(null), []);
  const node = tip ? (
    <div
      className="absolute z-20"
      style={{ left: `clamp(8px, ${tip.x}px - 120px, 100% - 288px)`, top: tip.y }}
      role="status"
    >
      {tip.content}
    </div>
  ) : null;
  return { ref, show, hide, node };
}

/* ------------------------------------------------------------------ Annees x mois */

const cellLabel = (m: MonthRecord) =>
  `${monthLabel(m.month, m.year)} : ${m.complete ? `${fmtInt(m.harmonized)} cellules-jour` : "observation incomplète"}, ${STATUS[m.assessment.status].label.toLowerCase()}, ${KIND_LABEL[m.kind].label.toLowerCase()}`;

/**
 * Calendrier historique : une ligne par annee, une colonne par mois.
 * Reponse directe a la demande du defi : quels mois et quelles annees ont ete les plus actifs.
 */
export function MonthHeatmap({
  months,
  years,
  mode,
  breaks,
  selected,
  onSelect,
  compact,
}: {
  months: MonthRecord[];
  years: YearRecord[];
  mode: HeatMode;
  breaks: number[];
  selected?: { year: number; month: number } | null;
  onSelect?: (year: number, month: number) => void;
  compact?: boolean;
}) {
  const { ref, show, hide, node } = useTip();
  const byKey = useMemo(() => new Map(months.map((m) => [m.year * 12 + m.month, m])), [months]);
  const yearList = useMemo(() => [...new Set(months.map((m) => m.year))].sort((a, b) => b - a), [months]);
  const maxYear = useMemo(() => Math.max(...years.filter((y) => y.complete).map((y) => y.harmonized), 1), [years]);
  const focusKey = selected ? selected.year * 12 + selected.month : (yearList[0] ?? 0) * 12 + 1;

  const move = (event: React.KeyboardEvent, year: number, month: number) => {
    const delta: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [1, 0], ArrowDown: [-1, 0] };
    const d = delta[event.key];
    if (!d) return;
    event.preventDefault();
    const target = ref.current?.querySelector<HTMLElement>(`[data-cell="${(year + d[0]) * 12 + month + d[1]}"]`);
    target?.focus();
  };

  return (
    <div ref={ref} className="relative" onMouseLeave={hide}>
      <div role="grid" aria-label="Indice harmonisé par année et par mois" className="flex flex-col gap-[3px]">
        <div role="row" className={cx("grid items-end gap-[3px]", compact ? "grid-cols-[38px_repeat(12,minmax(0,1fr))]" : "grid-cols-[38px_repeat(12,minmax(0,1fr))] md:grid-cols-[44px_repeat(12,minmax(0,1fr))_112px]")}>
          <span />
          {MONTHS_SHORT.map((name, i) => (
            <span key={name} role="columnheader" className="pb-1 text-center text-[11px] text-ink-3">
              <span className="hidden sm:inline">{name}</span>
              <span className="sm:hidden">{MONTHS_LETTER[i]}</span>
            </span>
          ))}
          {compact ? null : <span className="hidden pb-1 pl-2 text-[11px] text-ink-3 md:block">Total annuel</span>}
        </div>
        {yearList.map((year) => {
          const yr = years.find((y) => y.year === year);
          return (
            <div key={year} role="row" className={cx("grid items-stretch gap-[3px]", compact ? "grid-cols-[38px_repeat(12,minmax(0,1fr))]" : "grid-cols-[38px_repeat(12,minmax(0,1fr))] md:grid-cols-[44px_repeat(12,minmax(0,1fr))_112px]")}>
              <span role="rowheader" className="num flex items-center text-[11.5px] text-ink-3">
                {year}
              </span>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const m = byKey.get(year * 12 + month);
                if (!m) return <span key={month} role="gridcell" aria-label={`${monthLabel(month, year)} : hors couverture`} className="hatch-missing rounded-[3px] opacity-50" />;
                const a = m.assessment;
                const isSelected = selected?.year === year && selected.month === month;
                const deviation = deviationColor(a.robustZ);
                const background = !m.complete ? "transparent" : mode === "activity" ? activityColor(m.harmonized, breaks) : (deviation ?? HEAT[0]);
                const flag = a.status === "strong_high" ? "#ef5350" : a.status === "high" ? "#f5b025" : null;
                return (
                  <button
                    key={month}
                    type="button"
                    role="gridcell"
                    data-cell={year * 12 + month}
                    tabIndex={year * 12 + month === focusKey ? 0 : -1}
                    aria-label={cellLabel(m)}
                    aria-selected={isSelected}
                    onClick={() => onSelect?.(year, month)}
                    onKeyDown={(e) => move(e, year, month)}
                    onMouseEnter={(e) =>
                      show(
                        e.currentTarget,
                        <TooltipCard title={monthLabel(month, year).replace(/^./, (c) => c.toUpperCase())}>
                          <TooltipRow label="Indice harmonisé" value={m.complete ? fmtInt(m.harmonized) : "incomplet"} />
                          <TooltipRow label="Médiane du mois" value={fmtInt(a.median)} />
                          {m.complete && a.median ? <TooltipRow label="Écart" value={fmtDelta(m.harmonized, a.median)} /> : null}
                          {a.robustZ !== null ? <TooltipRow label="Score robuste" value={fmtScore(a.robustZ)} /> : null}
                          <div className="mt-1">
                            <StatusBadge status={a.status} />
                          </div>
                          <p className="mt-1 text-[11.5px] text-ink-3">{KIND_LABEL[m.kind].label}</p>
                        </TooltipCard>,
                      )
                    }
                    onFocus={(e) => e.currentTarget.dispatchEvent(new MouseEvent("mouseenter", { bubbles: false }))}
                    onBlur={hide}
                    className={cx(
                      "relative rounded-[3px] transition-[box-shadow,transform] duration-100 hover:z-[1] hover:shadow-[0_0_0_1.5px_var(--color-ink)]",
                      compact ? "h-[18px]" : "h-[22px] md:h-6",
                      isSelected && "z-[1] shadow-[0_0_0_2px_var(--color-accent)]",
                      !m.complete && "hatch-missing border border-line-strong",
                    )}
                    style={{ backgroundColor: background }}
                  >
                    {m.complete && m.estimatedShare > 0.5 ? <span aria-hidden className="hatch absolute inset-0 rounded-[3px]" /> : null}
                    {flag && mode === "activity" ? (
                      <span aria-hidden className="absolute right-[2px] top-[2px] size-[7px] rounded-full ring-[1.5px] ring-bg" style={{ backgroundColor: flag }} />
                    ) : null}
                  </button>
                );
              })}
              {compact ? null : (
                <span className="hidden items-center gap-2 pl-2 md:flex">
                  {yr ? (
                    <>
                      <span className="h-2 rounded-[2px]" style={{ width: `${(yr.harmonized / maxYear) * 52}px`, backgroundColor: yr.complete ? "#e88c12" : "transparent", border: yr.complete ? undefined : "1px solid #8ea0b9" }} />
                      <span className={cx("num text-[11.5px]", yr.complete ? "text-ink-2" : "text-ink-3")}>
                        {fmtInt(yr.harmonized)}
                        {yr.complete ? "" : "*"}
                      </span>
                    </>
                  ) : null}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {node}
    </div>
  );
}

export function HeatmapKey({ mode }: { mode: HeatMode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] text-ink-3">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="hatch inline-block size-3.5 rounded-[3px] bg-heat-4" />
        Estimé depuis MODIS
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="hatch-missing inline-block size-3.5 rounded-[3px] border border-line-strong" />
        Observation incomplète ou hors couverture
      </span>
      {mode === "activity" ? (
        <>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2 rounded-full bg-warning" />
            Supérieur à la référence
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2 rounded-full bg-critical" />
            Très supérieur
          </span>
        </>
      ) : null}
      <span className="hidden md:inline">* année incomplète</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Jours d'une annee */

const DAY_MS = 86_400_000;
const WEEKDAYS = ["lun.", "", "mer.", "", "ven.", "", "dim."];

export function dailyIndex(daily: DailyResponse, iso: string): number {
  return Math.round((isoToMs(iso) - isoToMs(daily.firstDate)) / DAY_MS);
}

/** Une annee jour par jour, semaines en colonnes. Les jours sans capteur en service sont hachures. */
export function DayHeatmap({
  daily,
  year,
  breaks,
  selected,
  onSelect,
}: {
  daily: DailyResponse;
  year: number;
  breaks: number[];
  selected?: string | null;
  onSelect?: (iso: string) => void;
}) {
  const { ref, show, hide, node } = useTip();
  const cells = useMemo(() => {
    const jan1 = Date.UTC(year, 0, 1);
    const offset = (new Date(jan1).getUTCDay() + 6) % 7; // lundi = 0
    const count = (Date.UTC(year + 1, 0, 1) - jan1) / DAY_MS;
    return Array.from({ length: count }, (_, d) => {
      const iso = new Date(jan1 + d * DAY_MS).toISOString().slice(0, 10);
      const index = dailyIndex(daily, iso);
      const inRange = index >= 0 && index < daily.harmonized.length;
      return {
        iso,
        col: Math.floor((d + offset) / 7),
        row: (d + offset) % 7,
        month: Number(iso.slice(5, 7)),
        dayOfMonth: Number(iso.slice(8, 10)),
        value: inRange ? daily.harmonized[index] : null,
        source: inRange ? daily.source[index] : null,
      };
    });
  }, [daily, year]);
  const columns = (cells[cells.length - 1]?.col ?? 52) + 1;
  const monthStarts = cells.filter((c) => c.dayOfMonth === 1);

  return (
    <div ref={ref} className="relative overflow-x-auto pb-1" onMouseLeave={hide}>
      <div className="inline-grid min-w-full" style={{ gridTemplateColumns: `34px repeat(${columns}, minmax(12px, 1fr))`, gridTemplateRows: "16px repeat(7, minmax(12px, 16px))", gap: 3, minWidth: columns * 15 + 34 }}>
        {monthStarts.map((c) => (
          <span key={c.month} className="text-[11px] text-ink-3" style={{ gridColumn: c.col + 2 + (c.row > 0 ? 1 : 0), gridRow: 1 }}>
            {MONTHS_SHORT[c.month - 1]}
          </span>
        ))}
        {WEEKDAYS.map((name, row) => (
          <span key={row} className="flex items-center text-[10.5px] text-ink-3" style={{ gridColumn: 1, gridRow: row + 2 }}>
            {name}
          </span>
        ))}
        {cells.map((c) => {
          const unobserved = c.value === null || c.source === null || c.source < 0;
          const isSelected = selected === c.iso;
          return (
            <button
              key={c.iso}
              type="button"
              aria-label={`${fmtDate(c.iso)} : ${unobserved ? "aucun capteur en service" : `${fmtInt(c.value)} cellules-jour`}`}
              onClick={() => onSelect?.(c.iso)}
              onMouseEnter={(e) =>
                show(
                  e.currentTarget,
                  <TooltipCard title={fmtDate(c.iso)}>
                    {unobserved ? (
                      <p>Aucun capteur en service ce jour : pas de valeur.</p>
                    ) : (
                      <>
                        <TooltipRow label="Indice harmonisé" value={fmtInt(c.value)} />
                        <p className="mt-1 text-[11.5px] text-ink-3">Source du jour : {CONFIG_LABEL[CONFIG_KEYS[c.source as number]]}</p>
                        {c.value === 0 ? <p className="text-[11.5px] text-ink-3">Aucune détection retenue. Les nuages peuvent masquer des feux.</p> : null}
                      </>
                    )}
                  </TooltipCard>,
                )
              }
              onBlur={hide}
              className={cx(
                "rounded-[2.5px] transition-shadow duration-100 hover:shadow-[0_0_0_1.5px_var(--color-ink)]",
                unobserved && "hatch-missing border border-line-strong",
                isSelected && "shadow-[0_0_0_2px_var(--color-accent)]",
              )}
              style={{ gridColumn: c.col + 2, gridRow: c.row + 2, backgroundColor: unobserved ? "transparent" : activityColor(c.value as number, breaks) }}
            />
          );
        })}
      </div>
      {node}
    </div>
  );
}

/* ------------------------------------------------------------------ Annees x semaines */

/** Semaine n de l'annee = jours 7(n-1)+1 a 7n depuis le 1er janvier (la derniere compte 1 ou 2 jours). */
export function WeekHeatmap({
  daily,
  breaks,
  onSelect,
  selected,
}: {
  daily: DailyResponse;
  breaks: number[];
  selected?: { from: string } | null;
  onSelect?: (from: string, to: string) => void;
}) {
  const { ref, show, hide, node } = useTip();
  const rows = useMemo(() => weeklyRows(daily), [daily]);
  return (
    <div ref={ref} className="relative overflow-x-auto pb-1" onMouseLeave={hide}>
      <div className="flex min-w-[760px] flex-col gap-[3px]">
        <div className="grid grid-cols-[44px_repeat(53,minmax(0,1fr))] gap-[2px]">
          <span />
          {MONTHS_SHORT.map((name, i) => (
            <span key={name} className="text-[11px] text-ink-3" style={{ gridColumn: Math.floor((Date.UTC(2023, i, 1) - Date.UTC(2023, 0, 1)) / DAY_MS / 7) + 2 }}>
              {name}
            </span>
          ))}
        </div>
        {rows.map((row) => (
          <div key={row.year} className="grid grid-cols-[44px_repeat(53,minmax(0,1fr))] items-stretch gap-[2px]">
            <span className="num flex items-center text-[11.5px] text-ink-3">{row.year}</span>
            {row.weeks.map((w, i) =>
              w === null ? (
                <span key={i} className="hatch-missing h-5 rounded-[2px] opacity-50" />
              ) : (
                <button
                  key={i}
                  type="button"
                  aria-label={`Semaine du ${fmtDate(w.from)} : ${w.complete ? `${fmtInt(w.value)} cellules-jour` : "observation incomplète"}`}
                  onClick={() => onSelect?.(w.from, w.to)}
                  onMouseEnter={(e) =>
                    show(
                      e.currentTarget,
                      <TooltipCard title={`Du ${fmtDate(w.from)} au ${fmtDate(w.to)}`}>
                        <TooltipRow label="Indice harmonisé" value={w.complete ? fmtInt(w.value) : "incomplet"} />
                        {w.unobserved > 0 ? <p className="text-[11.5px] text-ink-3">{w.unobserved} jour(s) sans capteur en service.</p> : null}
                      </TooltipCard>,
                    )
                  }
                  onBlur={hide}
                  className={cx(
                    "h-5 rounded-[2px] transition-shadow duration-100 hover:shadow-[0_0_0_1.5px_var(--color-ink)]",
                    !w.complete && "hatch-missing border border-line-strong",
                    selected?.from === w.from && "shadow-[0_0_0_2px_var(--color-accent)]",
                  )}
                  style={{ backgroundColor: w.complete ? activityColor(w.value, breaks) : "transparent" }}
                />
              ),
            )}
          </div>
        ))}
      </div>
      {node}
    </div>
  );
}

export interface WeekCell {
  from: string;
  to: string;
  value: number;
  unobserved: number;
  complete: boolean;
}

export function weeklyRows(daily: DailyResponse): { year: number; weeks: (WeekCell | null)[] }[] {
  const firstYear = Number(daily.firstDate.slice(0, 4));
  const lastIso = addDays(daily.firstDate, daily.harmonized.length - 1);
  const lastYear = Number(lastIso.slice(0, 4));
  const rows = [];
  for (let year = lastYear; year >= firstYear; year--) {
    const weeks: (WeekCell | null)[] = [];
    for (let w = 0; w < 53; w++) {
      const from = addDays(`${year}-01-01`, w * 7);
      const yearEnd = `${year}-12-31`;
      const end = addDays(from, 6);
      const to = end > yearEnd ? yearEnd : end;
      if (from > yearEnd || to < daily.firstDate || from > lastIso) {
        weeks.push(null);
        continue;
      }
      let value = 0, unobserved = 0, days = 0;
      for (let iso = from; iso <= to; iso = addDays(iso, 1)) {
        const i = dailyIndex(daily, iso);
        days++;
        if (i < 0 || i >= daily.harmonized.length || daily.source[i] < 0) unobserved++;
        else value += daily.harmonized[i];
      }
      weeks.push({ from, to, value, unobserved, complete: unobserved === 0 && days > 0 });
    }
    rows.push({ year, weeks });
  }
  return rows;
}
