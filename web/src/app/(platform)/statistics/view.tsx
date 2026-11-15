"use client";

import { DownloadSimple, Printer } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { RegionBars } from "@/components/blocks";
import { TooltipCard, TooltipRow } from "@/components/charts";
import { zoneLabel } from "@/components/shell/pickers";
import { Button, ChartSkeleton, EmptyState, ErrorState, Notice, PageHeader, Panel, PanelHeader, SourceNote, StatusBadge, inputClass } from "@/components/ui";
import { useCalendar, useDaily, useGrid, useMetadata, useOverview, useRegions } from "@/lib/api";
import { addDays, daysBetween, fmt1, fmtDateShort, fmtDateTimeUtc, fmtInt, fmtPct, MONTHS, MONTHS_SHORT } from "@/lib/format";
import { SATELLITES, UNIT, UNIT_SHORT } from "@/lib/labels";
import { SATELLITE_KEYS, type SatelliteKey } from "@/lib/types";
import type { MonthRecord } from "@/lib/types";
import { useFilters } from "@/state/filters";

type SensorScope = "all" | "MODIS" | "VIIRS";
type Granularity = "day" | "month" | "year";
type DailyDatum = { date: string; value: number; source: number; year: number; month: number };
type SeriesDatum = { key: string; label: string; value: number; coveredDays: number; year: number; month: number | null; date: string };

const SENSOR_KEYS: Record<SensorScope, SatelliteKey[]> = {
  all: [...SATELLITE_KEYS],
  MODIS: ["terra", "aqua"],
  VIIRS: ["snpp", "noaa20"],
};
// CONFIG_KEYS in the pipeline order: Terra, Aqua, Terra+Aqua, Suomi-NPP, NOAA-20.
const SOURCE_KEYS: Record<SensorScope, number[]> = { all: [0, 1, 2, 3, 4], MODIS: [0, 1, 2], VIIRS: [3, 4] };
const AXIS = { fill: "var(--color-ink-3)", fontSize: 11, fontFamily: "var(--font-mono)" } as const;
const numberTick = (value: number) => (Math.abs(value) >= 1000 ? `${fmt1(value / 1000).replace(",0", "")} k` : fmtInt(value));

function sumFor(keys: SatelliteKey[], values: Record<SatelliteKey, number>) {
  return keys.reduce((total, key) => total + values[key], 0);
}

function csvCell(value: string | number | null) {
  if (value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function StatTile({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <Panel className="kpi-accent flex min-h-[132px] flex-col justify-between gap-3 p-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-ink-3">{title}</p>
      <p className="num text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{value}</p>
      <p className="text-[11.5px] leading-snug text-ink-3">{detail}</p>
    </Panel>
  );
}

function PeriodChart({ data, granularity, unit }: { data: SeriesDatum[]; granularity: Granularity; unit: string }) {
  if (!data.length) return <EmptyState title="Aucune valeur sur cette sélection">La couverture sélectionnée ne fournit pas de période exploitable pour ce graphique.</EmptyState>;
  const isAnnual = granularity === "year";
  return (
    <div className="px-2 pb-3 pt-4" style={{ height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 18, bottom: 3, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-line)" }} interval="preserveStartEnd" minTickGap={34} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={numberTick} />
          <Tooltip
            cursor={{ stroke: "var(--color-line-strong)" }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as SeriesDatum | undefined;
              if (!active || !row) return null;
              return <TooltipCard title={row.label}><TooltipRow label={unit} value={fmtInt(row.value)} /><TooltipRow label="Jours couverts" value={fmtInt(row.coveredDays)} /></TooltipCard>;
            }}
          />
          {isAnnual ? <Bar dataKey="value" fill="var(--color-heat-5)" radius={[3, 3, 0, 0]} isAnimationActive={false} /> : <Line dataKey="value" stroke="var(--color-heat-5)" strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls={false} activeDot={{ r: 4, fill: "var(--color-heat-5)", stroke: "var(--color-surface)", strokeWidth: 2 }} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function SeasonalityChart({ data, unit }: { data: { label: string; month: number; median: number | null; years: number }[]; unit: string }) {
  return (
    <div className="px-2 pb-3 pt-4" style={{ height: 250 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 14, bottom: 2, left: 0 }}>
          <CartesianGrid stroke="var(--color-line)" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-line)" }} interval={0} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={numberTick} />
          <Tooltip
            cursor={{ fill: "var(--color-surface-3)", fillOpacity: 0.6 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
              if (!active || !row) return null;
              return <TooltipCard title={MONTHS[row.month - 1]}><TooltipRow label={unit} value={row.median === null ? "Données insuffisantes" : fmtInt(row.median)} /><TooltipRow label="Années représentées" value={fmtInt(row.years)} /></TooltipCard>;
            }}
          />
          <Bar dataKey="median" fill="var(--color-accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function monthInPeriod(month: MonthRecord, from: string, to: string) {
  const first = `${month.year}-${String(month.month).padStart(2, "0")}-01`;
  const monthEnd = new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
  const last = `${month.year}-${String(month.month).padStart(2, "0")}-${String(monthEnd).padStart(2, "0")}`;
  return last >= from && first <= to;
}

export function StatisticsView() {
  const { zone, from, to } = useFilters();
  const [sensor, setSensor] = useState<SensorScope>("all");
  const [granularity, setGranularity] = useState<Granularity>("month");
  const metadata = useMetadata();
  const overview = useOverview(zone, from, to);
  const calendar = useCalendar(zone);
  const daily = useDaily(zone);
  const regions = useRegions(from, to);
  const grid = useGrid(zone, from, to);
  const meta = metadata.data;
  const data = calendar.data;
  const selectedKeys = SENSOR_KEYS[sensor];
  const zoneName = zoneLabel(zone, meta?.provinces);

  const dailyRecords = useMemo<DailyDatum[]>(() => {
    if (!daily.data) return [];
    const records: DailyDatum[] = [];
    const n = Math.min(daily.data.harmonized.length, daily.data.source.length);
    for (let i = 0; i < n; i++) {
      const date = addDays(daily.data.firstDate, i);
      const source = daily.data.source[i];
      if (date < from || date > to || !SOURCE_KEYS[sensor].includes(source)) continue;
      records.push({ date, value: daily.data.harmonized[i], source, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)) });
    }
    return records;
  }, [daily.data, from, to, sensor]);

  const series = useMemo<SeriesDatum[]>(() => {
    const groups = new Map<string, { value: number; coveredDays: number; year: number; month: number | null; date: string }>();
    for (const row of dailyRecords) {
      const key = granularity === "day" ? row.date : granularity === "month" ? row.date.slice(0, 7) : row.date.slice(0, 4);
      const current = groups.get(key) ?? { value: 0, coveredDays: 0, year: row.year, month: granularity === "month" ? row.month : null, date: row.date };
      current.value += row.value;
      current.coveredDays++;
      groups.set(key, current);
    }
    return [...groups.entries()].map(([key, row]) => ({
      key,
      label: granularity === "day" ? fmtDateShort(row.date) : granularity === "month" ? `${MONTHS_SHORT[(row.month ?? 1) - 1]} ${row.year}` : key,
      ...row,
    }));
  }, [dailyRecords, granularity]);

  const seasonality = useMemo(() => {
    const monthly = new Map<string, { month: number; value: number; covered: number; daysInMonth: number }>();
    for (const row of dailyRecords) {
      const key = `${row.year}-${String(row.month).padStart(2, "0")}`;
      const current = monthly.get(key) ?? { month: row.month, value: 0, covered: 0, daysInMonth: new Date(Date.UTC(row.year, row.month, 0)).getUTCDate() };
      current.value += row.value;
      current.covered++;
      monthly.set(key, current);
    }
    return Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      const totals = [...monthly.values()].filter((row) => row.month === month && row.covered / row.daysInMonth >= 0.9).map((row) => row.value).sort((a, b) => a - b);
      const median = totals.length ? (totals[Math.floor((totals.length - 1) / 2)] + totals[Math.ceil((totals.length - 1) / 2)]) / 2 : null;
      return { label: MONTHS_SHORT[index], month, median, years: totals.length };
    });
  }, [dailyRecords]);

  const flagged = useMemo(() => data?.months.filter((month) => monthInPeriod(month, from, to) && ["strong_high", "high", "low"].includes(month.assessment.status)) ?? [], [data, from, to]);
  const insufficient = useMemo(() => data?.months.filter((month) => monthInPeriod(month, from, to) && ["insufficient", "incomplete"].includes(month.assessment.status)) ?? [], [data, from, to]);
  const nativeTotal = overview.data ? sumFor(selectedKeys, overview.data.detections) : null;
  const eligibleTotal = overview.data ? sumFor(selectedKeys, overview.data.eligible) : null;
  const activeCellCount = grid.data
    ? grid.data.cells.filter((cell) => sensor === "all" ? cell.harmonized > 0 : sensor === "MODIS" ? cell.modis > 0 : cell.snpp > 0 || cell.noaa20 > 0).length
    : overview.data?.activeCells ?? null;
  const validDays = dailyRecords.length;
  const allPeriodDays = from && to ? daysBetween(from, to) : 0;
  const activityUnit = sensor === "all" ? UNIT_SHORT : `${UNIT_SHORT} (jours alimentés par ${sensor})`;
  const method = "Cellules-jour actives sur une grille de 0,05°, relais et calage vers Suomi-NPP ; anomalies comparées à la médiane du même mois des autres années complètes.";

  // Variations annuelles : toujours calculees, sur les 8 dernieres annees jusqu'a la fin de la periode
  // (independamment de la granularite), pour que la periode choisie soit comparee a celles qui la precedent.
  const annualChanges = useMemo(() => {
    if (!daily.data) return [];
    const lastYear = Number(to.slice(0, 4));
    const firstSelected = Number(from.slice(0, 4));
    const byYear = new Map<number, { value: number; coveredDays: number }>();
    const n = Math.min(daily.data.harmonized.length, daily.data.source.length);
    for (let i = 0; i < n; i++) {
      const source = daily.data.source[i];
      if (!SOURCE_KEYS[sensor].includes(source)) continue;
      const year = Number(addDays(daily.data.firstDate, i).slice(0, 4));
      if (year > lastYear) break;
      const row = byYear.get(year) ?? { value: 0, coveredDays: 0 };
      row.value += daily.data.harmonized[i];
      row.coveredDays++;
      byYear.set(year, row);
    }
    const years = [...byYear.entries()].sort((x, y) => x[0] - y[0]);
    return years.slice(-8).map(([year, row]) => {
      const daysInYear = year % 4 === 0 ? 366 : 365;
      const complete = row.coveredDays >= daysInYear * 0.9;
      const previous = byYear.get(year - 1);
      const prevComplete = previous ? previous.coveredDays >= (((year - 1) % 4 === 0 ? 366 : 365) * 0.9) : false;
      return {
        key: String(year),
        label: String(year),
        value: row.value,
        coveredDays: row.coveredDays,
        complete,
        selected: year >= firstSelected && year <= lastYear,
        change: complete && previous && prevComplete && previous.value > 0 ? (row.value - previous.value) / previous.value : null,
      };
    });
  }, [daily.data, from, to, sensor]);
  const maxAnnual = Math.max(...annualChanges.map((row) => row.value), 1);

  const exportCsv = () => {
    const anomalyByKey = new Map((data?.months ?? []).map((month) => [`${month.year}-${String(month.month).padStart(2, "0")}`, month]));
    const header = ["zone", "debut", "fin", "capteur_selectionne", "granularite", "periode", "valeur", "unite", "jours_couverts", "statut_anomalie", "mediane_reference", "percentile", "source", "methode"];
    const rows = series.map((row) => {
      const month = row.month === null ? null : anomalyByKey.get(`${row.year}-${String(row.month).padStart(2, "0")}`);
      return [zoneName, from, to, sensor, granularity, row.label, row.value, activityUnit, row.coveredDays, month?.assessment.status ?? null, month?.assessment.median ?? null, month?.assessment.percentile ?? null, daily.data?.provenance.source ?? null, method];
    });
    const csv = `\ufeff${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `firepulse_statistiques_${from}_${to}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const printReport = () => window.print();
  const interruptions = (overview.data?.gaps ?? []).filter((gap) => sensor === "all" || (sensor === "MODIS" ? gap.satellite === "terra" || gap.satellite === "aqua" : gap.satellite === "snpp" || gap.satellite === "noaa20"));
  const provinces = regions.data?.regions.filter((region) => zone.kind !== "province" || region.index === zone.index) ?? [];
  const provinceRanking = [...provinces]
    .map((region) => ({
      ...region,
      value: sensor === "all" ? region.harmonized : sumFor(selectedKeys, region.detections),
      label: sensor === "all" ? "cellules-jour harmonisées" : "détections natives (non dédoublonnées)",
    }))
    .sort((a, b) => b.value - a.value);
  const maxProvinceValue = Math.max(...provinceRanking.map((region) => region.value), 1);
  const topCells = grid.data?.cells
    .map((cell) => ({ ...cell, score: sensor === "all" ? cell.harmonized : sensor === "MODIS" ? cell.modis : cell.snpp + cell.noaa20 }))
    .filter((cell) => cell.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8) ?? [];
  const qualityRate = meta && meta.rows.read > 0 ? meta.rows.kept / meta.rows.read : null;
  const satelliteHistory = useMemo(() => {
    if (!data || !meta) return [];
    const firstCommonDate = selectedKeys.map((key) => meta.satellites.find((item) => item.key === key)?.first_date).filter((value): value is string => Boolean(value)).sort().at(-1);
    const lastCommonDate = selectedKeys.map((key) => meta.satellites.find((item) => item.key === key)?.last_date).filter((value): value is string => Boolean(value)).sort()[0];
    if (!firstCommonDate || !lastCommonDate) return [];
    // Toutes les annees communes completes, independamment de la periode : une seule annee ne fait pas une tendance.
    const firstYear = Number(firstCommonDate.slice(0, 4)) + (firstCommonDate.slice(5) !== "01-01" ? 1 : 0);
    const lastYear = Number(lastCommonDate.slice(0, 4)) - (lastCommonDate.slice(5) !== "12-31" ? 1 : 0);
    const result: Record<string, number>[] = [];
    for (let year = firstYear; year <= lastYear; year++) {
      const jan = `${year}-01-01`;
      const dec = `${year}-12-31`;
      if (firstCommonDate > jan || lastCommonDate < dec) continue;
      const months = data.months.filter((month) => month.year === year);
      if (months.length !== 12 || months.some((month) => !month.complete)) continue;
      const row: Record<string, number> = { year };
      for (const key of selectedKeys) row[key] = months.reduce((total, month) => total + month.eligible[key], 0);
      result.push(row);
    }
    return result;
  }, [data, meta, selectedKeys]);

  return (
    <>
      <PageHeader
        title="Statistiques détaillées"
        lead={<>Indicateurs synthétiques, activité historique et qualité des données pour <span className="text-ink">{zoneName}</span>. La zone et la période suivent les filtres partagés en haut de page.</>}
        actions={<div className="no-print flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={exportCsv} disabled={!series.length}><DownloadSimple size={15} /> Export CSV</Button><Button variant="primary" size="sm" onClick={printReport} disabled={!overview.data}><Printer size={15} /> Rapport PDF</Button></div>}
      />

      <Panel className="no-print">
        <PanelHeader title="Filtres d'analyse" subtitle="La zone et les dates sont synchronisées avec le reste de l'application ; le capteur et la granularité s'appliquent aux analyses ci-dessous." />
        <div className="grid grid-cols-1 gap-4 px-5 pb-4 pt-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-2">Capteur / série
            <select className={inputClass} value={sensor} onChange={(event) => setSensor(event.target.value as SensorScope)}>
              <option value="all">Indice harmonisé — tous capteurs</option><option value="MODIS">MODIS — jours alimentés par Terra/Aqua</option><option value="VIIRS">VIIRS — jours alimentés par Suomi-NPP/NOAA-20</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[12px] font-medium text-ink-2">Granularité de la série historique
            <select className={inputClass} value={granularity} onChange={(event) => setGranularity(event.target.value as Granularity)}>
              <option value="day">Journalière</option><option value="month">Mensuelle</option><option value="year">Annuelle</option>
            </select>
          </label>
        </div>
      </Panel>

      {overview.error ? <Panel><ErrorState error={overview.error} onRetry={() => overview.mutate()} /></Panel> : null}

      <section aria-label="Indicateurs clés">
        <PanelHeader title="A — Indicateurs clés" subtitle={`${fmtDateShort(from)} au ${fmtDateShort(to)} · ${sensor === "all" ? "série harmonisée" : `filtre ${sensor}`}`} />
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile title="Détections natives" value={nativeTotal === null ? "…" : fmtInt(nativeTotal)} detail="Observations de pixels, non assimilables à des incendies confirmés ni à des feux uniques." />
          <StatTile title="Détections retenues" value={eligibleTotal === null ? "…" : fmtInt(eligibleTotal)} detail="Feux de végétation présumés, confiance non faible, capteurs sélectionnés." />
          <StatTile title="Cellules géographiques actives" value={activeCellCount === null ? "…" : fmtInt(activeCellCount)} detail="Cellules de la grille ayant contribué sur la période et le filtre capteur." />
          <StatTile title="Jours couverts" value={daily.error ? "n. d." : fmtInt(validDays)} detail={`Sur ${fmtInt(allPeriodDays)} jours calendaires ; une absence de couverture n'indique pas une absence de feu.`} />
          <StatTile title="Taux de conservation" value={nativeTotal === null || eligibleTotal === null ? "…" : fmtPct(nativeTotal ? eligibleTotal / nativeTotal : 0)} detail="Part des détections sélectionnées retenue dans l'indice harmonisé." />
          <StatTile title="Périodes inhabituelles" value={data ? fmtInt(flagged.length) : "…"} detail={`${fmtInt(insufficient.length)} périodes avec données insuffisantes ou observation incomplète (référence mensuelle).`} />
        </div>
      </section>

      <section aria-label="Analyse historique">
        <Panel>
          <PanelHeader title="B — Analyse historique" subtitle={`Évolution de ${activityUnit} sur la période sélectionnée. Les jours non couverts sont laissés hors calcul, pas remplacés par zéro.`} />
          {daily.error ? <ErrorState error={daily.error} onRetry={() => daily.mutate()} compact /> : daily.data ? <PeriodChart data={series} granularity={granularity} unit={activityUnit} /> : <ChartSkeleton height={280} />}
          <div className="border-t border-line px-5 py-3 text-[12px] text-ink-3">Unité harmonisée : {UNIT}. Le filtre MODIS/VIIRS isole les jours dont la configuration d'observation alimente la série ; ce n'est pas une somme de feux uniques.</div>
          <SourceNote provenance={daily.data?.provenance} />
        </Panel>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Panel>
            <PanelHeader title="Distribution saisonnière" subtitle="Médiane des totaux mensuels des seules années-mois couvertes à au moins 90 %." />
            {daily.error ? <ErrorState error={daily.error} compact /> : daily.data ? <SeasonalityChart data={seasonality} unit={activityUnit} /> : <ChartSkeleton height={230} />}
            <SourceNote provenance={daily.data?.provenance} extra="Cette distribution est descriptive ; elle n'est pas une prévision saisonnière." />
          </Panel>
          <Panel>
            <PanelHeader title="Variations annuelles" subtitle="Huit dernières années jusqu'à la fin de la période ; variation par rapport à l'année précédente, années couvertes à au moins 90 % seulement." />
            {daily.error ? <ErrorState error={daily.error} compact /> : !daily.data ? <ChartSkeleton height={230} /> : annualChanges.length ? (
              <div className="overflow-x-auto px-5 pb-4 pt-2">
                <table className="w-full min-w-[420px] text-left text-[13px]">
                  <thead className="text-[11.5px] text-ink-3"><tr><th className="pb-2 font-normal">Année</th><th className="pb-2 font-normal" /><th className="pb-2 text-right font-normal">Valeur</th><th className="pb-2 text-right font-normal">Variation</th></tr></thead>
                  <tbody>
                    {annualChanges.map((row) => (
                      <tr key={row.key} className={row.selected ? "border-t border-line bg-accent/[0.06]" : "border-t border-line"}>
                        <td className="py-2 pl-1 text-ink">{row.label}{row.selected ? <span className="ml-2 text-[11px] text-accent">période</span> : null}{row.complete ? null : <span className="ml-2 text-[11px] text-ink-3">incomplète</span>}</td>
                        <td className="w-[38%] py-2 pr-3"><span className="block h-2 rounded-full" style={{ width: `${Math.max((row.value / maxAnnual) * 100, 1)}%`, backgroundColor: row.complete ? "var(--color-heat-5)" : "var(--color-muted-bar)" }} /></td>
                        <td className="num py-2 text-right text-ink">{fmtInt(row.value)}</td>
                        <td className={`num py-2 text-right ${row.change === null ? "text-ink-3" : row.change > 0 ? "text-ink" : "text-ink-2"}`}>{row.change === null ? "n. d." : `${row.change > 0 ? "▲ +" : row.change < 0 ? "▼ " : ""}${fmtPct(row.change, 1).replace("-", "−")}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <EmptyState title="Pas d'année exploitable" />}
            <SourceNote provenance={daily.data?.provenance} extra={`Unité : ${activityUnit}. Une hausse d'une année sur l'autre est un constat, pas une tendance : voir l'écran Tendances.`} />
          </Panel>
        </div>
      </section>

      <section aria-label="Comparaison des capteurs">
        <Panel>
          <PanelHeader title="C — Comparaison des capteurs" subtitle="Détections natives et retenues, par satellite, pour la période actuellement sélectionnée." />
          {overview.error ? <ErrorState error={overview.error} compact /> : overview.data ? (
            <div className="overflow-x-auto px-5 pb-4 pt-3"><table className="w-full min-w-[560px] text-left text-[13px]"><thead className="text-[11.5px] text-ink-3"><tr><th className="pb-2 font-normal">Satellite</th><th className="pb-2 text-right font-normal">Détections natives</th><th className="pb-2 text-right font-normal">Retenues</th><th className="pb-2 text-right font-normal">Taux de rétention</th></tr></thead><tbody>{SATELLITE_KEYS.filter((key) => sensor === "all" || SATELLITES[key].sensor === sensor).map((key) => { const native = overview.data!.detections[key]; const retained = overview.data!.eligible[key]; return <tr key={key} className="border-t border-line"><td className="py-2.5 text-ink">{SATELLITES[key].sensor} {SATELLITES[key].name}</td><td className="num py-2.5 text-right text-ink">{fmtInt(native)}</td><td className="num py-2.5 text-right text-ink-2">{fmtInt(retained)}</td><td className="num py-2.5 text-right text-ink-2">{fmtPct(native ? retained / native : 0)}</td></tr>; })}</tbody></table></div>
          ) : <ChartSkeleton height={150} />}
          <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-3">Ces observations ne s'additionnent pas pour représenter des feux uniques : plusieurs capteurs peuvent signaler une même activité, avec des résolutions et passages différents.</p>
        </Panel>
        <Panel className="mt-5">
          <PanelHeader title="Tendances comparées sur la période commune" subtitle={`Détections retenues par satellite, toutes les années complètes où ${sensor === "all" ? "les quatre plateformes" : sensor} étaient en service, indépendamment de la période choisie. Les courbes restent séparées.`} />
          {calendar.error ? <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} compact /> : !data || !meta ? <ChartSkeleton height={260} /> : satelliteHistory.length ? (
            <>
              <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pt-4 text-[12px] text-ink-2">{selectedKeys.map((key) => <span key={key} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ backgroundColor: SATELLITES[key].color }} />{SATELLITES[key].sensor} {SATELLITES[key].name}</span>)}</div>
              <div className="px-2 pb-3 pt-2" style={{ height: 280 }}><ResponsiveContainer width="100%" height="100%"><ComposedChart data={satelliteHistory} margin={{ top: 10, right: 18, bottom: 3, left: 0 }}><CartesianGrid stroke="var(--color-line)" vertical={false} /><XAxis dataKey="year" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-line)" }} /><YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={numberTick} /><Tooltip cursor={{ stroke: "var(--color-line-strong)" }} isAnimationActive={false} content={({ active, payload }) => { const row = payload?.[0]?.payload as Record<string, number> | undefined; if (!active || !row) return null; return <TooltipCard title={`Année ${row.year}`}>{selectedKeys.map((key) => <TooltipRow key={key} label={`${SATELLITES[key].sensor} ${SATELLITES[key].name}`} value={fmtInt(row[key])} />)}</TooltipCard>; }} />{selectedKeys.map((key) => <Line key={key} dataKey={key} name={`${SATELLITES[key].sensor} ${SATELLITES[key].name}`} stroke={SATELLITES[key].color} strokeWidth={2} dot={{ r: 3, fill: SATELLITES[key].color, stroke: "var(--color-surface)", strokeWidth: 1.5 }} isAnimationActive={false} connectNulls={false} />)}</ComposedChart></ResponsiveContainer></div>
            </>
          ) : <EmptyState title="Aucune année commune complète dans cette sélection">Étendez la plage de dates pour inclure une année civile complète pendant laquelle tous les capteurs sélectionnés étaient disponibles.</EmptyState>}
          <SourceNote provenance={data?.provenance} extra="Unité : détections retenues selon les critères du pipeline. Les valeurs sont par satellite, pas un décompte de feux uniques ; années incomplètes ou hors période commune exclues." />
        </Panel>
      </section>

      <section aria-label="Analyse géographique">
        <Panel>
          <PanelHeader title="D — Analyse géographique" subtitle={`${sensor === "all" ? "Classement par cellules-jour harmonisées" : `Classement par détections natives (${sensor}), sans dédoublonnage`} · ${fmtDateShort(from)} au ${fmtDateShort(to)}.`} />
          {regions.error ? <ErrorState error={regions.error} onRetry={() => regions.mutate()} compact /> : regions.data ? provinceRanking.length ? sensor === "all" ? <RegionBars regions={provinceRanking} activeIndex={zone.kind === "province" ? zone.index : null} /> : (
            <ol className="flex flex-col px-5 py-3">{provinceRanking.map((region, index) => <li key={region.index} className="flex items-center gap-3 border-b border-line py-2"><span className="w-32 truncate text-[12.5px] text-ink">{index + 1}. {region.name}</span><span className="relative h-4 min-w-0 flex-1"><span className="absolute inset-y-[3px] left-0 rounded-r-[3px]" style={{ width: `${region.value ? Math.max(region.value / maxProvinceValue * 100, 0.8) : 0}%`, backgroundColor: sensor === "MODIS" ? SATELLITES.terra.color : SATELLITES.snpp.color }} /></span><span className="num w-20 text-right text-[12px] text-ink">{fmtInt(region.value)}</span><span className="num hidden w-28 text-right text-[11px] text-ink-3 sm:block">{fmt1(region.value / region.areaKm2 * 1000)} / 1 000 km²</span></li>)}</ol>
          ) : <EmptyState title="Aucune province dans cette sélection" /> : <ChartSkeleton height={250} />}
          <SourceNote provenance={regions.data?.provenance} extra={sensor === "all" ? "Densité harmonisée en cellules-jour pour 1 000 km²." : "Densité des détections natives pour 1 000 km², sans dédoublonnage des observations satellite."} />
        </Panel>
        <Panel className="mt-5">
          <PanelHeader title="Cellules les plus actives" subtitle={`Top 8 sur la grille de ${fmt1(grid.data?.step ?? 0.05)}° ; valeur selon ${sensor === "all" ? "l'indice harmonisé" : `les journées alimentées par ${sensor}`}.`} />
          {grid.error ? <ErrorState error={grid.error} onRetry={() => grid.mutate()} compact /> : grid.data ? topCells.length ? (
            <ol className="grid grid-cols-1 gap-x-8 px-5 pb-4 pt-2 sm:grid-cols-2">{topCells.map((cell, index) => <li key={cell.cell} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[12.5px]"><span className="text-ink-2">{index + 1}. <span className="num text-ink-3">{cell.lat.toFixed(3)}°, {cell.lon.toFixed(3)}°</span></span><span className="num text-ink">{fmtInt(cell.score)} {UNIT_SHORT}</span></li>)}</ol>
          ) : <EmptyState title="Aucune cellule active sur la période" /> : <ChartSkeleton height={180} />}
          <SourceNote provenance={grid.data?.provenance} />
        </Panel>
      </section>

      <section aria-label="Analyse des anomalies">
        <Panel>
          <PanelHeader title="E — Analyse des anomalies" subtitle="Écarts mensuels de la série harmonisée par rapport à la médiane historique du même mois calendaire. Les anomalies demeurent basées sur la série harmonisée, quel que soit le filtre capteur." />
          {calendar.error ? <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} compact /> : data ? flagged.length ? (
            <div className="overflow-x-auto px-5 pb-4 pt-3"><table className="w-full min-w-[760px] text-left text-[12.5px]"><thead className="text-[11.5px] text-ink-3"><tr><th className="pb-2 font-normal">Période</th><th className="pb-2 text-right font-normal">Valeur observée</th><th className="pb-2 text-right font-normal">Médiane référence</th><th className="pb-2 text-right font-normal">Écart relatif</th><th className="pb-2 text-right font-normal">Percentile</th><th className="pb-2 text-right font-normal">Années de référence</th><th className="pb-2 pl-3 font-normal">Statut</th></tr></thead><tbody>{flagged.map((month) => <tr key={`${month.year}-${month.month}`} className="border-t border-line"><td className="py-2 capitalize text-ink">{MONTHS[month.month - 1]} {month.year}</td><td className="num py-2 text-right text-ink">{month.complete ? fmtInt(month.harmonized) : "incomplet"}</td><td className="num py-2 text-right text-ink-2">{fmtInt(month.assessment.median)}</td><td className="num py-2 text-right text-ink-2">{month.assessment.ratioToMedian === null ? "n. d." : fmtPct(month.assessment.ratioToMedian - 1, 1)}</td><td className="num py-2 text-right text-ink-2">{month.assessment.percentile === null ? "n. d." : `${fmtInt(month.assessment.percentile)}e`}</td><td className="num py-2 text-right text-ink-2">{fmtInt(month.assessment.referenceCount)}</td><td className="py-2 pl-3"><StatusBadge status={month.assessment.status} /></td></tr>)}</tbody></table></div>
          ) : <EmptyState title="Aucune période inhabituelle signalée">Les mois de la période ne s'écartent pas de leur référence, ou ne disposent pas d'une comparaison valide.</EmptyState> : <ChartSkeleton height={170} />}
          {insufficient.length ? <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-3">Données insuffisantes / observation incomplète : {insufficient.map((month) => `${MONTHS_SHORT[month.month - 1]} ${month.year}`).join(", ")}. Ces cas sont distingués d'une activité nulle.</p> : null}
          <p className="border-t border-line px-5 py-3 text-[12px] leading-relaxed text-ink-3">Référence : mêmes mois des autres années complètes disponibles pour cette zone. Percentile et score robuste proviennent de l'évaluation du pipeline. Un signal statistique n'est ni un incendie confirmé ni une prédiction.</p>
          <SourceNote provenance={data?.provenance} />
        </Panel>
      </section>

      <section aria-label="Qualité et fiabilité">
        <Panel>
          <PanelHeader title="F — Qualité et fiabilité" subtitle="Contrôles du jeu de données chargé et éléments de provenance. Les métriques de validation du pipeline portent sur l'ensemble du jeu, sauf mention contraire." />
          {meta ? (
            <div className="grid grid-cols-1 gap-5 px-5 pb-5 pt-4 lg:grid-cols-2">
              <dl className="flex flex-col text-[12.5px]">
                {([["Lignes lues", fmtInt(meta.rows.read)], ["Lignes conservées", fmtInt(meta.rows.kept)], ["Lignes rejetées", fmtInt(meta.rows.rejected)], ["Taux de lignes valides", fmtPct(qualityRate)], ["Données retenues dans l'indice", fmtInt(meta.rows.eligible)], ["Couverture source", `${fmtDateShort(meta.coverage.firstDate)} – ${fmtDateShort(meta.coverage.lastDate)}`], ["Consultation des sources", `${fmtDateTimeUtc(meta.accessed.first)} – ${fmtDateTimeUtc(meta.accessed.last)}`]] as const).map(([label, value]) => <div key={label} className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0"><dt className="text-ink-3">{label}</dt><dd className="num text-right text-ink">{value}</dd></div>)}
              </dl>
              <div className="flex flex-col gap-3">
                <div><h3 className="mb-1.5 text-[12px] font-medium text-ink-2">Interruption(s) intersectant la période</h3>{interruptions.length ? <ul className="flex flex-col gap-1.5 text-[12.5px] text-ink-2">{interruptions.map((gap) => <li key={`${gap.satellite}-${gap.start}`} className="flex justify-between gap-3 border-b border-line pb-1.5"><span>{SATELLITES[gap.satellite].sensor} {SATELLITES[gap.satellite].name} · {gap.start} – {gap.end}</span><span className="num shrink-0">{fmtInt(gap.days)} j</span></li>)}</ul> : <p className="text-[12.5px] text-ink-3">Aucune interruption identifiée dans cette sélection de capteurs.</p>}</div>
                <div><h3 className="mb-1.5 text-[12px] font-medium text-ink-2">Produits et méthode</h3><p className="text-[12.5px] leading-relaxed text-ink-3">Produits FIRMS présents : {[...new Set(meta.sources.map((source) => source.dataset))].join(", ") || "n. d."}. Résolution de travail : {fmt1(meta.harmonization.grid.step_deg)}° (cellules-jour). {meta.harmonization.settings.method}</p><p className="mt-2 text-[12px] leading-relaxed text-ink-3">Extraction des archives : {fmtDateTimeUtc(meta.accessed.first)} à {fmtDateTimeUtc(meta.accessed.last)}. Dernière construction du pipeline : {fmtDateTimeUtc(meta.builtAt)}.</p></div>
              </div>
            </div>
          ) : metadata.error ? <ErrorState error={metadata.error} onRetry={() => metadata.mutate()} compact /> : <ChartSkeleton height={180} />}
          {meta ? <SourceNote provenance={data?.provenance} extra={`Référence des données FIRMS réelles ; la validité qualité est ${fmtPct(qualityRate)} sur ${fmtInt(meta.rows.read)} lignes du jeu chargé.`} /> : null}
        </Panel>
      </section>

      <Notice tone="info" title="Interprétation et limites">
        Les chiffres de détections désignent des anomalies thermiques détectées par satellite, pas des incendies confirmés. Les capteurs peuvent signaler la même activité ; leurs nombres bruts ne constituent pas un total de feux uniques. Une période sans détection ou sans couverture ne prouve pas l'absence de feu. Les estimations MODIS et les anomalies dépendent de la méthode d'harmonisation et de la disponibilité des années de référence.
      </Notice>
    </>
  );
}
