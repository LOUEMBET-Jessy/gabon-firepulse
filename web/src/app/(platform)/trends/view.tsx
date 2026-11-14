"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { MoreLink, RegionBars } from "@/components/blocks";
import { AnnualChart, HistoryChart, Legend, SensorCompareChart, TooltipCard, TooltipRow, type CompareUnit } from "@/components/charts";
import { zoneLabel } from "@/components/shell/pickers";
import { ChartSkeleton, ErrorState, Notice, PageHeader, Panel, PanelHeader, Segmented, SourceNote, cx, inputClass } from "@/components/ui";
import { useCalendar, useMetadata, useRegions } from "@/lib/api";
import { fmt1, fmt2, fmtDelta, fmtInt, fmtPct, fmtPeriod, MONTHS, MONTHS_SHORT } from "@/lib/format";
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
          {swatch("#e9edf5")} {a}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-2">
          {swatch("#56c8ee")} {b}
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-2">{swatch("#7b8aa5", true)} Médiane de toutes les années</span>
      </Legend>
      <div style={{ height: 260 }} className="px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="#1e2a42" vertical={false} />
            <XAxis dataKey="name" tick={{ fill: "#7b8aa5", fontSize: 11.5, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={{ stroke: "#1e2a42" }} interval={0} />
            <YAxis tick={{ fill: "#7b8aa5", fontSize: 11.5, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} width={46} tickFormatter={(v: number) => fmtInt(v)} />
            <Tooltip
              cursor={{ stroke: "#2f3f61" }}
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
            <Line dataKey="median" stroke="#7b8aa5" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} activeDot={false} />
            <Line dataKey="a" stroke="#e9edf5" strokeWidth={2} dot={{ r: 3, fill: "#e9edf5", stroke: "#0f1626", strokeWidth: 1.5 }} isAnimationActive={false} connectNulls={false} />
            <Line dataKey="b" stroke="#56c8ee" strokeWidth={2} dot={{ r: 3, fill: "#56c8ee", stroke: "#0f1626", strokeWidth: 1.5 }} isAnimationActive={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

export function TrendsView() {
  const { zone, from, to, setZone } = useFilters();
  const meta = useMetadata();
  const calendar = useCalendar(zone);
  const regions = useRegions(from, to);
  const [trendScope, setTrendScope] = useState<"full" | "viirs">("full");
  const [unit, setUnit] = useState<CompareUnit>("detections");
  const lastYear = Number(to.slice(0, 4));
  const [yearA, setYearA] = useState<number | null>(null);
  const [yearB, setYearB] = useState<number | null>(null);
  const data = calendar.data;
  const zoneName = zoneLabel(zone, meta.data?.provinces);
  const completeYears = data ? data.years.filter((y) => y.complete).map((y) => y.year) : [];
  const b = yearB ?? lastYear;
  const a = yearA ?? (completeYears.includes(b - 1) ? b - 1 : (completeYears[completeYears.length - 2] ?? b));
  const trend = data ? (trendScope === "full" ? data.trends.full : data.trends.viirsOnly) : null;
  const cal = meta.data?.harmonization.calibration;
  const factors = cal?.TA && cal?.N ? { TA: cal.TA.factors_by_month, N: cal.N.factors_by_month } : null;
  const unitComparison = meta.data?.harmonization.diagnostics.unit_comparison;
  const yearTotals = (y: number) => data?.years.find((r) => r.year === y);
  const zoneCal = data?.calibration.configs.TA ?? null;
  // Calage juge fragile : non verifiable, ou plus de 20 % d'erreur annuelle en validation.
  const weakCalibration = Boolean(data?.calibration.local && zoneCal && (!zoneCal.verified || zoneCal.annualErrorLoyo === null || zoneCal.annualErrorLoyo > 0.2));

  const unitText: Record<CompareUnit, string> = {
    detections:
      "Comparaison brute : VIIRS signale plusieurs fois plus de détections que MODIS pour la même activité, parce que ses pixels sont plus petits et plus sensibles. Additionner ou comparer ces nombres tels quels est trompeur.",
    celldays:
      "Première étape : compter les cellules actives par jour plutôt que les pixels. L'effet de la taille de pixel disparaît en grande partie, mais MODIS détecte toujours moins de cellules que VIIRS.",
    calibrated:
      "Seconde étape : MODIS est converti en équivalent Suomi-NPP par un facteur estimé sur les années communes. Les courbes se superposent : c'est ce qui autorise une série continue de 2000 à 2025.",
  };

  return (
    <>
      <PageHeader
        title="Tendances"
        lead={
          <>
            Évolution de l'activité détectée pour <span className="text-ink">{zoneName}</span>, et démonstration de ce que l'harmonisation MODIS et VIIRS change.
          </>
        }
      />

      <Panel>
        <PanelHeader
          title="Une série continue de 2000 à 2025"
          subtitle="Indice harmonisé mensuel. Avant 2012, la valeur est estimée depuis MODIS : la bande montre l'incertitude du calage."
          help={DEFINITIONS.index}
          actions={<MoreLink href="/methodology">Comment c'est calculé</MoreLink>}
        />
        {calendar.error ? <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} /> : data ? <HistoryChart months={data.months} selection={{ from, to }} /> : <ChartSkeleton height={280} />}
        <SourceNote provenance={data?.provenance} extra={`Unité : ${UNIT}. Période sélectionnée : ${fmtPeriod(from, to).toLowerCase()}.`} />
      </Panel>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <PanelHeader
            title="Totaux annuels et tendance"
            subtitle={data ? trendSentence(trend) : "Calcul de la tendance."}
            help="Pente de Theil-Sen (médiane des pentes entre toutes les paires d'années) et test de Mann-Kendall. Méthode robuste aux années extrêmes, sans hypothèse de loi normale."
            actions={
              <Segmented
                label="Années prises en compte"
                value={trendScope}
                onChange={setTrendScope}
                options={[
                  { value: "full", label: "Série harmonisée" },
                  { value: "viirs", label: "VIIRS seul" },
                ]}
              />
            }
          />
          {calendar.error ? <ErrorState error={calendar.error} compact /> : data ? <AnnualChart years={data.years} trend={trend} highlight={lastYear} /> : <ChartSkeleton height={280} />}
          <SourceNote
            provenance={data?.provenance}
            extra={
              trendScope === "full"
                ? `Tendance sur les années complètes, hors années alimentées surtout par Terra seul. Elle dépend du calage MODIS : la comparer à la tendance VIIRS seul.${weakCalibration ? " Dans cette zone le calage est fragile : une tendance sur la série harmonisée peut refléter le changement de capteur plutôt que l'activité." : ""}`
                : "Tendance sur les seules années observées par VIIRS : aucune hypothèse de calage, mais une série plus courte."
            }
          />
        </Panel>

        <Panel className="xl:col-span-5">
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
      </div>

      <Panel>
        <PanelHeader
          title="Ce que l'harmonisation corrige"
          subtitle="MODIS et VIIRS sur leurs années communes, dans trois unités successives."
          actions={
            <Segmented
              label="Unité de comparaison"
              value={unit}
              onChange={setUnit}
              options={[
                { value: "detections", label: "Détections brutes" },
                { value: "celldays", label: "Cellules-jour" },
                { value: "calibrated", label: "Après calage" },
              ]}
            />
          }
        />
        <div className="grid grid-cols-1 gap-x-6 xl:grid-cols-12">
          <div className="xl:col-span-8">{calendar.error ? <ErrorState error={calendar.error} compact /> : data ? <SensorCompareChart calendar={data} factors={factors} unit={unit} /> : <ChartSkeleton height={280} />}</div>
          <div className="flex flex-col gap-3 px-5 pb-4 pt-4 xl:col-span-4 xl:pl-0">
            <p className="text-[13.5px] leading-relaxed text-ink-2">{unitText[unit]}</p>
            {cal?.TA && cal.N ? (
              <dl className="flex flex-col text-[13px]">
                {(
                  [
                    ["Facteur MODIS vers VIIRS", `${fmt2(Math.min(...cal.TA.factors_by_month))} à ${fmt2(Math.max(...cal.TA.factors_by_month))} selon le mois`],
                    ["Erreur mensuelle médiane, hors échantillon", fmtPct(cal.TA.validation.monthly_median_abs_pct_error, 1)],
                    ["Erreur annuelle moyenne, hors échantillon", fmtPct(cal.TA.validation.annual_mean_abs_pct_error, 1)],
                    ["Corrélation mensuelle", fmt2(cal.TA.validation.monthly_correlation)],
                    ["Facteur NOAA-20 vers Suomi-NPP", fmt2(cal.N.factors_by_month[0])],
                    ["Années communes", `${cal.TA.overlap_first_year} à ${cal.TA.overlap_last_year}`],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
                    <dt className="text-ink-3">{label}</dt>
                    <dd className="num shrink-0 text-right text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {unitComparison ? (
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                En détections brutes, le rapport VIIRS sur MODIS est de {fmt1(unitComparison.raw_detections.factor_global)} ; en cellules-jour il tombe à {fmt1(unitComparison.cell_days.factor_global)}. Le gain de précision reste modeste : l'erreur mensuelle médiane passe de{" "}
                {fmtPct(unitComparison.raw_detections.monthly_median_abs_pct_error, 1)} à {fmtPct(unitComparison.cell_days.monthly_median_abs_pct_error, 1)}, et l'erreur annuelle ne s'améliore pas ({fmtPct(unitComparison.raw_detections.annual_mean_abs_pct_error, 1)} contre{" "}
                {fmtPct(unitComparison.cell_days.annual_mean_abs_pct_error, 1)}). L'intérêt principal de la cellule-jour est d'empêcher qu'une même activité soit comptée plusieurs fois.
              </p>
            ) : null}
          </div>
        </div>
        <SourceNote provenance={data?.provenance} extra="Les facteurs de calage sont estimés au niveau national puis appliqués à toute zone. Détections retenues uniquement (feu de végétation présumé, confiance non faible)." />
      </Panel>

      {zoneCal && data?.calibration.local ? (
        <Notice tone={weakCalibration ? "warning" : "info"} title={`Calage ajusté à la zone : facteur national multiplié par ${fmt2(zoneCal.k)}`}>
          Le rapport entre VIIRS et MODIS n'est pas le même en savane et en forêt dense. Le facteur national est donc corrigé avec les années communes de la zone ({fmtInt(zoneCal.referenceCellDays)} cellules-jour Suomi-NPP).{" "}
          {zoneCal.annualErrorLoyo === null
            ? "La zone est trop peu active pour mesurer l'erreur de ce calage."
            : `Erreur annuelle médiane en retirant une année à la fois : ${fmtPct(zoneCal.annualErrorLoyo, 0)} sur ${zoneCal.yearsScored} années.`}{" "}
          {weakCalibration ? "Les valeurs antérieures à 2012 sont ici peu sûres : pour une tendance, préférez « VIIRS seul »." : ""}
        </Notice>
      ) : null}

      <Panel>
        <PanelHeader title="Répartition par province" subtitle={`Indice harmonisé, ${fmtPeriod(from, to).toLowerCase()}. Sélectionnez une province pour en faire la zone d'analyse.`} />
        {regions.error ? (
          <ErrorState error={regions.error} onRetry={() => regions.mutate()} compact />
        ) : regions.data ? (
          <RegionBars regions={regions.data.regions} activeIndex={zone.kind === "province" ? zone.index : null} onSelect={(index) => setZone({ kind: "province", index })} />
        ) : (
          <ChartSkeleton height={260} />
        )}
        <SourceNote provenance={regions.data?.provenance} extra="Densité : cellules-jour pour 1 000 km². Aucune corrélation avec d'autres variables n'est calculée ici : les données chargées ne le justifient pas." />
      </Panel>
    </>
  );
}
