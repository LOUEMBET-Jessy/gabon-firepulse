"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ArrowDownRight, ArrowRight as Flat, ArrowUpRight, GitDiff } from "@phosphor-icons/react/dist/ssr";

import { MoreLink } from "@/components/blocks";
import { AnnualChart, HistoryChart, Legend, TooltipCard, TooltipRow, monthTick, useNarrow } from "@/components/charts";
import { zoneLabel } from "@/components/shell/pickers";
import { pageIcon } from "@/components/shell/shell";
import { ChartSkeleton, ErrorState, InfoTip, PageHeader, Panel, PanelHeader, Segmented, SourceNote, cx, inputClass } from "@/components/ui";
import { useCalendar, useMetadata } from "@/lib/api";
import { fmt2, fmtDelta, fmtInt, fmtPct, fmtPeriod, MONTHS, MONTHS_SHORT } from "@/lib/format";
import { DEFINITIONS, UNIT } from "@/lib/labels";
import type { TrendResult } from "@/lib/science/stats";
import type { CalendarResponse } from "@/lib/types";
import { useFilters } from "@/state/filters";

function trendSentence(t: TrendResult | null): string {
  if (!t) return "Moins de huit années complètes : la tendance n'est pas calculée.";
  const direction = t.slope > 0 ? "à la hausse" : "à la baisse";
  const p = t.pValue < 0.001 ? "inférieure à 0,001" : `de ${fmt2(t.pValue)}`;
  const pct = `${t.slope > 0 ? "+" : "−"}${fmt2(Math.abs(t.slopePctOfMedian))} % par an`;
  if (t.pValue < 0.05) return `Tendance ${direction} statistiquement significative sur ${t.n} années (${t.firstYear} à ${t.lastYear}) : ${pct}, valeur p ${p}.`;
  return `Aucune tendance monotone significative sur ${t.n} années (${t.firstYear} à ${t.lastYear}) : pente de ${pct}, valeur p ${p}.`;
}

function CompareYears({ calendar, a, b }: { calendar: CalendarResponse; a: number; b: number }) {
  const narrow = useNarrow();
  const data = useMemo(
    () =>
      calendar.baselines.map((base) => {
        const pick = (year: number) => {
          const m = calendar.months.find((x) => x.year === year && x.month === base.month);
          return m && m.complete ? m.harmonized : null;
        };
        return { name: MONTHS_SHORT[base.month - 1], month: base.month, a: pick(a), b: pick(b), median: base.median };
      }),
    [calendar, a, b],
  );
  const swatch = (color: string, dashed = false) => (
    <svg width="18" height="8" aria-hidden>
      <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dashed ? "4 3" : undefined} />
    </svg>
  );
  return (
    <>
      <Legend>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
          {swatch("#f4f7fa")} {a}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
          {swatch("#12bfd2")} {b}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-2">{swatch("#8ea0b9", true)} Médiane de toutes les années</span>
      </Legend>
      <div style={{ height: 260 }} className="px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e3352" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#8ea0b9", fontSize: 11.5, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={{ stroke: "#1e3352" }} interval={0} tickFormatter={monthTick(narrow)} />
            <YAxis tick={{ fill: "#8ea0b9", fontSize: 11.5, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => fmtInt(v)} />
            <Tooltip
              cursor={{ stroke: "#2c4a70" }}
              isAnimationActive={false}
              content={({ active, payload }) => {
                const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                if (!active || !row) return null;
                return (
                  <TooltipCard title={MONTHS[row.month - 1].replace(/^./, (c) => c.toUpperCase())}>
                    <TooltipRow label={String(a)} value={row.a === null ? "incomplet" : fmtInt(row.a)} />
                    <TooltipRow label={String(b)} value={row.b === null ? "incomplet" : fmtInt(row.b)} />
                    <TooltipRow label="Médiane" value={fmtInt(row.median)} />
                    {row.a !== null && row.b !== null && row.a > 0 ? <TooltipRow label={`${b} par rapport à ${a}`} value={fmtDelta(row.b, row.a)} /> : null}
                  </TooltipCard>
                );
              }}
            />
            <Line dataKey="median" stroke="#8ea0b9" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} activeDot={false} />
            <Line dataKey="a" stroke="#f4f7fa" strokeWidth={2} dot={{ r: 3, fill: "#f4f7fa", stroke: "#10213a", strokeWidth: 1.5 }} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="b" stroke="#12bfd2" strokeWidth={2} dot={{ r: 3, fill: "#12bfd2", stroke: "#10213a", strokeWidth: 1.5 }} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/** Verdict court de la tendance : un mot, puis les chiffres qui le justifient. */
function trendVerdict(t: TrendResult | null): { word: string; tone: "up" | "down" | "flat" | "none" } {
  if (!t) return { word: "Non calculée", tone: "none" };
  if (t.pValue >= 0.05) return { word: "Pas de tendance nette", tone: "flat" };
  return t.slope > 0 ? { word: "En hausse", tone: "up" } : { word: "En baisse", tone: "down" };
}

export function TrendsView() {
  const { zone, from, to } = useFilters();
  const meta = useMetadata();
  const calendar = useCalendar(zone);
  const [trendScope, setTrendScope] = useState<"full" | "viirs">("full");
  const lastYear = Number(to.slice(0, 4));
  const [yearA, setYearA] = useState<number | null>(null);
  const [yearB, setYearB] = useState<number | null>(null);
  const data = calendar.data;
  const zoneName = zoneLabel(zone, meta.data);
  const completeYears = data ? data.years.filter((y) => y.complete).map((y) => y.year) : [];
  const b = yearB ?? lastYear;
  const a = yearA ?? (completeYears.includes(b - 1) ? b - 1 : (completeYears[completeYears.length - 2] ?? b));
  const trend = data ? (trendScope === "full" ? data.trends.full : data.trends.viirsOnly) : null;
  const yearTotals = (y: number) => data?.years.find((r) => r.year === y);
  const zoneCal = data?.calibration.configs.TA ?? null;
  // Calage juge fragile : non verifiable, ou plus de 20 % d'erreur annuelle en validation.
  const weakCalibration = Boolean(data?.calibration.local && zoneCal && (!zoneCal.verified || zoneCal.annualErrorLoyo === null || zoneCal.annualErrorLoyo > 0.2));
  const v = trendVerdict(trend);
  const VerdictIcon = v.tone === "up" ? ArrowUpRight : v.tone === "down" ? ArrowDownRight : Flat;

  return (
    <>
      <PageHeader
        icon={pageIcon("/trends")}
        title="Tendances"
        lead={
          <>
            Comment l'activité détectée pour <span className="font-medium text-ink">{zoneName}</span> évolue depuis 2000, et ce que la tendance permet vraiment de dire.
          </>
        }
      />

      {/* Le verdict de tendance, puis les totaux annuels qui le portent. */}
      <Panel className="overflow-hidden" data-tour="trend-chart">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
          <div className="flex flex-col gap-5 border-b border-line/70 p-6 xl:border-b-0 xl:border-r">
            <p className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
              Tendance des totaux annuels
              <InfoTip text="Pente de Theil-Sen (médiane des pentes entre toutes les paires d'années) et test de Mann-Kendall. Méthode robuste aux années extrêmes, sans hypothèse de loi normale." />
            </p>
            {data ? (
              <>
                <div className="flex items-center gap-3">
                  <span
                    className={cx(
                      "flex size-11 shrink-0 items-center justify-center rounded-[12px] border",
                      v.tone === "up" ? "border-critical/40 bg-critical/10 text-critical" : v.tone === "down" ? "border-div-n2/50 bg-div-n2/10 text-div-n2" : "border-line-strong bg-surface-2 text-ink-2",
                    )}
                  >
                    <VerdictIcon size={22} weight="bold" />
                  </span>
                  <p className="text-[22px] font-semibold leading-tight tracking-[-0.03em] text-ink">{v.word}</p>
                </div>
                <p className="text-[13.5px] leading-relaxed text-ink-2">{trendSentence(trend)}</p>
                {trend ? (
                  <dl className="grid grid-cols-[1.35fr_1fr_0.8fr] gap-2">
                    {(
                      [
                        ["Pente", `${trend.slope > 0 ? "+" : "−"}${fmt2(Math.abs(trend.slopePctOfMedian))} %/an`],
                        ["Valeur p", trend.pValue < 0.001 ? "< 0,001" : fmt2(trend.pValue)],
                        ["Années", String(trend.n)],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label} className="min-w-0 rounded-control bg-surface-2/70 px-2.5 py-2.5">
                        <dt className="text-[11.5px] text-ink-3">{label}</dt>
                        <dd className="num mt-0.5 whitespace-nowrap text-[14px] font-medium text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : null}
                <div className="flex flex-col gap-2">
                  <Segmented
                    label="Années prises en compte"
                    value={trendScope}
                    onChange={setTrendScope}
                    options={[
                      { value: "full", label: "Série harmonisée" },
                      { value: "viirs", label: "VIIRS seul" },
                    ]}
                  />
                  <p className="text-[12px] leading-relaxed text-ink-3">
                    {trendScope === "full"
                      ? "Depuis 2000, avec les années estimées depuis MODIS. Comparez avec « VIIRS seul » : sans calage, mais plus courte."
                      : "Depuis 2012, sur les seules années observées par VIIRS : aucune hypothèse de calage."}
                  </p>
                </div>
              </>
            ) : (
              <ChartSkeleton height={180} />
            )}
          </div>
          <div className="min-w-0">
            <PanelHeader title="Totaux annuels" subtitle="Barres hachurées : estimées depuis MODIS, avec leur intervalle. Contour seul : année incomplète." />
            {calendar.error ? <ErrorState error={calendar.error} compact /> : data ? <AnnualChart years={data.years} trend={trend} highlight={lastYear} /> : <ChartSkeleton height={280} />}
          </div>
        </div>
        <SourceNote
          provenance={data?.provenance}
          extra={
            trendScope === "full"
              ? `Intervalle des années estimées : étendue des rapports annuels observés en validation. Tendance sur les années complètes, hors années alimentées surtout par Terra seul. Elle dépend du calage MODIS : la comparer à la tendance VIIRS seul.${weakCalibration ? " Dans cette zone le calage est fragile : une tendance sur la série harmonisée peut refléter le changement de capteur plutôt que l'activité." : ""}`
              : "Tendance sur les seules années observées par VIIRS : aucune hypothèse de calage, mais une série plus courte."
          }
        />
      </Panel>

      <Panel>
        <PanelHeader
          title="Depuis 2000, mois par mois"
          subtitle="Indice harmonisé mensuel. Avant 2012, la valeur est estimée depuis MODIS : la bande montre l'incertitude du calage."
          help={DEFINITIONS.index}
          actions={<MoreLink href="/methodology">Comment c'est calculé</MoreLink>}
        />
        {calendar.error ? <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} /> : data ? <HistoryChart months={data.months} selection={{ from, to }} /> : <ChartSkeleton height={280} />}
        <SourceNote provenance={data?.provenance} extra={`Unité : ${UNIT}. Période sélectionnée : ${fmtPeriod(from, to).toLowerCase()}.`} />
      </Panel>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <PanelHeader
            title="Comparer deux années"
            subtitle={
              data && yearTotals(a) && yearTotals(b)
                ? `${b} : ${fmtInt(yearTotals(b)!.harmonized)} cellules-jour, soit ${fmtDelta(yearTotals(b)!.harmonized, yearTotals(a)!.harmonized)} par rapport à ${a}.`
                : "Profil mensuel de deux années."
            }
            actions={
              <div className="flex items-center gap-1.5">
                {(
                  [
                    [a, setYearA, "Première année"],
                    [b, setYearB, "Seconde année"],
                  ] as const
                ).map(([value, set, label]) => (
                  <select key={label} aria-label={label} className={cx(inputClass, "num h-8 w-[78px]")} value={value} onChange={(e) => set(Number(e.target.value))}>
                    {[...completeYears].reverse().map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                ))}
              </div>
            }
          />
          {calendar.error ? <ErrorState error={calendar.error} compact /> : data ? <CompareYears calendar={data} a={a} b={b} /> : <ChartSkeleton height={260} />}
          <SourceNote provenance={data?.provenance} />
        </Panel>

        {/* Pourquoi la serie tient : ce que le calage fait, et ses limites dans cette zone. */}
        <Panel className="flex flex-col xl:col-span-5" interactive>
          <PanelHeader icon={<GitDiff size={17} />} title="Une seule série pour deux familles de capteurs" subtitle="MODIS et VIIRS ne comptent pas la même chose. Avant 2012, les valeurs sont converties dans l'unité VIIRS." />
          <div className="flex flex-1 flex-col gap-4 px-5 py-5 text-[13.5px] leading-relaxed text-ink-2">
            {zoneCal && data?.calibration.local ? (
              <div className={cx("rounded-control border px-4 py-3", weakCalibration ? "border-warning/30 bg-warning/[0.06]" : "border-line-strong bg-surface-2/70")}>
                <p className="font-medium text-ink">Calage ajusté à la zone : facteur national multiplié par {fmt2(zoneCal.k)}</p>
                <p className="mt-1 text-[13px]">
                  Le rapport entre VIIRS et MODIS varie d'une région à l'autre. Le facteur national est corrigé avec les années communes de la zone ({fmtInt(zoneCal.referenceCellDays)} cellules-jour Suomi-NPP).{" "}
                  {zoneCal.annualErrorLoyo === null
                    ? "La zone est trop peu active pour mesurer l'erreur de ce calage."
                    : `Erreur annuelle médiane en retirant une année à la fois : ${fmtPct(zoneCal.annualErrorLoyo, 0)} sur ${zoneCal.yearsScored} années.`}{" "}
                  {weakCalibration ? "Les valeurs antérieures à 2012 sont ici peu sûres : pour une tendance, préférez « VIIRS seul »." : ""}
                </p>
              </div>
            ) : (
              <p>Le facteur de calage national est validé en retirant une année à la fois : l'erreur mesurée figure dans la bande d'incertitude des années estimées.</p>
            )}
            <p>Sans cette conversion, l'arrivée de VIIRS en 2012 ressemblerait à une hausse brutale des feux : ses pixels plus fins détectent plus de points pour la même activité.</p>
            <div className="mt-auto">
              <MoreLink href="/compare">Voir la comparaison des capteurs</MoreLink>
            </div>
          </div>
        </Panel>
      </div>
    </>
  );
}
