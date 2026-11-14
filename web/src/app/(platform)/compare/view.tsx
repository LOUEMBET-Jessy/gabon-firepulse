"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { SensorCompareChart, TooltipCard, TooltipRow } from "@/components/charts";
import { zoneLabel } from "@/components/shell/pickers";
import { ChartSkeleton, ErrorState, InfoTip, Notice, PageHeader, Panel, PanelHeader, Segmented, SensorMark, SourceNote } from "@/components/ui";
import { useCalendar, useMetadata, useOverview } from "@/lib/api";
import { fmt1, fmt2, fmtInt, fmtPct, fmtPeriod } from "@/lib/format";
import { CONFIG_LABEL, SATELLITES, SENSOR_COLOR } from "@/lib/labels";
import type { ConfigKey } from "@/lib/types";
import { useFilters } from "@/state/filters";
import { updateView, useView, type CompareUnit } from "@/state/view";

const UNIT_TEXT: Record<CompareUnit, { title: string; body: string }> = {
  detections: {
    title: "Comparaison brute",
    body: "VIIRS signale plusieurs fois plus de détections que MODIS pour la même activité : ses pixels sont plus petits et plus sensibles. Additionner ou comparer ces nombres tels quels est trompeur.",
  },
  celldays: {
    title: "Étape 1 : compter des cellules-jour",
    body: "On compte les cellules de 0,05° actives chaque jour plutôt que les pixels. L'effet de la taille de pixel diminue fortement, mais MODIS voit toujours moins de cellules que VIIRS.",
  },
  calibrated: {
    title: "Étape 2 : caler MODIS sur VIIRS",
    body: "MODIS est converti en équivalent Suomi-NPP par un facteur mesuré sur les années communes. Les courbes se superposent : c'est ce qui autorise une série continue de 2000 à 2025.",
  },
};

const ROW_STYLE: Record<ConfigKey, { color: string; shape: "square" | "circle" }> = {
  T: { color: SENSOR_COLOR.modis, shape: "square" },
  A: { color: SENSOR_COLOR.modis, shape: "square" },
  TA: { color: SENSOR_COLOR.modis, shape: "square" },
  S: { color: SENSOR_COLOR.snpp, shape: "circle" },
  N: { color: SENSOR_COLOR.noaa20, shape: "circle" },
};

export function CompareView() {
  const { zone, from, to } = useFilters();
  const meta = useMetadata();
  const calendar = useCalendar(zone);
  const overview = useOverview(zone, from, to);
  const unit = useView((v) => v.compare.unit);
  const data = calendar.data;
  const o = overview.data;
  const cal = meta.data?.harmonization.calibration;
  const factors = cal?.TA && cal?.N ? { TA: cal.TA.factors_by_month, N: cal.N.factors_by_month } : null;
  const unitComparison = meta.data?.harmonization.diagnostics.unit_comparison;
  const zoneCal = data?.calibration.configs.TA ?? null;
  const reference = o?.sensors.find((s) => s.config === "S");
  const ratios = meta.data?.harmonization.diagnostics.yearly_ratio.filter((r) => r.TA !== null) ?? [];

  return (
    <>
      <PageHeader
        title="Comparer MODIS et VIIRS"
        lead={
          <>
            Deux familles de capteurs, deux façons de voir le même feu. Cette page montre pourquoi on ne peut pas les additionner, et comment Hot-Spot les rend comparables pour{" "}
            <span className="text-ink">{zoneLabel(zone, meta.data?.provinces)}</span>.
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {(
          [
            ["MODIS", "Terra et Aqua, depuis 2000", "Pixel de 1 km au nadir. Longue série historique, moins sensible aux petits feux.", SENSOR_COLOR.modis, "square"],
            ["VIIRS Suomi-NPP", "Depuis janvier 2012", "Pixel de 375 m. Référence de l'harmonisation : les autres capteurs sont exprimés dans son unité.", SENSOR_COLOR.snpp, "circle"],
            ["VIIRS NOAA-20", "Depuis avril 2018", "Même instrument, autre satellite. Prend le relais quand Suomi-NPP est interrompu.", SENSOR_COLOR.noaa20, "circle"],
          ] as const
        ).map(([name, since, body, color, shape]) => (
          <Panel key={name} className="flex flex-col gap-2 p-5">
            <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
              <SensorMark color={color} shape={shape} size={11} />
              {name}
            </p>
            <p className="text-[12.5px] text-ink-3">{since}</p>
            <p className="text-[13.5px] leading-relaxed text-ink-2">{body}</p>
          </Panel>
        ))}
      </div>

      <Panel data-tour="compare-chart">
        <PanelHeader
          title="Ce que l'harmonisation corrige"
          subtitle="Totaux annuels sur les années complètes de chaque capteur, dans trois unités successives."
          actions={
            <Segmented
              label="Unité de comparaison"
              value={unit}
              onChange={(u) => updateView("compare", { unit: u })}
              options={[
                { value: "detections", label: "Détections brutes" },
                { value: "celldays", label: "Cellules-jour" },
                { value: "calibrated", label: "Après calage" },
              ]}
            />
          }
        />
        <div className="grid grid-cols-1 gap-x-6 xl:grid-cols-12">
          <div className="xl:col-span-8">{calendar.error ? <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} compact /> : data ? <SensorCompareChart calendar={data} factors={factors} unit={unit} /> : <ChartSkeleton height={280} />}</div>
          <div className="flex flex-col gap-3 px-5 pb-5 pt-4 xl:col-span-4 xl:pl-0">
            <p className="text-[14px] font-medium text-ink">{UNIT_TEXT[unit].title}</p>
            <p className="text-[13.5px] leading-relaxed text-ink-2">{UNIT_TEXT[unit].body}</p>
            {cal?.TA ? (
              <dl className="mt-1 flex flex-col text-[13px]">
                {(
                  [
                    ["Facteur MODIS vers VIIRS", `${fmt2(Math.min(...cal.TA.factors_by_month))} à ${fmt2(Math.max(...cal.TA.factors_by_month))} selon le mois`],
                    ["Erreur annuelle moyenne, hors échantillon", fmtPct(cal.TA.validation.annual_mean_abs_pct_error, 1)],
                    ["Erreur mensuelle médiane, hors échantillon", fmtPct(cal.TA.validation.monthly_median_abs_pct_error, 1)],
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
          </div>
        </div>
        <SourceNote provenance={data?.provenance} extra="Détections retenues uniquement : feu de végétation présumé, confiance non faible." />
      </Panel>

      <Panel data-tour="compare-period">
        <PanelHeader
          title={`Chaque capteur sur la période : ${fmtPeriod(from, to).toLowerCase()}`}
          subtitle="Mesuré séparément, sur les seuls jours où le capteur était en service. Ces lignes ne s'additionnent pas : ce sont plusieurs regards sur la même activité."
          help="L'équivalent Suomi-NPP applique à chaque configuration son facteur de calage, ajusté à la zone. C'est ce qui permet de lire les lignes côte à côte."
        />
        {overview.error ? (
          <ErrorState error={overview.error} onRetry={() => overview.mutate()} compact />
        ) : !o ? (
          <ChartSkeleton height={220} />
        ) : (
          <div className="overflow-x-auto px-5 py-4">
            <table className="w-full min-w-[640px] text-left text-[13px]">
              <thead>
                <tr className="text-[12px] text-ink-3">
                  <th className="pb-2 font-normal">Configuration</th>
                  <th className="pb-2 text-right font-normal">Jours en service</th>
                  <th className="pb-2 text-right font-normal">Cellules-jour brutes</th>
                  <th className="pb-2 text-right font-normal">
                    <span className="inline-flex items-center gap-1">
                      Facteur
                      <InfoTip text="Facteur moyen appliqué sur la période : il varie selon le mois et la zone." />
                    </span>
                  </th>
                  <th className="pb-2 text-right font-normal">Équivalent Suomi-NPP</th>
                  <th className="pb-2 text-right font-normal">Par rapport à Suomi-NPP</th>
                </tr>
              </thead>
              <tbody>
                {(["S", "N", "TA", "A", "T"] as ConfigKey[]).map((key) => {
                  const row = o.sensors.find((s) => s.config === key);
                  if (!row) return null;
                  const none = row.daysObserved === 0;
                  const sameDays = reference && reference.daysObserved === row.daysObserved;
                  return (
                    <tr key={key} className="border-t border-line">
                      <td className="py-2">
                        <span className="flex items-center gap-2 text-ink">
                          <SensorMark color={ROW_STYLE[key].color} shape={ROW_STYLE[key].shape} size={9} />
                          {CONFIG_LABEL[key]}
                          {key === "S" ? <span className="rounded-full border border-accent/40 px-1.5 py-px text-[10.5px] text-accent">référence</span> : null}
                        </span>
                      </td>
                      <td className="num py-2 text-right text-ink-2">{none ? "hors service" : `${fmtInt(row.daysObserved)} / ${fmtInt(o.days)}`}</td>
                      <td className="num py-2 text-right text-ink">{none ? "" : fmtInt(row.cellDays)}</td>
                      <td className="num py-2 text-right text-ink-2">{none || row.factor === null ? "" : fmt2(row.factor)}</td>
                      <td className="num py-2 text-right text-ink">{none ? "" : fmtInt(row.equivalent)}</td>
                      <td className="num py-2 text-right text-ink-2">
                        {none || key === "S" || !reference || reference.equivalent === 0
                          ? ""
                          : `${row.equivalent >= reference.equivalent ? "+" : "−"}${fmtPct(Math.abs(row.equivalent / reference.equivalent - 1))}${sameDays ? "" : "*"}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
              * jours d'observation différents de ceux de Suomi-NPP : l'écart mélange alors la différence de capteur et la différence de couverture. Seul l'indice harmonisé (un capteur par jour) se compare d'une période à l'autre.
            </p>
          </div>
        )}
        <SourceNote provenance={o?.provenance} />
      </Panel>

      {zoneCal && data?.calibration.local ? (
        <Notice tone={!zoneCal.verified || (zoneCal.annualErrorLoyo ?? 1) > 0.2 ? "warning" : "info"} title={`Calage ajusté à la zone : facteur national multiplié par ${fmt2(zoneCal.k)}`}>
          Le rapport entre VIIRS et MODIS varie d'une région à l'autre. Le facteur national est corrigé avec les années communes de la zone ({fmtInt(zoneCal.referenceCellDays)} cellules-jour Suomi-NPP).{" "}
          {zoneCal.annualErrorLoyo === null
            ? "La zone est trop peu active pour mesurer l'erreur de ce calage."
            : `Erreur annuelle médiane en retirant une année à la fois : ${fmtPct(zoneCal.annualErrorLoyo)} sur ${zoneCal.yearsScored} années.`}
        </Notice>
      ) : null}

      <Panel>
        <PanelHeader
          title="Le rapport entre capteurs n'est pas constant"
          subtitle="Rapport annuel VIIRS Suomi-NPP sur MODIS Terra + Aqua, en cellules-jour, pays entier. Plus bas en fin de période."
          help="Deux explications plausibles, non vérifiées avec les données chargées : la dérive des orbites de Terra et d'Aqua, qui déplace leur heure de passage, et les interruptions de Suomi-NPP en 2024."
        />
        {ratios.length ? (
          <div style={{ height: 230 }} className="px-2 pb-2 pt-3">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={ratios} margin={{ top: 12, right: 18, bottom: 0, left: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="year" tick={{ fill: "var(--color-ink-3)", fontSize: 11.5, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={{ stroke: "var(--color-line)" }} />
                <YAxis domain={[0, 4]} tick={{ fill: "var(--color-ink-3)", fontSize: 11.5, fontFamily: "var(--font-mono)" }} tickLine={false} axisLine={false} width={40} tickFormatter={(v: number) => fmt1(v)} />
                {cal?.TA ? (
                  <ReferenceLine
                    y={cal.TA.factors_by_month.reduce((a, b) => a + b, 0) / 12}
                    stroke="var(--color-ink-3)"
                    strokeDasharray="4 3"
                    label={{ value: "facteur moyen", fill: "var(--color-ink-3)", fontSize: 11, position: "insideTopRight" }}
                  />
                ) : null}
                <Tooltip
                  cursor={{ stroke: "var(--color-line-strong)" }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as (typeof ratios)[number] | undefined;
                    if (!active || !row) return null;
                    return (
                      <TooltipCard title={`Année ${row.year}`}>
                        <TooltipRow label="VIIRS / MODIS Terra + Aqua" value={fmt2(row.TA)} />
                        {row.N !== null ? <TooltipRow label="Suomi-NPP / NOAA-20" value={fmt2(row.N)} /> : null}
                      </TooltipCard>
                    );
                  }}
                />
                <Line dataKey="TA" stroke={SATELLITES.terra.color} strokeWidth={2} dot={{ r: 3, fill: SATELLITES.terra.color, stroke: "var(--color-surface)", strokeWidth: 1.5 }} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartSkeleton height={230} />
        )}
        {unitComparison ? (
          <p className="border-t border-line px-5 py-3 text-[12.5px] leading-relaxed text-ink-3">
            En détections brutes, VIIRS en signale {fmt1(unitComparison.raw_detections.factor_global)} fois plus que MODIS ; en cellules-jour, {fmt1(unitComparison.cell_days.factor_global)} fois plus. La cellule-jour n'améliore guère la précision du calage, mais elle empêche de compter plusieurs fois une même activité.
          </p>
        ) : null}
      </Panel>
    </>
  );
}
