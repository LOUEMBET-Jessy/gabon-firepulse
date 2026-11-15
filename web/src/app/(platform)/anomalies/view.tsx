"use client";

import { CalendarCheck, DownloadSimple, Info, MapTrifold } from "@phosphor-icons/react/dist/ssr";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { AssessmentDetail, KindNote } from "@/components/blocks";
import { SeasonalChart } from "@/components/charts";
import { HeatmapKey, MonthHeatmap, ScaleLegend } from "@/components/heatmaps";
import { zoneLabel } from "@/components/shell/pickers";
import { pageIcon } from "@/components/shell/shell";
import { Button, ChartSkeleton, EmptyState, ErrorState, PageHeader, Panel, PanelHeader, ReliabilityBadge, Segmented, SourceNote, StatusBadge, buttonClass, cx } from "@/components/ui";
import { exportUrl, useCalendar, useMetadata } from "@/lib/api";
import { fmtDelta, fmtInt, fmtScore, lastDayOfMonth, MONTHS, monthLabel, pad2 } from "@/lib/format";
import { DEFINITIONS, KIND_LABEL } from "@/lib/labels";
import { ANOMALY_SETTINGS } from "@/lib/science/anomaly";
import type { MonthRecord } from "@/lib/types";
import { useFilters } from "@/state/filters";
import { updateView, useView } from "@/state/view";

type Direction = "all" | "high" | "low";
type Sort = "date" | "score";

export function AnomaliesView() {
  const { zone, from, to, setPeriod } = useFilters();
  const router = useRouter();
  const params = useSearchParams();
  const meta = useMetadata();
  const calendar = useCalendar(zone);
  const direction = useView((v) => v.anomalies.direction);
  const setDirection = (d: Direction) => updateView("anomalies", { direction: d });
  const [sort, setSort] = useState<Sort>("date");
  const [observedOnly, setObservedOnly] = useState(false);
  const initial = useMemo(() => {
    const match = /^(\d{4})-(\d{1,2})$/.exec(params.get("m") ?? "");
    return match ? { year: Number(match[1]), month: Number(match[2]) } : null;
  }, [params]);
  // Mois examine : partage avec l'assistant, qui peut ouvrir un mois precis.
  const picked = useView((v) => v.anomalies.month);
  const setPicked = (m: { year: number; month: number } | null) => updateView("anomalies", { month: m });
  const data = calendar.data;
  const zoneName = zoneLabel(zone, meta.data?.provinces);

  const flagged = useMemo(() => {
    if (!data) return [];
    const rows = data.months.filter((m) => {
      const s = m.assessment.status;
      if (!(s === "strong_high" || s === "high" || s === "low")) return false;
      if (direction === "high" && s === "low") return false;
      if (direction === "low" && s !== "low") return false;
      if (observedOnly && m.estimatedShare > 0.5) return false;
      return true;
    });
    return sort === "date"
      ? rows.sort((a, b) => b.year * 12 + b.month - (a.year * 12 + a.month))
      : rows.sort((a, b) => Math.abs(b.assessment.robustZ ?? 0) - Math.abs(a.assessment.robustZ ?? 0));
  }, [data, direction, sort, observedOnly]);

  const selection = picked ?? initial ?? (flagged[0] ? { year: flagged[0].year, month: flagged[0].month } : null);
  const record: MonthRecord | undefined = selection && data ? data.months.find((m) => m.year === selection.year && m.month === selection.month) : undefined;
  const counts = useMemo(() => {
    const c = { strong: 0, high: 0, low: 0, notAssessed: 0, total: 0 };
    for (const m of data?.months ?? []) {
      c.total++;
      const s = m.assessment.status;
      if (s === "strong_high") c.strong++;
      else if (s === "high") c.high++;
      else if (s === "low") c.low++;
      else if (s === "incomplete" || s === "insufficient" || s === "low_activity") c.notAssessed++;
    }
    return c;
  }, [data]);

  const range = (m: MonthRecord): [string, string] => [`${m.year}-${pad2(m.month)}-01`, `${m.year}-${pad2(m.month)}-${pad2(lastDayOfMonth(m.year, m.month))}`];

  return (
    <>
      <PageHeader
        icon={pageIcon("/anomalies")}
        title="Périodes inhabituelles"
        lead={
          <>
            Les mois où l'activité détectée pour <span className="font-medium text-ink">{zoneName}</span> s'écarte des mêmes mois des autres années. Chaque signalement montre sa valeur, sa référence et ses limites.
          </>
        }
        actions={
          <a className={buttonClass("secondary", "md")} href={exportUrl("anomalies", "csv", zone)} download>
            <DownloadSimple size={16} />
            Liste (CSV)
          </a>
        }
      />

      {/* Le bilan d'abord, puis l'avertissement de lecture, sur une seule bande. */}
      <Panel className="overflow-hidden">
        <dl className="grid grid-cols-2 md:grid-cols-4">
          {(
            [
              ["Très supérieurs", counts.strong, "var(--color-critical)"],
              ["Supérieurs", counts.high, "var(--color-warning)"],
              ["Inférieurs", counts.low, "var(--color-div-n2)"],
              ["Non évalués", counts.notAssessed, "var(--color-ink-3)"],
            ] as const
          ).map(([label, value, color], i) => (
            <div key={label} className={cx("flex flex-col gap-1 px-5 py-4", i > 0 && "md:border-l md:border-line/70", i % 2 === 1 && "border-l border-line/70 md:border-l", i > 1 && "border-t border-line/70 md:border-t-0")}>
              <dt className="flex items-center gap-2 text-[12.5px] text-ink-3">
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
                {label}
              </dt>
              <dd className="num text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink">{data ? value : "…"}</dd>
            </div>
          ))}
        </dl>
        <p className="flex items-start gap-2.5 border-t border-line/70 bg-surface-2/40 px-5 py-3 text-[13px] leading-relaxed text-ink-2">
          <Info size={16} weight="fill" className="mt-0.5 shrink-0 text-accent" />
          <span>
            Un mois inhabituel est un <span className="text-ink">écart statistique</span>, pas un incendie confirmé ni une prédiction. Il peut refléter une activité réelle, des conditions d'observation différentes ou un changement de capteur.
          </span>
        </p>
      </Panel>

      {calendar.error ? (
        <Panel>
          <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} />
        </Panel>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Liste */}
        <Panel className="flex flex-col xl:col-span-5" data-tour="anomaly-list">
          <PanelHeader
            title="Mois signalés"
            subtitle={
              data
                ? `${counts.strong} très supérieurs, ${counts.high} supérieurs, ${counts.low} inférieurs, sur ${counts.total} mois. ${counts.notAssessed === 0 ? "Tous les mois ont pu être évalués." : counts.notAssessed === 1 ? "1 mois n'a pas pu être évalué." : `${counts.notAssessed} mois n'ont pas pu être évalués.`}`
                : "Évaluation de chaque mois."
            }
          />
          <div className="flex flex-wrap items-center gap-2 px-5 pb-1 pt-3">
            <Segmented
              label="Sens de l'écart"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "all", label: "Tous" },
                { value: "high", label: "Supérieurs" },
                { value: "low", label: "Inférieurs" },
              ]}
            />
            <Segmented
              label="Tri"
              value={sort}
              onChange={setSort}
              options={[
                { value: "date", label: "Plus récents" },
                { value: "score", label: "Plus forts" },
              ]}
            />
            <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-ink-2">
              <input type="checkbox" className="size-3.5 accent-[var(--color-accent)]" checked={observedOnly} onChange={(e) => setObservedOnly(e.target.checked)} />
              VIIRS observé uniquement
            </label>
          </div>
          {!data ? (
            calendar.error ? null : (
              <ChartSkeleton height={360} />
            )
          ) : flagged.length === 0 ? (
            <EmptyState title="Aucun mois signalé avec ces filtres">
              {counts.strong + counts.high + counts.low === 0 ? "Aucun mois ne dépasse les seuils pour cette zone. Les zones à très faible activité ne sont pas qualifiées." : "Élargissez les filtres pour voir les autres signalements."}
            </EmptyState>
          ) : (
            <ul className="mt-2 flex max-h-[560px] flex-col overflow-y-auto px-3 pb-3">
              {flagged.map((m) => {
                const active = record?.year === m.year && record.month === m.month;
                return (
                  <li key={`${m.year}-${m.month}`}>
                    <button
                      type="button"
                      onClick={() => setPicked({ year: m.year, month: m.month })}
                      aria-pressed={active}
                      className={cx("flex w-full flex-col gap-1.5 rounded-control border px-3 py-2.5 text-left transition-colors", active ? "border-line-strong bg-surface-2" : "border-transparent hover:bg-surface-2")}
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[13.5px] font-medium capitalize text-ink">{monthLabel(m.month, m.year)}</span>
                        <StatusBadge status={m.assessment.status} />
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[12.5px] text-ink-2">
                        <span className="num">
                          {fmtInt(m.harmonized)} pour une médiane de {fmtInt(m.assessment.median)} ({m.assessment.median ? fmtDelta(m.harmonized, m.assessment.median) : "n. d."})
                        </span>
                        <span className="num text-ink-3">score {fmtScore(m.assessment.robustZ)}</span>
                      </span>
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <ReliabilityBadge reliability={m.assessment.reliability} />
                        <span className="text-[11.5px] text-ink-3">{KIND_LABEL[m.kind].label}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Detail */}
        <Panel className="xl:col-span-7" data-tour="anomaly-detail">
          {record && data ? (
            <>
              <PanelHeader
                title={monthLabel(record.month, record.year).replace(/^./, (c) => c.toUpperCase())}
                subtitle={`Zone : ${zoneName}. Référence : mois de ${MONTHS[record.month - 1]} des autres années, observation complète.`}
                help={DEFINITIONS.anomaly}
                actions={
                  <>
                    <Button size="sm" onClick={() => setPeriod(...range(record))} disabled={from === range(record)[0] && to === range(record)[1]}>
                      <CalendarCheck size={15} />
                      Utiliser comme période
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setPeriod(...range(record));
                        router.push("/map");
                      }}
                    >
                      <MapTrifold size={15} />
                      Voir sur la carte
                    </Button>
                  </>
                }
              />
              <div className="mt-2">
                <SeasonalChart months={data.months} baselines={data.baselines} year={record.year} height={230} onSelect={(m) => setPicked({ year: record.year, month: m })} />
              </div>
              <div className="flex flex-col gap-4 border-t border-line px-5 py-4">
                <AssessmentDetail a={record.assessment} referenceLabel={`${MONTHS[record.month - 1]}, années complètes`} />
                <KindNote month={record} />
              </div>
            </>
          ) : (
            <EmptyState title="Sélectionnez un mois signalé">Le détail du calcul s'affiche ici.</EmptyState>
          )}
          <SourceNote provenance={data?.provenance} extra="Unité : cellules-jour actives, équivalent Suomi-NPP." />
        </Panel>
      </div>

      {/* Historique */}
      <Panel>
        <PanelHeader title="Historique des écarts à la référence" subtitle="Score robuste de chaque mois depuis 2000. Sélectionnez une case pour ouvrir son détail ci-dessus." />
        <div className="flex flex-col gap-4 px-5 py-4">
          {data ? (
            <>
              <MonthHeatmap months={data.months} years={data.years} mode="deviation" breaks={[]} selected={selection} onSelect={(y, m) => setPicked({ year: y, month: m })} compact />
              <div className="flex flex-col gap-2 border-t border-line pt-3">
                <ScaleLegend mode="deviation" breaks={[]} unit="" />
                <HeatmapKey mode="deviation" />
              </div>
            </>
          ) : calendar.error ? null : (
            <ChartSkeleton height={420} />
          )}
        </div>
        <SourceNote provenance={data?.provenance} />
      </Panel>

      {/* Methode */}
      <Panel>
        <PanelHeader title="Méthode de signalement" subtitle="Les mêmes règles s'appliquent à toutes les zones et à tous les mois." />
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 px-5 py-4 text-[13.5px] leading-relaxed text-ink-2 lg:grid-cols-2">
          <p>
            <span className="font-medium text-ink">Référence.</span> Pour un mois donné, les valeurs du même mois calendaire des autres années, à condition que l'observation y soit complète. L'année évaluée est exclue de sa propre référence. Il faut au moins {ANOMALY_SETTINGS.minReferenceYears} années, sinon le statut est « données insuffisantes ».
          </p>
          <p>
            <span className="font-medium text-ink">Score.</span> Écart à la médiane, divisé par 1,4826 fois l'écart absolu médian. Contrairement à la moyenne et à l'écart-type, ces deux mesures ne sont pas tirées par les années extrêmes. Le score classique est affiché à côté pour comparaison.
          </p>
          <p>
            <span className="font-medium text-ink">Seuils.</span> Supérieure ou inférieure à partir de {String(ANOMALY_SETTINGS.thresholdNotable).replace(".", ",")} en valeur absolue ; très supérieure à partir de {String(ANOMALY_SETTINGS.thresholdStrong).replace(".", ",")}, seuil proposé par Iglewicz et Hoaglin (1993) pour ce score. Ces seuils sont un choix de conception, pas une prescription de la NASA.
          </p>
          <p>
            <span className="font-medium text-ink">Garde-fous.</span> Un mois observé à moins de 90 % n'est pas évalué. En dessous de {ANOMALY_SETTINGS.minActivity} cellules-jour, l'activité est jugée trop faible pour être qualifiée. La fiabilité baisse quand la valeur est estimée depuis MODIS ou que la médiane de référence est inférieure à 20.
          </p>
        </div>
      </Panel>
    </>
  );
}
