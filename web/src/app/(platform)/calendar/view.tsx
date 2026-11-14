"use client";

import { CalendarCheck, DownloadSimple, MapTrifold } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { AssessmentDetail, KindNote, SatelliteCounts } from "@/components/blocks";
import { AnnualChart, ClimatologyChart, SeasonalChart } from "@/components/charts";
import { DayHeatmap, HeatmapKey, MonthHeatmap, ScaleLegend, WeekHeatmap, activityBreaks, dailyIndex, weeklyRows, type HeatMode } from "@/components/heatmaps";
import { zoneLabel } from "@/components/shell/pickers";
import { Button, ChartSkeleton, EmptyState, ErrorState, Notice, PageHeader, Panel, PanelHeader, Segmented, SourceNote, buttonClass, cx, inputClass } from "@/components/ui";
import { exportUrl, useCalendar, useDaily, useMetadata } from "@/lib/api";
import { fmtDate, fmtInt, lastDayOfMonth, MONTHS, monthLabel, pad2 } from "@/lib/format";
import { CONFIG_LABEL, DEFINITIONS, UNIT } from "@/lib/labels";
import { CONFIG_KEYS } from "@/lib/types";
import { useFilters } from "@/state/filters";
import { updateView, useView } from "@/state/view";

type Granularity = "month" | "week" | "day" | "year";

const GRANULARITY_TEXT: Record<Granularity, string> = {
  month: "Une ligne par année, une colonne par mois. Lisez une colonne pour voir la saison, une ligne pour comparer les années.",
  week: "Une ligne par année, une colonne par semaine depuis le 1er janvier (semaines de 7 jours, la dernière plus courte).",
  day: "Une année jour par jour. Chaque colonne est une semaine, du lundi au dimanche.",
  year: "Total annuel de l'indice harmonisé. Les années incomplètes ne sont pas comparables aux autres.",
};

export function CalendarView() {
  const { zone, from, to, setPeriod } = useFilters();
  const router = useRouter();
  const meta = useMetadata();
  const calendar = useCalendar(zone);
  // Vue du calendrier dans le magasin partage : l'assistant peut changer le pas de temps ou ouvrir un mois.
  const view = useView((v) => v.calendar);
  const granularity = view.granularity;
  const mode = view.mode;
  const month = view.month;
  const dayYear = view.dayYear ?? Number(to.slice(0, 4));
  const setGranularity = (g: Granularity) => updateView("calendar", { granularity: g });
  const setMode = (m: HeatMode) => updateView("calendar", { mode: m });
  const setMonth = (m: { year: number; month: number } | null) => updateView("calendar", { month: m });
  const setDayYear = (y: number) => updateView("calendar", { dayYear: y });
  const [span, setSpan] = useState<{ from: string; to: string } | null>(null);
  const daily = useDaily(zone, granularity === "week" || granularity === "day");
  const data = calendar.data;
  const zoneName = zoneLabel(zone, meta.data?.provinces);

  const monthBreaks = useMemo(() => (data ? activityBreaks(data.months.filter((m) => m.complete).map((m) => m.harmonized)) : []), [data]);
  const dayBreaks = useMemo(() => (daily.data ? activityBreaks(daily.data.harmonized) : []), [daily.data]);
  const weekBreaks = useMemo(
    () => (daily.data ? activityBreaks(weeklyRows(daily.data).flatMap((r) => r.weeks.filter((w) => w !== null && w.complete).map((w) => (w as { value: number }).value))) : []),
    [daily.data],
  );
  const years = data ? [...new Set(data.months.map((m) => m.year))].sort((a, b) => b - a) : [];
  const record = month && data ? data.months.find((m) => m.year === month.year && m.month === month.month) : undefined;

  const spanSummary = useMemo(() => {
    if (!span || !daily.data) return null;
    let value = 0, unobserved = 0, days = 0;
    const sources = new Set<number>();
    const a = dailyIndex(daily.data, span.from);
    const b = dailyIndex(daily.data, span.to);
    for (let i = a; i <= b; i++) {
      days++;
      if (i < 0 || i >= daily.data.harmonized.length || daily.data.source[i] < 0) unobserved++;
      else {
        value += daily.data.harmonized[i];
        sources.add(daily.data.source[i]);
      }
    }
    return { value, unobserved, days, sources: [...sources] };
  }, [span, daily.data]);

  const goToMap = (a: string, b: string) => {
    setPeriod(a, b);
    router.push("/map");
  };
  const monthRange = (y: number, m: number): [string, string] => [`${y}-${pad2(m)}-01`, `${y}-${pad2(m)}-${pad2(lastDayOfMonth(y, m))}`];
  const selectedInPeriod = (a: string, b: string) => from === a && to === b;

  return (
    <>
      <PageHeader
        title="Calendrier d'activité"
        lead={
          <>
            Vingt-cinq ans de détections MODIS et VIIRS ramenées à une même unité pour <span className="text-ink">{zoneName}</span>. Quels mois et quelles années ont été les plus actifs, et lesquels sortent de l'ordinaire.
          </>
        }
        actions={
          <a className={buttonClass("secondary", "md")} href={exportUrl("monthly", "csv", zone)} download>
            <DownloadSimple size={16} />
            Série mensuelle (CSV)
          </a>
        }
      />

      <Panel data-tour="calendar-grid">
        <PanelHeader
          title={
            granularity === "month"
              ? "Indice harmonisé par année et par mois"
              : granularity === "week"
                ? "Indice harmonisé par année et par semaine"
                : granularity === "day"
                  ? `Indice harmonisé jour par jour, ${dayYear}`
                  : "Indice harmonisé par année"
          }
          subtitle={GRANULARITY_TEXT[granularity]}
          help={DEFINITIONS.index}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {granularity === "day" ? (
                <select aria-label="Année affichée" className={cx(inputClass, "num h-8 w-[88px]")} value={dayYear} onChange={(e) => (setDayYear(Number(e.target.value)), setSpan(null))}>
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              ) : null}
              {granularity === "month" ? (
                <Segmented
                  label="Grandeur représentée"
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "activity", label: "Activité" },
                    { value: "deviation", label: "Écart à la référence" },
                  ]}
                />
              ) : null}
              <span data-tour="calendar-granularity" className="inline-flex">
              <Segmented
                label="Pas de temps"
                value={granularity}
                onChange={(g) => {
                  setGranularity(g);
                  setSpan(null);
                }}
                options={[
                  { value: "month", label: "Mois" },
                  { value: "week", label: "Semaine" },
                  { value: "day", label: "Jour" },
                  { value: "year", label: "Année" },
                ]}
              />
              </span>
            </div>
          }
        />

        <div className="px-5 pb-4 pt-4">
          {calendar.error ? (
            <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} />
          ) : !data ? (
            <ChartSkeleton height={520} />
          ) : granularity === "month" ? (
            <div className="flex flex-col gap-4">
              <MonthHeatmap months={data.months} years={data.years} mode={mode} breaks={monthBreaks} selected={month} onSelect={(y, m) => setMonth({ year: y, month: m })} />
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <ScaleLegend mode={mode} breaks={monthBreaks} unit="Cellules-jour actives par mois" />
                <HeatmapKey mode={mode} />
              </div>
            </div>
          ) : granularity === "year" ? (
            <div className="-mx-5">
              <AnnualChart years={data.years} highlight={month?.year} onSelect={(y) => (setDayYear(y), setGranularity("day"))} height={340} />
              <p className="px-5 pt-1 text-[12px] text-ink-3">Cliquez sur une année pour l'ouvrir jour par jour.</p>
            </div>
          ) : daily.error ? (
            <ErrorState error={daily.error} onRetry={() => daily.mutate()} />
          ) : !daily.data ? (
            <ChartSkeleton height={granularity === "day" ? 150 : 520} />
          ) : granularity === "day" ? (
            <div className="flex flex-col gap-4">
              <DayHeatmap daily={daily.data} year={dayYear} breaks={dayBreaks} selected={span && span.from === span.to ? span.from : null} onSelect={(iso) => setSpan({ from: iso, to: iso })} />
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <ScaleLegend mode="activity" breaks={dayBreaks} unit="Cellules-jour actives par jour" />
                <p className="text-[11.5px] text-ink-3">Hachures : aucun capteur en service ce jour. Une case sombre signifie « aucune détection retenue », pas « aucun feu ».</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <WeekHeatmap daily={daily.data} breaks={weekBreaks} selected={span} onSelect={(a, b) => setSpan({ from: a, to: b })} />
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <ScaleLegend mode="activity" breaks={weekBreaks} unit="Cellules-jour actives par semaine" />
                <p className="text-[11.5px] text-ink-3">Hachures : semaine incomplètement observée ou hors couverture.</p>
              </div>
            </div>
          )}
        </div>
        <SourceNote provenance={data?.provenance} extra={`Unité : ${UNIT}.`} />
      </Panel>

      {/* Detail de la selection */}
      {granularity === "month" || granularity === "year" ? (
        <Panel>
          {record && data ? (
            <>
              <PanelHeader
                title={monthLabel(record.month, record.year).replace(/^./, (c) => c.toUpperCase())}
                subtitle={`Comparé au mois de ${MONTHS[record.month - 1]} des autres années, pour ${zoneName}.`}
                actions={
                  <>
                    <Button size="sm" onClick={() => setPeriod(...monthRange(record.year, record.month))} disabled={selectedInPeriod(...monthRange(record.year, record.month))}>
                      <CalendarCheck size={15} />
                      {selectedInPeriod(...monthRange(record.year, record.month)) ? "Période active" : "Utiliser comme période"}
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => goToMap(...monthRange(record.year, record.month))}>
                      <MapTrifold size={15} />
                      Voir sur la carte
                    </Button>
                  </>
                }
              />
              <div className="grid grid-cols-1 gap-x-8 gap-y-5 px-5 py-4 xl:grid-cols-2">
                <div className="flex flex-col gap-4">
                  <AssessmentDetail a={record.assessment} referenceLabel={`${MONTHS[record.month - 1]}, années complètes`} />
                  <KindNote month={record} />
                </div>
                <div className="flex flex-col gap-4">
                  <div>
                    <p className="mb-2 text-[12px] font-medium text-ink-2">Détections natives du mois, par satellite</p>
                    <SatelliteCounts detections={record.detections} eligible={record.eligible} />
                  </div>
                  <div className="-mx-5 border-t border-line pt-1 xl:mx-0 xl:rounded-control xl:border">
                    <SeasonalChart months={data.months} baselines={data.baselines} year={record.year} height={210} onSelect={(m) => setMonth({ year: record.year, month: m })} />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <EmptyState title="Sélectionnez un mois dans le calendrier">
              Le détail affiche la valeur, la référence saisonnière, le score d'écart, sa fiabilité et les détections natives de chaque satellite.
            </EmptyState>
          )}
        </Panel>
      ) : (
        <Panel>
          {span && spanSummary ? (
            <>
              <PanelHeader
                title={span.from === span.to ? fmtDate(span.from).replace(/^./, (c) => c.toUpperCase()) : `Du ${fmtDate(span.from)} au ${fmtDate(span.to)}`}
                subtitle={`Indice harmonisé pour ${zoneName}.`}
                actions={
                  <>
                    <Button size="sm" onClick={() => setPeriod(span.from, span.to)} disabled={selectedInPeriod(span.from, span.to)}>
                      <CalendarCheck size={15} />
                      {selectedInPeriod(span.from, span.to) ? "Période active" : "Utiliser comme période"}
                    </Button>
                    <Button size="sm" variant="primary" onClick={() => goToMap(span.from, span.to)}>
                      <MapTrifold size={15} />
                      Voir sur la carte
                    </Button>
                  </>
                }
              />
              <div className="flex flex-col gap-3 px-5 py-4">
                <p className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className="num text-[30px] font-semibold leading-none tracking-[-0.02em] text-ink">{spanSummary.unobserved === spanSummary.days ? "n. d." : fmtInt(spanSummary.value)}</span>
                  <span className="text-[13px] text-ink-3">cellules-jour actives</span>
                </p>
                <p className="text-[13px] leading-relaxed text-ink-2">
                  {spanSummary.unobserved === spanSummary.days
                    ? "Aucun capteur en service sur ces dates : aucune valeur n'est affichée."
                    : `Alimenté par ${spanSummary.sources.map((s) => CONFIG_LABEL[CONFIG_KEYS[s]]).join(", ")}.`}
                  {spanSummary.unobserved > 0 && spanSummary.unobserved < spanSummary.days ? ` ${spanSummary.unobserved} jour(s) sans capteur : la valeur est sous-estimée.` : ""}
                </p>
                <Notice>
                  À l'échelle du jour ou de la semaine, la couverture nuageuse et le calendrier des passages pèsent lourd. Aucune qualification « inhabituel » n'est calculée à ce pas de temps : elle repose sur les mois.
                </Notice>
              </div>
            </>
          ) : (
            <EmptyState title={granularity === "day" ? "Sélectionnez un jour" : "Sélectionnez une semaine"}>La valeur, le capteur qui l'alimente et un accès direct à la carte s'affichent ici.</EmptyState>
          )}
        </Panel>
      )}

      {/* Saisonnalite : periodes critiques */}
      <Panel>
        <PanelHeader
          title="Saison habituelle : les mois critiques de la zone"
          subtitle={
            data
              ? data.criticalMonths.length
                ? `${data.criticalMonths.map((m) => MONTHS[m - 1]).join(", ")} concentrent 80 % de l'activité médiane annuelle.`
                : "Activité trop faible pour dégager une saison."
              : "Médiane de l'indice harmonisé par mois calendaire."
          }
          help={DEFINITIONS.critical}
        />
        {calendar.error ? <ErrorState error={calendar.error} compact /> : data ? <ClimatologyChart baselines={data.baselines} /> : <ChartSkeleton height={220} />}
        <SourceNote provenance={data?.provenance} extra="Une période critique décrit la saisonnalité habituelle. Elle ne prédit pas l'activité d'une année à venir." />
      </Panel>
    </>
  );
}
