"use client";

import { CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { SensorCompareChart, TooltipCard, TooltipRow } from "@/components/charts";
import { zoneLabel } from "@/components/shell/pickers";
import { pageIcon } from "@/components/shell/shell";
import { ChartSkeleton, ErrorState, InfoTip, Notice, PageHeader, Panel, PanelHeader, SensorMark, SourceNote, cx } from "@/components/ui";
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

const STEPS: { value: CompareUnit; label: string }[] = [
  { value: "detections", label: "Détections brutes" },
  { value: "celldays", label: "Cellules-jour" },
  { value: "calibrated", label: "Après calage" },
];

/** Les trois unites, presentees comme les etapes d'un raisonnement plutot que comme des onglets. */
function Stepper({ value, onChange }: { value: CompareUnit; onChange: (u: CompareUnit) => void }) {
  const current = STEPS.findIndex((s) => s.value === value);
  return (
    <div role="radiogroup" aria-label="Unité de comparaison" className="grid grid-cols-3 gap-2">
      {STEPS.map((step, i) => {
        const active = i === current;
        const done = i < current;
        return (
          <button
            key={step.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(step.value)}
            className={cx(
              "group relative flex items-center gap-2.5 rounded-control border px-3 py-2.5 text-left text-[13px] font-medium transition-colors duration-200",
              active ? "border-accent/70 bg-accent/10 text-ink" : "border-line-strong bg-surface-2/60 text-ink-2 hover:border-ink-3 hover:text-ink",
            )}
          >
            <span
              aria-hidden
              className={cx(
                "num flex size-6 shrink-0 items-center justify-center rounded-full border text-[11.5px] transition-colors",
                active ? "border-accent bg-accent text-accent-ink" : done ? "border-accent/60 text-accent" : "border-line-strong text-ink-3",
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0 truncate">{step.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Les capteurs cote a cote : la taille de pixel dessinee a l'echelle (1 km contre 375 m),
 * puis les annees de service sur une meme frise. C'est ce qui explique qu'on ne les additionne pas.
 */
function SensorLineup() {
  const first = 2000;
  const last = 2026;
  const pos = (year: number) => `${((year - first) / (last - first)) * 100}%`;
  const rows = [
    { name: "MODIS Terra et Aqua", detail: "Pixel de 1 km. La longue série historique, moins sensible aux petits feux.", from: 2000.83, color: SENSOR_COLOR.modis, shape: "square" as const },
    { name: "VIIRS Suomi-NPP", detail: "Pixel de 375 m. La référence : les autres capteurs sont convertis dans son unité.", from: 2012, color: SENSOR_COLOR.snpp, shape: "circle" as const },
    { name: "VIIRS NOAA-20", detail: "Même instrument, autre satellite. Prend le relais quand Suomi-NPP est interrompu.", from: 2018.25, color: SENSOR_COLOR.noaa20, shape: "circle" as const },
  ];
  // Echelle du dessin : 1 km = 132 px, donc 375 m = 49,5 px.
  const modisPx = 132;
  const viirsPx = modisPx * 0.375;
  return (
    <Panel className="overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
        <figure className="flex flex-col items-center gap-4 border-b border-line/70 p-6 lg:border-b-0 lg:border-r">
          <div className="relative" style={{ width: modisPx, height: modisPx }} aria-hidden>
            <div className="absolute inset-0 rounded-[3px] border-2" style={{ borderColor: SENSOR_COLOR.modis, backgroundColor: `${SENSOR_COLOR.modis}1f` }} />
            <div
              className="absolute inset-0 rounded-[3px]"
              style={{
                backgroundImage: `linear-gradient(to right, ${SENSOR_COLOR.snpp}66 1px, transparent 1px), linear-gradient(to bottom, ${SENSOR_COLOR.snpp}66 1px, transparent 1px)`,
                backgroundSize: `${viirsPx}px ${viirsPx}px`,
              }}
            />
            <div className="absolute left-0 top-0 rounded-[2px] border-2" style={{ width: viirsPx, height: viirsPx, borderColor: SENSOR_COLOR.snpp, backgroundColor: `${SENSOR_COLOR.snpp}40` }} />
          </div>
          <figcaption className="text-center text-[12.5px] leading-relaxed text-ink-2">
            Un pixel MODIS couvre environ <span className="num text-ink">7</span> pixels VIIRS. Pour un même feu, VIIRS signale donc bien plus de points.
          </figcaption>
        </figure>
        <div className="flex flex-col justify-center gap-5 p-6">
          {rows.map((r) => (
            <div key={r.name} className="grid grid-cols-1 gap-2 md:grid-cols-[220px_minmax(0,1fr)] md:items-center md:gap-5">
              <div>
                <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
                  <SensorMark color={r.color} shape={r.shape} size={10} />
                  {r.name}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-ink-3">{r.detail}</p>
              </div>
              <div className="relative h-9">
                <span className="absolute bottom-[5px] left-0 right-0 h-1 rounded-full bg-surface-3" />
                <span className="absolute bottom-[3px] h-2 rounded-full" style={{ left: pos(r.from), right: `calc(100% - ${pos(2026)})`, backgroundColor: r.color }} />
                <span className="num absolute top-0 text-[11px] text-ink-2" style={{ left: pos(r.from) }}>
                  depuis {Math.floor(r.from)}
                </span>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] md:gap-5">
            <span className="hidden md:block" />
            <div className="num flex justify-between text-[10.5px] text-ink-3">
              <span>2000</span>
              <span>2006</span>
              <span>2012</span>
              <span>2018</span>
              <span>2025</span>
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}

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
        icon={pageIcon("/compare")}
        title="Comparer MODIS et VIIRS"
        lead={
          <>
            Deux familles de capteurs voient le même feu différemment. Pourquoi on ne les additionne pas, et comment Hot-Spot les rend comparables pour{" "}
            <span className="font-medium text-ink">{zoneLabel(zone, meta.data?.provinces)}</span>.
          </>
        }
      />

      <SensorLineup />

      <Panel data-tour="compare-chart">
        <PanelHeader title="Ce que l'harmonisation corrige" subtitle="Totaux annuels sur les années complètes de chaque capteur. Suivez les trois étapes : les courbes se rapprochent jusqu'à se superposer." />
        <div className="px-5 pt-4">
          <Stepper value={unit} onChange={(u) => updateView("compare", { unit: u })} />
        </div>
        <div className="grid grid-cols-1 gap-x-6 xl:grid-cols-12">
          <div className="xl:col-span-8">{calendar.error ? <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} compact /> : data ? <SensorCompareChart calendar={data} factors={factors} unit={unit} /> : <ChartSkeleton height={280} />}</div>
          <div className="flex flex-col gap-3 px-5 pb-5 pt-4 xl:col-span-4 xl:pl-0">
            <div key={unit} className="animate-fade-up">
              <p className="text-[14px] font-medium text-ink">{UNIT_TEXT[unit].title}</p>
              <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">{UNIT_TEXT[unit].body}</p>
            </div>
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
