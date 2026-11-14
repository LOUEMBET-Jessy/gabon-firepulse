"use client";

import { useRouter } from "next/navigation";

import { FireMap, FlaggedMonths, FrpDistribution, MoreLink, RegionBars, SatelliteCounts, StatSkeleton } from "@/components/blocks";
import { SeasonalChart } from "@/components/charts";
import { ChartSkeleton, ErrorState, InfoTip, Notice, PageHeader, Panel, PanelHeader, ReliabilityBadge, SensorMark, Skeleton, SourceNote, StatusBadge } from "@/components/ui";
import { zoneLabel } from "@/components/shell/pickers";
import { useCalendar, useGrid, useMetadata, useOverview, useRegions } from "@/lib/api";
import { fmtCoord, fmtDateShort, fmtDelta, fmtInt, fmtPct, fmtPeriod, MONTHS } from "@/lib/format";
import { CONF_LABEL, DEFINITIONS, SATELLITES } from "@/lib/labels";
import { useFilters } from "@/state/filters";

function Tile({ label, help, children, className }: { label: string; help?: string; children: React.ReactNode; className?: string }) {
  return (
    <Panel className={`flex flex-col gap-3 p-5 ${className ?? ""}`}>
      <p className="flex items-center gap-1 text-[12.5px] font-medium text-ink-2">
        {label}
        {help ? <InfoTip text={help} /> : null}
      </p>
      {children}
    </Panel>
  );
}

export function DashboardView() {
  const { zone, from, to, setZone } = useFilters();
  const router = useRouter();
  const meta = useMetadata();
  const overview = useOverview(zone, from, to);
  const calendar = useCalendar(zone);
  const regions = useRegions(from, to);
  const grid = useGrid(zone, from, to);
  const o = overview.data;
  const year = Number(to.slice(0, 4));
  const zoneName = zoneLabel(zone, meta.data?.provinces);
  const flagged = calendar.data
    ? calendar.data.months.filter((m) => ["strong_high", "high", "low"].includes(m.assessment.status)).slice(-6).reverse()
    : [];
  const critical = calendar.data?.criticalMonths ?? [];
  const totalDetections = o ? Object.values(o.detections).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader
        title="Tableau de bord"
        lead={
          <>
            Activité des feux détectée par satellite pour <span className="text-ink">{zoneName}</span>, {fmtPeriod(from, to).toLowerCase()}. Tous les chiffres sont calculés à partir des fichiers NASA FIRMS chargés.
          </>
        }
      />

      {overview.error ? (
        <Panel>
          <ErrorState error={overview.error} onRetry={() => overview.mutate()} />
        </Panel>
      ) : null}

      {/* Indicateurs cles */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
        <Tile label="Indice harmonisé d'activité" help={DEFINITIONS.index} className="xl:col-span-5">
          {o ? (
            <div className="flex flex-col gap-3">
              <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <span className="num text-[38px] font-semibold leading-none tracking-[-0.03em] text-ink">{fmtInt(o.harmonized)}</span>
                <span className="text-[13px] text-ink-3">cellules-jour actives</span>
              </p>
              {o.window ? (
                <>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <StatusBadge status={o.window.status} long />
                    <ReliabilityBadge reliability={o.window.reliability} />
                  </div>
                  <p className="text-[13px] leading-relaxed text-ink-2">
                    {o.window.median !== null && o.window.referenceCount > 0 ? (
                      <>
                        Médiane des mêmes dates sur {o.window.referenceCount} autres années : <span className="num text-ink">{fmtInt(o.window.median)}</span>, soit un écart de{" "}
                        <span className="num text-ink">{fmtDelta(o.harmonized, o.window.median)}</span>.
                      </>
                    ) : (
                      "Aucune année de référence complète pour ces dates."
                    )}
                  </p>
                </>
              ) : (
                <p className="text-[13px] leading-relaxed text-ink-2">Période de plus d'un an : la comparaison saisonnière ne s'applique pas. Consultez le calendrier pour comparer les années entre elles.</p>
              )}
              {o.estimatedShare > 0 ? (
                <p className="text-[12.5px] text-ink-3">
                  {fmtPct(o.estimatedShare)} de la valeur est estimée depuis MODIS. Intervalle de calage : <span className="num">{fmtInt(o.low)}</span> à <span className="num">{fmtInt(o.high)}</span>.
                </p>
              ) : null}
            </div>
          ) : (
            <StatSkeleton />
          )}
        </Tile>

        <Tile label="Détections natives par satellite" help={DEFINITIONS.detection} className="xl:col-span-4">
          {o ? (
            <>
              <SatelliteCounts detections={o.detections} eligible={o.eligible} />
              <p className="text-[12px] leading-relaxed text-ink-3">Ces nombres ne s'additionnent pas : les satellites observent en partie les mêmes feux, avec des pixels de taille différente.</p>
            </>
          ) : (
            <StatSkeleton />
          )}
        </Tile>

        <Tile label="Observation et qualité" className="md:col-span-2 xl:col-span-3">
          {o ? (
            <dl className="flex flex-col text-[13px]">
              {(
                [
                  ["Jours couverts", `${fmtInt(o.days - o.unobservedDays)} sur ${fmtInt(o.days)}`],
                  ["Interruptions de capteur", o.gaps.length === 0 ? "aucune" : String(o.gaps.length)],
                  ["Sources statiques écartées", fmtPct(totalDetections ? Object.values(o.staticSources).reduce((a, b) => a + b, 0) / totalDetections : 0)],
                  ["Confiance faible écartée", fmtPct(totalDetections ? Object.values(o.lowConfidence).reduce((a, b) => a + b, 0) / totalDetections : 0)],
                  ["Cellules actives", fmtInt(o.activeCells)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="num text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <StatSkeleton />
          )}
        </Tile>
      </div>

      {o && o.unobservedDays > 0 ? (
        <Notice tone="warning" title="Période partiellement observée">
          {o.unobservedDays} jour(s) de la période ne sont couverts par aucun capteur en service. L'indice sous-estime l'activité sur ces jours.
        </Notice>
      ) : null}
      {o && totalDetections === 0 ? (
        <Notice title="Aucune détection sur cette zone et cette période">
          Aucun satellite n'a signalé d'anomalie thermique ici. Cela ne prouve pas l'absence de feu : la couverture nuageuse et l'heure de passage limitent ce que les capteurs peuvent voir.
        </Notice>
      ) : null}

      {/* Saison et carte */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <PanelHeader
            title={`${year} par rapport à la saison habituelle`}
            subtitle={
              critical.length ? (
                <>
                  Mois habituellement critiques pour cette zone : {critical.map((m) => MONTHS[m - 1]).join(", ")}.
                </>
              ) : (
                "Indice harmonisé mensuel, comparé à la médiane du même mois les autres années."
              )
            }
            help={DEFINITIONS.anomaly}
            actions={<MoreLink href="/calendar">Calendrier complet</MoreLink>}
          />
          {calendar.error ? (
            <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} compact />
          ) : calendar.data ? (
            <SeasonalChart months={calendar.data.months} baselines={calendar.data.baselines} year={year} />
          ) : (
            <ChartSkeleton />
          )}
          <SourceNote provenance={calendar.data?.provenance} extra="Unité : cellules-jour actives, équivalent Suomi-NPP." />
        </Panel>

        <Panel className="flex flex-col xl:col-span-5">
          <PanelHeader
            title="Où l'activité se concentre"
            subtitle="Jours actifs harmonisés par cellule de 0,05°, sur la période."
            actions={<MoreLink href="/map">Ouvrir la carte</MoreLink>}
          />
          <div className="relative mx-5 mb-4 mt-3 min-h-[300px] flex-1 overflow-hidden rounded-control border border-line">
            {grid.error ? (
              <ErrorState error={grid.error} onRetry={() => grid.mutate()} compact />
            ) : (
              <FireMap mode="grid" points={undefined} grid={grid.data} zone={zone} passive className="absolute inset-0" />
            )}
          </div>
          <SourceNote provenance={grid.data?.provenance} />
        </Panel>
      </div>

      {/* Regions et periodes inhabituelles */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-7">
          <PanelHeader
            title="Activité par province"
            subtitle="Sélectionnez une province pour en faire la zone d'analyse. La densité est exprimée en cellules-jour pour 1 000 km²."
          />
          {regions.error ? (
            <ErrorState error={regions.error} onRetry={() => regions.mutate()} compact />
          ) : regions.data ? (
            <RegionBars regions={regions.data.regions} activeIndex={zone.kind === "province" ? zone.index : null} onSelect={(index) => setZone({ kind: "province", index })} />
          ) : (
            <ChartSkeleton height={280} />
          )}
          <SourceNote
            provenance={regions.data?.provenance}
            extra={
              regions.data
                ? `${fmtInt(Object.values(regions.data.outsideProvinces).reduce((a, b) => a + b, 0))} détections de la période tombent hors des polygones de provinces (écart entre les limites FIRMS et geoBoundaries) et ne sont comptées que dans le total national.`
                : undefined
            }
          />
        </Panel>

        <Panel className="xl:col-span-5">
          <PanelHeader title="Dernières périodes inhabituelles" subtitle="Mois dont l'activité détectée s'écarte de la référence saisonnière." actions={<MoreLink href="/anomalies">Tout voir</MoreLink>} />
          {calendar.error ? (
            <ErrorState error={calendar.error} compact />
          ) : calendar.data ? (
            <FlaggedMonths months={flagged} onSelect={(m) => router.push(`/anomalies?m=${m.year}-${m.month}`)} empty="Aucun mois ne s'écarte de sa référence saisonnière pour cette zone." />
          ) : (
            <div className="flex flex-col gap-2 px-5 py-4">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          )}
          <p className="border-t border-line px-5 py-2.5 text-[11.5px] leading-relaxed text-ink-3">Un écart statistique est un signal d'analyse. Ce n'est ni un incendie confirmé ni une prédiction.</p>
        </Panel>
      </div>

      {/* Puissance radiative, confiance et dernieres observations */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        <Panel className="xl:col-span-5">
          <PanelHeader title="Puissance radiative des détections" subtitle="Les capteurs ne mesurent pas la même chose : un pixel VIIRS est environ sept fois plus petit qu'un pixel MODIS." />
          {o ? <FrpDistribution frp={o.frp} /> : <ChartSkeleton height={150} />}
          <div className="border-t border-line px-5 py-3">
            <p className="mb-2 text-[12px] font-medium text-ink-2">Niveaux de confiance natifs</p>
            {o ? (
              <ul className="flex flex-col gap-1.5">
                {(Object.keys(SATELLITES) as (keyof typeof SATELLITES)[]).map((k) => {
                  const c = o.confidence[k];
                  const total = c.low + c.nominal + c.high;
                  if (total === 0) return null;
                  return (
                    <li key={k} className="flex flex-wrap items-center gap-x-3 text-[12.5px] text-ink-2">
                      <span className="flex w-[104px] items-center gap-1.5">
                        <SensorMark color={SATELLITES[k].color} shape={SATELLITES[k].shape} size={8} />
                        {SATELLITES[k].name}
                      </span>
                      {(["low", "nominal", "high"] as const).map((level) => (
                        <span key={level} className="num">
                          <span className="text-ink-3">{CONF_LABEL[level].toLowerCase()}</span> {fmtPct(c[level] / total)}
                        </span>
                      ))}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Skeleton className="h-16 w-full" />
            )}
          </div>
          <SourceNote provenance={o?.provenance} extra="FRP en mégawatts, valeur native du produit. MODIS exprime la confiance en pourcentage, VIIRS en trois classes : les deux échelles ne sont pas converties l'une dans l'autre." />
        </Panel>

        <Panel className="xl:col-span-7">
          <PanelHeader
            title="Dernières observations de la période"
            subtitle={o ? `Détections les plus récentes avant le ${fmtDateShort(o.to)}. Archive historique : ce n'est pas du temps réel.` : "Lecture des détections."}
            actions={<MoreLink href="/map">Explorer</MoreLink>}
          />
          {o ? (
            o.latest.length ? (
              <div className="overflow-x-auto px-5 py-3">
                <table className="w-full min-w-[520px] text-left text-[12.5px]">
                  <thead>
                    <tr className="text-[11.5px] text-ink-3">
                      <th className="pb-2 font-normal">Date et heure (UTC)</th>
                      <th className="pb-2 font-normal">Satellite</th>
                      <th className="pb-2 font-normal">Position</th>
                      <th className="pb-2 font-normal">Confiance</th>
                      <th className="pb-2 text-right font-normal">FRP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.latest.map((d) => (
                      <tr key={d.id} className="border-t border-line">
                        <td className="num py-1.5 text-ink">
                          {fmtDateShort(d.date)} {d.time}
                        </td>
                        <td className="py-1.5">
                          <span className="flex items-center gap-1.5 text-ink-2">
                            <SensorMark color={SATELLITES[d.satellite].color} shape={SATELLITES[d.satellite].shape} size={8} />
                            {SATELLITES[d.satellite].name}
                          </span>
                        </td>
                        <td className="num py-1.5 text-ink-2">
                          {fmtCoord(d.lat)}, {fmtCoord(d.lon)}
                        </td>
                        <td className="py-1.5 text-ink-2">
                          {CONF_LABEL[d.confidenceClass]} <span className="num text-ink-3">({d.confidenceNative.split(" ")[0]})</span>
                        </td>
                        <td className="num py-1.5 text-right text-ink-2">{d.frp === null ? "indisponible" : `${fmtInt(d.frp)} MW`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-5 py-6 text-[13px] text-ink-3">Aucune détection sur cette zone et cette période.</p>
            )
          ) : (
            <ChartSkeleton height={200} />
          )}
          <SourceNote provenance={o?.provenance} />
        </Panel>
      </div>
    </>
  );
}
