"use client";

import { Microscope, Pulse } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";

import { FireMap, FlaggedMonths, FrpDistribution, MoreLink, ReferenceGauge, RegionBars, StatSkeleton } from "@/components/blocks";
import { SeasonalChart } from "@/components/charts";
import { BLUE_MARBLE_TILES } from "@/components/map/basemaps";
import { pageIcon } from "@/components/shell/shell";
import { ChartSkeleton, Disclosure, ErrorState, InfoTip, Notice, PageHeader, Panel, PanelHeader, ReliabilityBadge, SensorMark, Skeleton, SourceNote, StatusBadge } from "@/components/ui";
import { zoneLabel } from "@/components/shell/pickers";
import { useCalendar, useGrid, useMetadata, useOverview, useRegions } from "@/lib/api";
import { fmtCoord, fmtDateShort, fmtDelta, fmtInt, fmtPct, fmtPeriod, MONTHS } from "@/lib/format";
import { CONF_LABEL, DEFINITIONS, SATELLITES } from "@/lib/labels";
import { SATELLITE_KEYS } from "@/lib/types";
import { useFilters } from "@/state/filters";

/** Tuile NASA Blue Marble (zoom 6) centree sur le pays analyse : fond de la carte du chiffre cle. */
function countryTile(country: "GAB" | "FRA"): string {
  const [x, y] = country === "FRA" ? [32, 22] : [33, 31];
  return BLUE_MARBLE_TILES.replace("{z}", "6").replace("{x}", String(x)).replace("{y}", String(y));
}

/** Phrase de lecture du verdict, en langage courant. */
function verdict(status: string | undefined): string {
  switch (status) {
    case "strong_high":
      return "Nettement plus d'activité détectée que d'habitude à ces dates.";
    case "high":
      return "Plus d'activité détectée que d'habitude à ces dates.";
    case "low":
      return "Moins d'activité détectée que d'habitude à ces dates.";
    case "normal":
      return "Une activité dans la norme de ces dates.";
    default:
      return "Pas assez de références pour juger si c'est habituel.";
  }
}

export function DashboardView() {
  const { zone, from, to, setZone, country } = useFilters();
  const router = useRouter();
  const meta = useMetadata();
  const overview = useOverview(zone, from, to);
  const calendar = useCalendar(zone);
  const regions = useRegions(from, to);
  const grid = useGrid(zone, from, to);
  const o = overview.data;
  const year = Number(to.slice(0, 4));
  const zoneName = zoneLabel(zone, meta.data);
  const flagged = calendar.data
    ? calendar.data.months.filter((m) => ["strong_high", "high", "low"].includes(m.assessment.status)).slice(-6).reverse()
    : [];
  const critical = calendar.data?.criticalMonths ?? [];
  const totalDetections = o ? Object.values(o.detections).reduce((a, b) => a + b, 0) : 0;

  return (
    <>
      <PageHeader
        icon={pageIcon("/dashboard")}
        title="Vue d'ensemble"
        lead={
          <>
            Ce que les satellites ont détecté pour <span className="font-medium text-ink">{zoneName}</span>, {fmtPeriod(from, to).toLowerCase()}, et si c'est habituel.
          </>
        }
      />

      {overview.error ? (
        <Panel>
          <ErrorState error={overview.error} onRetry={() => overview.mutate()} />
        </Panel>
      ) : null}

      {/* Le verdict : la valeur, sa place dans l'historique, et l'annee mois par mois. */}
      <Panel className="overflow-hidden">
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
          <div className="relative isolate flex flex-col gap-5 overflow-hidden border-b border-line/70 p-6 xl:border-b-0 xl:border-r" data-tour="kpi-index">
            {/* Vignette satellite du pays (NASA Blue Marble), voilee pour la lisibilite du chiffre. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- tuile NASA GIBS distante */}
            <img src={countryTile(country)} alt="" aria-hidden loading="lazy" className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-70" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,color-mix(in_srgb,var(--color-surface)_72%,transparent),var(--color-surface)_62%)]" />
            <p className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
              Indice harmonisé d'activité
              <InfoTip text={DEFINITIONS.index} />
            </p>
            {o ? (
              <>
                <div>
                  <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="num text-[52px] font-semibold leading-[0.95] tracking-[-0.045em] text-ink md:text-[60px]">{fmtInt(o.harmonized)}</span>
                    <span className="text-[14px] text-ink-3">cellules-jour actives</span>
                  </p>
                  {o.window ? <p className="mt-3 text-[15px] leading-snug text-ink">{verdict(o.window.status)}</p> : null}
                </div>
                {o.window ? (
                  <>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <StatusBadge status={o.window.status} />
                      <ReliabilityBadge reliability={o.window.reliability} />
                    </div>
                    <ReferenceGauge a={o.window} />
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
                  <p className="text-[12.5px] leading-relaxed text-ink-3">
                    {fmtPct(o.estimatedShare)} de la valeur est estimée depuis MODIS. Intervalle de calage : <span className="num">{fmtInt(o.low)}</span> à <span className="num">{fmtInt(o.high)}</span>.
                  </p>
                ) : null}
              </>
            ) : (
              <StatSkeleton />
            )}
          </div>

          <div className="flex min-w-0 flex-col">
            <PanelHeader
              title={`${year}, mois par mois`}
              subtitle={
                critical.length ? (
                  <>Mois habituellement les plus actifs ici : {critical.map((m) => MONTHS[m - 1]).join(", ")}.</>
                ) : (
                  "Indice mensuel, comparé à la médiane du même mois les autres années."
                )
              }
              help={DEFINITIONS.anomaly}
              actions={<MoreLink href="/calendar">Calendrier complet</MoreLink>}
            />
            <div className="flex-1">
              {calendar.error ? (
                <ErrorState error={calendar.error} onRetry={() => calendar.mutate()} compact />
              ) : calendar.data ? (
                <SeasonalChart months={calendar.data.months} baselines={calendar.data.baselines} year={year} />
              ) : (
                <ChartSkeleton />
              )}
            </div>
          </div>
        </div>

        {/* Ce que chaque satellite a vu : des comptes separes, jamais additionnes. */}
        <div className="border-t border-line/70">
          <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-4">
            <p className="flex items-center gap-1 text-[13px] font-medium text-ink-2">
              Détections natives par satellite
              <InfoTip text={DEFINITIONS.detection} />
            </p>
            <p className="text-[12px] text-ink-3">Ces nombres ne s'additionnent pas : les satellites voient en partie les mêmes feux.</p>
          </div>
          {o ? (
            <ul className="grid grid-cols-2 gap-px px-6 pb-5 pt-3 md:grid-cols-4">
              {SATELLITE_KEYS.map((key) => {
                const s = SATELLITES[key];
                return (
                  <li key={key} className="min-w-0 py-1 md:border-l md:border-line/70 md:pl-5 md:first:border-l-0 md:first:pl-0">
                    <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
                      <SensorMark color={s.color} shape={s.shape} size={9} />
                      <span className="truncate">
                        {s.sensor} {s.name}
                      </span>
                    </p>
                    <p className="num mt-1 text-[22px] font-medium leading-tight tracking-[-0.02em] text-ink">{fmtInt(o.detections[key])}</p>
                    <p className="num text-[11.5px] text-ink-3">dont {fmtInt(o.eligible[key])} retenues</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="px-6 pb-5 pt-3">
              <Skeleton className="h-12 w-full" />
            </div>
          )}
        </div>
        <SourceNote provenance={calendar.data?.provenance} extra="Unité : cellules-jour actives, équivalent Suomi-NPP." />
      </Panel>

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

      {/* Ou, et quand ca sort de l'ordinaire */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel className="flex flex-col xl:col-span-7" interactive>
          <PanelHeader title="Où l'activité se concentre" subtitle="Jours actifs harmonisés par cellule d'environ 5 km, sur la période." actions={<MoreLink href="/map">Ouvrir la carte</MoreLink>} />
          <div className="relative mx-5 mb-4 mt-3 min-h-[340px] flex-1 overflow-hidden rounded-control border border-line">
            {grid.error ? <ErrorState error={grid.error} onRetry={() => grid.mutate()} compact /> : <FireMap geoBase={meta.data?.geoUrl} mode="grid" points={undefined} grid={grid.data} zone={zone} passive className="absolute inset-0" />}
          </div>
          <SourceNote provenance={grid.data?.provenance} />
        </Panel>

        <Panel className="flex flex-col xl:col-span-5">
          <PanelHeader title="Mois sortis de l'ordinaire" subtitle="Les six derniers mois signalés pour cette zone, tous types d'écart." actions={<MoreLink href="/anomalies">Tout voir</MoreLink>} />
          <div className="flex-1">
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
          </div>
          <p className="mx-5 mb-4 flex items-start gap-2 rounded-control bg-surface-2/70 px-3 py-2.5 text-[12px] leading-relaxed text-ink-3">
            <Pulse size={15} className="mt-px shrink-0 text-accent" />
            Un écart statistique est un signal à vérifier. Ce n'est ni un incendie confirmé ni une prédiction.
          </p>
        </Panel>
      </div>

      {/* Provinces et qualite de l'observation */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        <Panel className="xl:col-span-8">
          <PanelHeader title={`Activité par ${meta.data?.level1.one ?? "province"}`} subtitle={`Touchez une ${meta.data?.level1.one ?? "province"} pour en faire la zone d'analyse. Densité en cellules-jour pour 1 000 km².`} />
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

        <Panel className="xl:col-span-4">
          <PanelHeader title="Qualité de l'observation" subtitle="Ce qui a été vu, et ce qui a été écarté du calcul." />
          {o ? (
            <dl className="flex flex-col gap-4 px-5 py-5">
              <div>
                <div className="flex items-baseline justify-between text-[13px]">
                  <dt className="text-ink-2">Jours couverts par un capteur</dt>
                  <dd className="num text-ink">
                    {fmtInt(o.days - o.unobservedDays)} sur {fmtInt(o.days)}
                  </dd>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                  <div className="h-full rounded-full bg-good" style={{ width: `${((o.days - o.unobservedDays) / Math.max(o.days, 1)) * 100}%` }} />
                </div>
              </div>
              {(
                [
                  ["Interruptions de capteur", o.gaps.length === 0 ? "aucune" : String(o.gaps.length)],
                  ["Sources statiques écartées", fmtPct(totalDetections ? Object.values(o.staticSources).reduce((a, b) => a + b, 0) / totalDetections : 0)],
                  ["Confiance faible écartée", fmtPct(totalDetections ? Object.values(o.lowConfidence).reduce((a, b) => a + b, 0) / totalDetections : 0)],
                  ["Cellules actives", fmtInt(o.activeCells)],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-3 text-[13px]">
                  <dt className="text-ink-3">{label}</dt>
                  <dd className="num text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="px-5 py-5">
              <StatSkeleton />
            </div>
          )}
        </Panel>
      </div>

      {/* Informations d'expert : disponibles, sans encombrer la lecture. */}
      <Disclosure icon={<Microscope size={17} />} title="Détails pour spécialistes" summary="Puissance radiative, niveaux de confiance natifs et dernières détections de la période.">
        <div className="grid grid-cols-1 xl:grid-cols-12">
          <div className="border-line/70 xl:col-span-5 xl:border-r">
            <PanelHeader title="Puissance radiative des détections" subtitle="Un pixel VIIRS est environ sept fois plus petit qu'un pixel MODIS : les valeurs ne se comparent pas directement." />
            {o ? <FrpDistribution frp={o.frp} /> : <ChartSkeleton height={150} />}
            <div className="border-t border-line/70 px-5 py-4">
              <p className="mb-2.5 text-[12.5px] font-medium text-ink-2">Niveaux de confiance natifs</p>
              {o ? (
                <ul className="flex flex-col gap-2">
                  {SATELLITE_KEYS.map((k) => {
                    const c = o.confidence[k];
                    const total = c.low + c.nominal + c.high;
                    if (total === 0) return null;
                    return (
                      <li key={k} className="grid grid-cols-[104px_minmax(0,1fr)] items-center gap-3 text-[12px] text-ink-2">
                        <span className="flex items-center gap-1.5">
                          <SensorMark color={SATELLITES[k].color} shape={SATELLITES[k].shape} size={8} />
                          {SATELLITES[k].name}
                        </span>
                        <span className="flex h-5 overflow-hidden rounded-[4px] text-[10.5px]" title={`faible ${fmtPct(c.low / total)} · nominale ${fmtPct(c.nominal / total)} · élevée ${fmtPct(c.high / total)}`}>
                          {(["low", "nominal", "high"] as const).map((level) => (
                            <span
                              key={level}
                              className={`num flex items-center justify-center overflow-hidden whitespace-nowrap ${level === "low" ? "bg-surface-3 text-ink-3" : level === "nominal" ? "bg-line-strong text-ink-2" : "bg-ink-3 text-bg"}`}
                              style={{ width: `${(c[level] / total) * 100}%` }}
                            >
                              {c[level] / total > 0.12 ? `${CONF_LABEL[level].toLowerCase()} ${fmtPct(c[level] / total)}` : ""}
                            </span>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <Skeleton className="h-16 w-full" />
              )}
            </div>
            <SourceNote provenance={o?.provenance} extra="FRP en mégawatts, valeur native du produit. MODIS exprime la confiance en pourcentage, VIIRS en trois classes : les deux échelles ne sont pas converties l'une dans l'autre." />
          </div>

          <div className="border-t border-line/70 xl:col-span-7 xl:border-t-0">
            <PanelHeader
              title="Dernières détections de la période"
              subtitle={o ? `Les plus récentes avant le ${fmtDateShort(o.to)}. Archive historique : ce n'est pas du temps réel.` : "Lecture des détections."}
              actions={<MoreLink href="/map">Explorer la carte</MoreLink>}
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
                        <tr key={d.id} className="border-t border-line/60 transition-colors hover:bg-surface-2/60">
                          <td className="num py-2 text-ink">
                            {fmtDateShort(d.date)} {d.time}
                          </td>
                          <td className="py-2">
                            <span className="flex items-center gap-1.5 text-ink-2">
                              <SensorMark color={SATELLITES[d.satellite].color} shape={SATELLITES[d.satellite].shape} size={8} />
                              {SATELLITES[d.satellite].name}
                            </span>
                          </td>
                          <td className="num py-2 text-ink-2">
                            {fmtCoord(d.lat)}, {fmtCoord(d.lon)}
                          </td>
                          <td className="py-2 text-ink-2">
                            {CONF_LABEL[d.confidenceClass]} <span className="num text-ink-3">({d.confidenceNative.split(" ")[0]})</span>
                          </td>
                          <td className="num py-2 text-right text-ink-2">{d.frp === null ? "indisponible" : `${fmtInt(d.frp)} MW`}</td>
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
          </div>
        </div>
      </Disclosure>
    </>
  );
}
