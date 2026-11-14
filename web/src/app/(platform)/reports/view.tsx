"use client";

import { DownloadSimple, Printer } from "@phosphor-icons/react/dist/ssr";
import { useEffect, useState } from "react";

import { AnnualChart, SeasonalChart } from "@/components/charts";
import { zoneLabel } from "@/components/shell/pickers";
import { Button, Checkbox, ErrorState, PageHeader, Panel, PanelHeader, Skeleton, StatusBadge, buttonClass } from "@/components/ui";
import { exportUrl, useCalendar, useMetadata, useOverview, useRegions } from "@/lib/api";
import { fmt1, fmtArea, fmtDate, fmtDateTimeUtc, fmtDelta, fmtInt, fmtPct, fmtPeriod, fmtScore, MONTHS, monthLabel } from "@/lib/format";
import { DEFINITIONS, KIND_LABEL, RELIABILITY, SATELLITES, STATUS } from "@/lib/labels";
import { ANOMALY_SETTINGS } from "@/lib/science/anomaly";
import { SATELLITE_KEYS } from "@/lib/types";
import { useFilters } from "@/state/filters";

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 mt-6 border-b border-line pb-1.5 text-[15px] font-semibold text-ink">{children}</h2>;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 text-[13px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="num text-right text-ink">{children}</dd>
    </div>
  );
}

export function ReportsView() {
  const { zone, from, to } = useFilters();
  const meta = useMetadata();
  const overview = useOverview(zone, from, to);
  const calendar = useCalendar(zone);
  const regions = useRegions(from, to);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [sections, setSections] = useState({ charts: true, regions: true, method: true });
  const zoneName = zoneLabel(zone, meta.data?.provinces);
  const year = Number(to.slice(0, 4));
  const o = overview.data;
  const c = calendar.data;
  const cal = meta.data?.harmonization.calibration.TA;

  // La date de generation est celle de l'affichage du rapport, rafraichie a chaque impression.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- horodatage lu apres le montage pour garder un rendu serveur stable
    setGeneratedAt(new Date().toISOString());
  }, [zone, from, to]);

  const inPeriod = c
    ? c.months.filter((m) => {
        const key = `${m.year}-${String(m.month).padStart(2, "0")}`;
        return key >= from.slice(0, 7) && key <= to.slice(0, 7);
      })
    : [];
  const flagged = inPeriod.filter((m) => ["strong_high", "high", "low"].includes(m.assessment.status));
  const error = overview.error ?? calendar.error;
  const ready = Boolean(o && c && meta.data);

  const print = () => {
    setGeneratedAt(new Date().toISOString());
    window.setTimeout(() => window.print(), 80);
  };

  return (
    <>
      <div className="no-print flex flex-col gap-5">
        <PageHeader
          title="Rapports et exports"
          lead={
            <>
              Synthèse imprimable et fichiers de données pour <span className="text-ink">{zoneName}</span>, {fmtPeriod(from, to).toLowerCase()}. Tout correspond à la zone et à la période sélectionnées en haut de l'écran.
            </>
          }
        />
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Panel>
            <PanelHeader title="Rapport de synthèse (PDF)" subtitle="Le rapport ci-dessous s'imprime sur fond clair. Dans la fenêtre d'impression, choisissez « Enregistrer au format PDF »." />
            <div className="flex flex-col gap-1 px-5 py-4">
              <Checkbox checked={sections.charts} onChange={(v) => setSections((s) => ({ ...s, charts: v }))}>
                Graphiques : saison de l'année et totaux annuels
              </Checkbox>
              <Checkbox checked={sections.regions} onChange={(v) => setSections((s) => ({ ...s, regions: v }))}>
                Tableau par province
              </Checkbox>
              <Checkbox checked={sections.method} onChange={(v) => setSections((s) => ({ ...s, method: v }))}>
                Méthode et limites d'interprétation
              </Checkbox>
              <div className="mt-3">
                <Button variant="primary" onClick={print} disabled={!ready}>
                  <Printer size={16} />
                  Imprimer ou enregistrer en PDF
                </Button>
              </div>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Fichiers de données" subtitle="Chaque ligne exportée garde son capteur, sa date et le renvoi à sa ligne dans le fichier NASA FIRMS d'origine." />
            <ul className="flex flex-col gap-2 px-5 py-4">
              {(
                [
                  ["Détections de la période (CSV)", "Toutes les détections natives de la zone et de la période, tous capteurs.", exportUrl("detections", "csv", zone, from, to)],
                  ["Détections de la période (GeoJSON)", "Points pour un logiciel SIG. Limité à 100 000 détections.", exportUrl("detections", "geojson", zone, from, to)],
                  ["Calendrier mensuel harmonisé (CSV)", "Série complète 2000 à 2025 de la zone : indice, référence, score, origine.", exportUrl("monthly", "csv", zone)],
                  ["Périodes inhabituelles (CSV)", "Mois signalés avec le détail du calcul et les réserves.", exportUrl("anomalies", "csv", zone)],
                ] as const
              ).map(([title, detail, href]) => (
                <li key={title} className="flex items-center justify-between gap-4 rounded-control border border-line px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-[13.5px] font-medium text-ink">{title}</span>
                    <span className="block text-[12.5px] leading-snug text-ink-3">{detail}</span>
                  </span>
                  <a className={buttonClass("secondary", "sm")} href={href} download aria-label={`Télécharger : ${title}`}>
                    <DownloadSimple size={15} />
                    Télécharger
                  </a>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      {error ? (
        <Panel className="no-print">
          <ErrorState error={error} onRetry={() => (overview.mutate(), calendar.mutate())} />
        </Panel>
      ) : null}

      {/* ------------------------------------------------------------ Rapport */}
      <article className="mx-auto w-full max-w-[820px] rounded-panel border border-line bg-surface px-6 py-7 md:px-10 md:py-9 print:max-w-none print:rounded-none print:border-0 print:p-0" aria-label="Rapport de synthèse">
        {!ready ? (
          error ? (
            <p className="text-[13px] text-ink-3">Le rapport ne peut pas être produit tant que les données ne sont pas chargées.</p>
          ) : (
            <div className="flex flex-col gap-3" role="status" aria-label="Préparation du rapport">
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          )
        ) : o && c && meta.data ? (
          <>
            <header className="border-b border-line pb-4">
              <p className="text-[12px] font-medium text-ink-3">Gabon FirePulse · Rapport d'activité des feux détectée par satellite</p>
              <h1 className="mt-1.5 text-[24px] font-semibold tracking-[-0.02em] text-ink">
                {zoneName}, {fmtPeriod(from, to).toLowerCase()}
              </h1>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <Fact label="Territoire">{zoneName}</Fact>
                <Fact label="Superficie">{fmtArea(o.zone.areaKm2)}</Fact>
                <Fact label="Période analysée">
                  {fmtDate(o.from)} au {fmtDate(o.to)}
                </Fact>
                <Fact label="Rapport généré le">{generatedAt ? fmtDateTimeUtc(generatedAt) : "n. d."}</Fact>
                <Fact label="Données consultées le">{fmtDateTimeUtc(o.provenance.accessedAt)}</Fact>
                <Fact label="Nature des données">{meta.data.dataKind === "real" ? "NASA FIRMS, réelles" : "simulées"}</Fact>
              </dl>
            </header>

            <H2>Résultats</H2>
            <dl className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <Fact label="Indice harmonisé d'activité">{fmtInt(o.harmonized)} cellules-jour</Fact>
              <Fact label="Intervalle de calage">{o.estimatedShare > 0 ? `${fmtInt(o.low)} à ${fmtInt(o.high)}` : "sans objet (VIIRS observé)"}</Fact>
              <Fact label="Médiane des mêmes dates">{o.window && o.window.median !== null ? `${fmtInt(o.window.median)} (${o.window.referenceCount} années)` : "non applicable"}</Fact>
              <Fact label="Écart à la médiane">{o.window && o.window.median ? fmtDelta(o.harmonized, o.window.median) : "non applicable"}</Fact>
              <Fact label="Score robuste">{o.window ? fmtScore(o.window.robustZ) : "non applicable"}</Fact>
              <Fact label="Fiabilité de l'interprétation">{o.window ? RELIABILITY[o.window.reliability].label.replace("Fiabilité ", "") : "non applicable"}</Fact>
              <Fact label="Jours couverts par un capteur">
                {fmtInt(o.days - o.unobservedDays)} sur {fmtInt(o.days)}
              </Fact>
              <Fact label="Cellules de 0,05° actives">{fmtInt(o.activeCells)}</Fact>
            </dl>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">Lecture :</span>{" "}
              {o.window ? `${STATUS[o.window.status].label}, par rapport aux mêmes dates des autres années.` : "période de plus d'un an, sans comparaison saisonnière."}{" "}
              {o.window?.caveats.join(" ")}
            </p>

            <H2>Détections natives par satellite</H2>
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="text-[12px] text-ink-3">
                  <th className="pb-1.5 font-normal">Satellite</th>
                  <th className="pb-1.5 text-right font-normal">Détections</th>
                  <th className="pb-1.5 text-right font-normal">Retenues dans l'indice</th>
                  <th className="pb-1.5 text-right font-normal">Sources statiques</th>
                  <th className="pb-1.5 text-right font-normal">FRP médiane</th>
                </tr>
              </thead>
              <tbody>
                {SATELLITE_KEYS.map((k) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-1.5 text-ink">
                      {SATELLITES[k].sensor} {SATELLITES[k].name}
                    </td>
                    <td className="num py-1.5 text-right text-ink">{fmtInt(o.detections[k])}</td>
                    <td className="num py-1.5 text-right text-ink-2">{fmtInt(o.eligible[k])}</td>
                    <td className="num py-1.5 text-right text-ink-2">{fmtInt(o.staticSources[k])}</td>
                    <td className="num py-1.5 text-right text-ink-2">{o.frp[k].median === null ? "n. d." : `${fmt1(o.frp[k].median)} MW`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">Ces nombres ne s'additionnent pas : les satellites observent en partie les mêmes feux, avec des pixels de taille différente.</p>

            <H2>Mois de la période</H2>
            {inPeriod.length === 0 ? (
              <p className="text-[13px] text-ink-3">Aucun mois dans la période.</p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="text-[12px] text-ink-3">
                    <th className="pb-1.5 font-normal">Mois</th>
                    <th className="pb-1.5 text-right font-normal">Indice</th>
                    <th className="pb-1.5 text-right font-normal">Médiane</th>
                    <th className="pb-1.5 text-right font-normal">Score</th>
                    <th className="pb-1.5 pl-4 font-normal">Statut</th>
                    <th className="hidden pb-1.5 font-normal sm:table-cell print:table-cell">Origine</th>
                  </tr>
                </thead>
                <tbody>
                  {inPeriod.slice(-36).map((m) => (
                    <tr key={`${m.year}-${m.month}`} className="print-avoid border-t border-line">
                      <td className="py-1.5 capitalize text-ink">{monthLabel(m.month, m.year)}</td>
                      <td className="num py-1.5 text-right text-ink">{m.complete ? fmtInt(m.harmonized) : "incomplet"}</td>
                      <td className="num py-1.5 text-right text-ink-2">{fmtInt(m.assessment.median)}</td>
                      <td className="num py-1.5 text-right text-ink-2">{fmtScore(m.assessment.robustZ)}</td>
                      <td className="py-1.5 pl-4">
                        <StatusBadge status={m.assessment.status} />
                      </td>
                      <td className="hidden py-1.5 text-[12px] text-ink-3 sm:table-cell print:table-cell">{KIND_LABEL[m.kind].label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {inPeriod.length > 36 ? <p className="mt-2 text-[12.5px] text-ink-3">Seuls les 36 derniers mois sont listés. La série complète est dans l'export « Calendrier mensuel harmonisé ».</p> : null}
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-3">
              {flagged.length === 0 ? "Aucun mois de la période ne s'écarte de sa référence saisonnière." : `${flagged.length} mois de la période s'écartent de leur référence saisonnière.`} Un écart statistique est un signal d'analyse : ce n'est ni un incendie confirmé ni une prédiction.
            </p>

            {sections.charts ? (
              <>
                <div className="print-avoid">
                  <H2>{year} par rapport à la saison habituelle</H2>
                  <div className="-mx-3">
                    <SeasonalChart months={c.months} baselines={c.baselines} year={year} height={230} />
                  </div>
                  <p className="text-[12.5px] text-ink-3">
                    Indice harmonisé mensuel, en cellules-jour actives. Mois habituellement critiques : {c.criticalMonths.length ? c.criticalMonths.map((m) => MONTHS[m - 1]).join(", ") : "aucun"}.
                  </p>
                </div>
                <div className="print-avoid print-break">
                  <H2>Totaux annuels depuis 2000</H2>
                  <div className="-mx-3">
                    <AnnualChart years={c.years} highlight={year} height={240} />
                  </div>
                  <p className="text-[12.5px] text-ink-3">Années hachurées : estimées depuis MODIS, avec l'intervalle de calage. Années à contour seul : incomplètes, non comparables.</p>
                </div>
              </>
            ) : null}

            {sections.regions && regions.data ? (
              <div className="print-avoid">
                <H2>Activité par province sur la période</H2>
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="text-[12px] text-ink-3">
                      <th className="pb-1.5 font-normal">Province</th>
                      <th className="pb-1.5 text-right font-normal">Indice</th>
                      <th className="pb-1.5 text-right font-normal">Part</th>
                      <th className="pb-1.5 text-right font-normal">Pour 1 000 km²</th>
                      <th className="pb-1.5 pl-4 font-normal">Par rapport à la saison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...regions.data.regions]
                      .sort((a, b) => b.harmonized - a.harmonized)
                      .map((r) => (
                        <tr key={r.index} className="border-t border-line">
                          <td className="py-1.5 text-ink">{r.name}</td>
                          <td className="num py-1.5 text-right text-ink">{fmtInt(r.harmonized)}</td>
                          <td className="num py-1.5 text-right text-ink-2">{fmtPct(r.share)}</td>
                          <td className="num py-1.5 text-right text-ink-2">{fmt1(r.density)}</td>
                          <td className="py-1.5 pl-4">{r.window ? <StatusBadge status={r.window.status} /> : <span className="text-ink-3">non applicable</span>}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[12.5px] text-ink-3">Tableau national, indépendant de la zone du rapport. Limites : geoBoundaries (CC BY-SA 3.0), état représenté : 2005.</p>
              </div>
            ) : null}

            {sections.method ? (
              <div className="print-avoid">
                <H2>Méthode</H2>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
                  <li>
                    <span className="text-ink">Indice harmonisé.</span> {DEFINITIONS.index}
                  </li>
                  <li>
                    <span className="text-ink">Détections retenues.</span> {DEFINITIONS.eligible}
                  </li>
                  <li>
                    <span className="text-ink">Un seul capteur par jour.</span> VIIRS Suomi-NPP dès qu'il observe ; à défaut VIIRS NOAA-20 ; avant 2012, MODIS converti par un facteur estimé sur les années communes. Aucun total MODIS plus VIIRS n'est calculé.
                  </li>
                  {cal ? (
                    <li>
                      <span className="text-ink">Précision du calage MODIS.</span> Erreur mensuelle médiane de {fmtPct(cal.validation.monthly_median_abs_pct_error, 1)} et erreur annuelle moyenne de {fmtPct(cal.validation.annual_mean_abs_pct_error, 1)}, mesurées en retirant une année à la fois, au niveau national.
                    </li>
                  ) : null}
                  <li>
                    <span className="text-ink">Périodes inhabituelles.</span> Score = (valeur − médiane) / (1,4826 × écart absolu médian) sur le même mois des autres années ; seuils à {String(ANOMALY_SETTINGS.thresholdNotable).replace(".", ",")} et {String(ANOMALY_SETTINGS.thresholdStrong).replace(".", ",")} ; au moins {ANOMALY_SETTINGS.minReferenceYears} années de référence.
                  </li>
                </ul>
                <H2>Limites d'interprétation</H2>
                <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-ink-2">
                  <li>Une détection est le centre d'un pixel signalé comme anomalie thermique. Ce n'est ni un incendie confirmé, ni sa position exacte, ni une surface brûlée, et elle ne dit rien de la cause.</li>
                  <li>Les nuages, la fumée épaisse et l'heure de passage empêchent de voir une partie des feux. Une valeur nulle signifie « aucune détection », pas « aucun feu ».</li>
                  <li>Les valeurs antérieures à 2012 sont des estimations. Les facteurs de calage sont nationaux et moins sûrs sur une petite zone.</li>
                  <li>Un écart à la référence est un signal d'analyse à vérifier avec d'autres sources. Ce rapport n'est pas une alerte officielle.</li>
                </ul>
              </div>
            ) : null}

            <H2>Sources</H2>
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              {o.provenance.source}. {o.provenance.products.join(" ; ")}. {meta.data.sources.length} fichiers, {fmtInt(meta.data.rows.kept)} détections, du {fmtDate(o.provenance.dataFirstDate)} au {fmtDate(o.provenance.dataLastDate)}, téléchargés le{" "}
              {fmtDateTimeUtc(o.provenance.accessedAt)}. Nous remercions le Fire Information for Resource Management System (FIRMS) de la NASA pour l'usage de ses données. Projet étudiant indépendant, NASA Space Apps Challenge 2026 : ni produit officiel de la NASA, ni service d'alerte incendie.
            </p>
          </>
        ) : null}
      </article>
    </>
  );
}
