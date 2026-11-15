"use client";

/**
 * Observatoire en temps quasi reel : filtres, etat des flux NASA FIRMS, fiche d'une detection recente
 * et fiche d'un territoire (Gabon, France) avec ses subdivisions.
 *
 * Tout ce qui s'affiche ici vient des fichiers ou de l'API FIRMS, recuperes par le serveur. Une detection
 * est le centre d'un pixel signale comme anomalie thermique : jamais un incendie confirme.
 */

import { ArrowClockwise, ArrowSquareOut, CaretRight, CheckCircle, CloudSlash, Hourglass, Broadcast as Satellite, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import useSWR from "swr";

import { Button, Checkbox, Segmented, SensorMark, cx } from "@/components/ui";
import { fmtInt } from "@/lib/format";
import { CONF_LABEL, LIVE_SATELLITE_INFO } from "@/lib/labels";
import type { LiveDetection, LiveFeedStatus, LiveResponse, LiveSatellite, LiveTerritory } from "@/lib/types";

type Bbox = [number, number, number, number];
export const LIVE_SATS: LiveSatellite[] = ["terra", "aqua", "snpp", "noaa20", "noaa21"];
export const TERRITORY_NAME: Record<LiveTerritory, string> = { GAB: "Gabon", FRA: "France métropolitaine" };
export const TERRITORY_BBOX: Record<LiveTerritory, Bbox> = { GAB: [8.45, -4.1, 14.75, 2.45], FRA: [-5.2, 41.3, 9.6, 51.1] };

const utc = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fr-FR", { timeZone: "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " UTC" : "jamais";

/** Age lisible d'une date : « il y a 3 h ». */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "inconnue";
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `il y a ${hours} h` : `il y a ${Math.round(hours / 24)} j`;
}

/* ------------------------------------------------------------------ Subdivisions (limites locales) */

interface Subdivisions {
  level1: { name: string; bbox: Bbox }[];
  level2: { name: string; bbox: Bbox; parent: string | null }[];
  labels: [string, string];
}

type Geo = { features: { properties: { name: string; index: number; province?: number; region?: number }; geometry: { type: string; coordinates: unknown } }[] };
const fetchGeo = (url: string) => fetch(url).then((r) => r.json() as Promise<Geo>);

function bboxOf(geometry: { type: string; coordinates: unknown }): Bbox {
  const polygons = (geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates]) as number[][][][];
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of polygons) for (const [x, y] of p[0]) {
    w = Math.min(w, x);
    e = Math.max(e, x);
    s = Math.min(s, y);
    n = Math.max(n, y);
  }
  return [w, s, e, n];
}

export function useSubdivisions(territory: LiveTerritory): Subdivisions | null {
  const files = territory === "FRA" ? ["/geo/fra_regions.geojson", "/geo/fra_departments.geojson"] : ["/geo/provinces.geojson", "/geo/departments.geojson"];
  const l1 = useSWR(files[0], fetchGeo, { revalidateOnFocus: false });
  const l2 = useSWR(files[1], fetchGeo, { revalidateOnFocus: false });
  return useMemo(() => {
    if (!l1.data || !l2.data) return null;
    const level1 = l1.data.features.map((f) => ({ name: f.properties.name, bbox: bboxOf(f.geometry), index: f.properties.index }));
    const byIndex = new Map(level1.map((x) => [x.index, x.name]));
    return {
      level1,
      level2: l2.data.features.map((f) => ({ name: f.properties.name, bbox: bboxOf(f.geometry), parent: byIndex.get(territory === "FRA" ? (f.properties.region ?? -1) : (f.properties.province ?? -1)) ?? null })),
      labels: territory === "FRA" ? ["Régions", "Départements"] : ["Provinces", "Départements"],
    };
  }, [l1.data, l2.data, territory]);
}

/* ------------------------------------------------------------------ Filtres et etat des flux */

function FeedRow({ f }: { f: LiveFeedStatus }) {
  const icon =
    f.status === "ok" ? <CheckCircle size={14} weight="fill" className="text-good" /> : f.status === "empty" ? <Hourglass size={14} className="text-ink-3" /> : f.status === "pending" ? <Hourglass size={14} className="text-ink-3" /> : f.status === "stale" ? <WarningCircle size={14} weight="fill" className="text-warning" /> : <CloudSlash size={14} className="text-critical" />;
  const text =
    f.status === "ok"
      ? `${fmtInt(f.rows)} sur 7 j · dernière acquisition ${ago(f.latestAcquisition)}`
      : f.status === "empty"
        ? `aucune détection publiée${f.publishedAt ? ` (fichier du ${utc(f.publishedAt)})` : ""}`
        : f.status === "stale"
          ? `copie du ${utc(f.fetchedAt)} : ${f.error}`
          : f.status === "pending"
            ? "pas encore interrogé"
            : (f.error ?? "erreur");
  return (
    <li className="flex items-start gap-2 text-[12px]">
      <span className="mt-[2px] shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="text-ink-2">{f.label}</span> <span className="text-ink-3">· {text}</span>
      </span>
    </li>
  );
}

export function LiveControls({
  data,
  error,
  loading,
  territories,
  days,
  sats,
  onChange,
  onRefresh,
  refreshing,
}: {
  data: LiveResponse | undefined;
  error: Error | undefined;
  loading: boolean;
  territories: LiveTerritory[];
  days: number;
  sats: Record<LiveSatellite, boolean>;
  onChange: (patch: { territories?: LiveTerritory[]; days?: number; sats?: Record<LiveSatellite, boolean> }) => void;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const lastCheck = data?.feeds.reduce<string | null>((acc, f) => (f.checkedAt && (!acc || f.checkedAt > acc) ? f.checkedAt : acc), null) ?? null;
  const periods = [
    { value: "1", label: "24 h" },
    { value: "2", label: "48 h" },
    { value: "7", label: "7 jours" },
    ...(data?.maxDays === 10 ? [{ value: "10", label: "10 jours" }] : []),
  ];
  return (
    <>
      <fieldset className="flex flex-col gap-1.5 border-t border-line px-4 py-3.5">
        <legend className="float-left mb-1 w-full text-[12px] font-medium text-ink-2">Pays observés</legend>
        <div className="clear-both flex flex-col gap-1">
          {(["GAB", "FRA"] as LiveTerritory[]).map((t) => (
            <Checkbox
              key={t}
              checked={territories.includes(t)}
              onChange={(on) => onChange({ territories: on ? [...new Set([...territories, t])] : territories.filter((x) => x !== t) })}
            >
              <span className="flex items-center justify-between gap-2">
                {TERRITORY_NAME[t]}
                <span className="num text-[12px] text-ink-3">{data?.counts.byTerritory[t] !== undefined ? fmtInt(data.counts.byTerritory[t]) : ""}</span>
              </span>
            </Checkbox>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5 border-t border-line px-4 py-3.5">
        <legend className="float-left mb-1 w-full text-[12px] font-medium text-ink-2">Période</legend>
        <div className="clear-both">
          <Segmented label="Période d'observation récente" value={String(days)} onChange={(v) => onChange({ days: Number(v) })} options={periods} />
        </div>
        <p className="text-[11.5px] leading-relaxed text-ink-3">Comptée à partir de maintenant. Les données NRT arrivent en général quelques heures après le passage du satellite.</p>
      </fieldset>
      <fieldset className="flex flex-col gap-1.5 border-t border-line px-4 py-3.5">
        <legend className="float-left mb-1 w-full text-[12px] font-medium text-ink-2">Satellites</legend>
        <div className="clear-both flex flex-col gap-1">
          {LIVE_SATS.map((k) => (
            <Checkbox key={k} checked={sats[k]} onChange={(on) => onChange({ sats: { ...sats, [k]: on } })}>
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <SensorMark color={LIVE_SATELLITE_INFO[k].color} shape={LIVE_SATELLITE_INFO[k].shape} />
                  {LIVE_SATELLITE_INFO[k].sensor} {LIVE_SATELLITE_INFO[k].name}
                </span>
                <span className="num text-[12px] text-ink-3">{data ? fmtInt(data.counts.bySatellite[k] ?? 0) : ""}</span>
              </span>
            </Checkbox>
          ))}
        </div>
      </fieldset>
      <section className="flex flex-col gap-2 border-t border-line px-4 py-3.5" aria-label="Synchronisation NASA FIRMS">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-ink-2">Synchronisation NASA FIRMS</p>
          <Button size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing || loading} aria-label="Actualiser les données temps réel">
            <ArrowClockwise size={14} className={refreshing ? "voice-spin" : ""} />
            Actualiser
          </Button>
        </div>
        <p className="text-[12px] text-ink-3">
          {error ? <span className="text-critical">Service temps réel injoignable : {error.message}</span> : data ? <>Dernière vérification {ago(lastCheck)} ({utc(lastCheck)}). Vérification automatique toutes les 10 minutes au plus.</> : "Interrogation de la NASA…"}
        </p>
        {data ? (
          <ul className="flex flex-col gap-1.5">
            {data.feeds
              .filter((f) => territories.includes(f.territory))
              .map((f) => (
                <FeedRow key={`${f.territory}-${f.feed}`} f={{ ...f, label: `${f.label}, ${f.territory === "GAB" ? "Gabon" : "France"}` }} />
              ))}
          </ul>
        ) : null}
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Source : NASA FIRMS, produits NRT {data?.mode === "api" ? "(API « area », clé configurée)" : "(fichiers « active fire » des 7 derniers jours, sans clé)"}. Ces détections ne sont ni harmonisées ni définitives : elles restent hors de l'archive 2000 à 2025 et de ses calculs.
        </p>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ Fiche d'une detection recente */

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 text-[12.5px] last:border-b-0">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="num min-w-0 break-words text-right text-ink">{children}</dd>
    </div>
  );
}

export function LiveDetectionCard({ d, feed, onClose }: { d: LiveDetection; feed: LiveFeedStatus | undefined; onClose: () => void }) {
  const s = LIVE_SATELLITE_INFO[d.satellite];
  return (
    <aside aria-label="Fiche de détection récente" className="flex max-h-full flex-col overflow-hidden rounded-panel border border-line-strong bg-surface shadow-[0_18px_50px_-12px_rgb(0_0_0/0.8)]">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[14px] font-medium text-ink">
            <Satellite size={15} className="text-accent" />
            Détection récente
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-3">Anomalie thermique signalée par satellite, en temps quasi réel. Ni incendie confirmé, ni surface brûlée.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X size={16} />
        </button>
      </header>
      <div className="overflow-y-auto px-4 py-2">
        <p className="flex items-center gap-2 py-2 text-[13px] font-medium text-ink">
          <SensorMark color={s.color} shape={s.shape} />
          {s.sensor} {s.name}
          <span className="text-ink-3">pixel de {s.pixel} au nadir</span>
        </p>
        <dl>
          <Row label="Acquisition (UTC)">{utc(d.acquired)}</Row>
          <Row label="Il y a">{ago(d.acquired)}</Row>
          <Row label="Satellite, capteur">
            {s.name}, {d.sensor}
          </Row>
          <Row label="Confiance native">{d.confidenceNative || "non fournie"}</Row>
          <Row label="Classe de confiance">{CONF_LABEL[d.confidence]}</Row>
          <Row label="Puissance radiative (FRP)">{d.frp === null ? "indisponible" : `${String(d.frp).replace(".", ",")} MW`}</Row>
          <Row label="Jour ou nuit">{d.daynight === "N" ? "Nuit" : "Jour"}</Row>
          <Row label="Latitude, longitude">
            {d.lat.toFixed(4).replace(".", ",")}, {d.lon.toFixed(4).replace(".", ",")}
          </Row>
          <Row label="Pays">{TERRITORY_NAME[d.territory]}</Row>
          <Row label={d.territory === "FRA" ? "Région" : "Province"}>{d.level1 ?? "hors des limites"}</Row>
          <Row label="Département">{d.level2 ?? "hors des limites"}</Row>
          <Row label="Version du produit">{d.version || "non fournie"}</Row>
        </dl>
        <p className="my-2 rounded-control border border-warning/30 bg-warning/[0.06] px-3 py-2 text-[12px] leading-relaxed text-ink-2">
          Produit NRT : la NASA peut le corriger ou le remplacer par la version définitive. Les produits temps réel ne distinguent pas toujours les sources industrielles (torchères, sites chauds) des feux de végétation.
        </p>
        <p className="pb-1 pt-1 text-[12px] font-medium text-ink-2">Provenance</p>
        <dl>
          <Row label="Produit">{feed?.product ?? d.feed}</Row>
          <Row label="Fichier publié par la NASA">{utc(feed?.publishedAt ?? null)}</Row>
          <Row label="Dernière synchronisation">{utc(feed?.fetchedAt ?? null)}</Row>
        </dl>
        {feed ? (
          <a href={feed.url.includes("CLE_MASQUEE") ? "https://firms.modaps.eosdis.nasa.gov/active_fire/" : feed.url} target="_blank" rel="noreferrer" className="my-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:text-accent-strong">
            Source sur NASA FIRMS
            <ArrowSquareOut size={14} />
          </a>
        ) : null}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ Fiche d'un territoire observe */

export interface LiveFocus {
  territory: LiveTerritory;
  level1?: string;
  level2?: string;
}

export function LiveTerritoryCard({
  focus,
  data,
  onFocus,
  onClose,
}: {
  focus: LiveFocus;
  data: LiveResponse | undefined;
  onFocus: (focus: LiveFocus, bbox: Bbox | null) => void;
  onClose: () => void;
}) {
  const subs = useSubdivisions(focus.territory);
  const [showAll, setShowAll] = useState(false);
  const within = (data?.detections ?? []).filter(
    (d) => d.territory === focus.territory && (!focus.level1 || d.level1 === focus.level1) && (!focus.level2 || d.level2 === focus.level2),
  );
  const latest = within[0]?.acquired ?? null;
  const bySat = LIVE_SATS.map((k) => [k, within.filter((d) => d.satellite === k).length] as const).filter(([, n]) => n > 0);
  // Subdivisions a lister : regions ou provinces, puis les departements de la subdivision choisie.
  const listing = !subs || focus.level2
    ? []
    : focus.level1
      ? subs.level2.filter((x) => x.parent === focus.level1).map((x) => ({ name: x.name, bbox: x.bbox, count: within.filter((d) => d.level2 === x.name).length, level: 2 as const }))
      : subs.level1.map((x) => ({ name: x.name, bbox: x.bbox, count: within.filter((d) => d.level1 === x.name).length, level: 1 as const }));
  listing.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fr"));
  const shown = showAll ? listing : listing.slice(0, 8);
  const title = focus.level2 ?? focus.level1 ?? TERRITORY_NAME[focus.territory];
  const kind = focus.level2 ? "Département" : focus.level1 ? (focus.territory === "FRA" ? "Région" : "Province") : "Pays observé";
  const trail = [
    { label: TERRITORY_NAME[focus.territory], focus: { territory: focus.territory } as LiveFocus },
    ...(focus.level1 ? [{ label: focus.level1, focus: { territory: focus.territory, level1: focus.level1 } as LiveFocus }] : []),
    ...(focus.level2 ? [{ label: focus.level2, focus }] : []),
  ];
  const bboxFor = (f: LiveFocus): Bbox | null =>
    f.level2 ? (subs?.level2.find((x) => x.name === f.level2)?.bbox ?? null) : f.level1 ? (subs?.level1.find((x) => x.name === f.level1)?.bbox ?? null) : TERRITORY_BBOX[f.territory];

  return (
    <aside aria-label="Fiche du territoire observé" className="pointer-events-auto flex max-h-full w-[min(340px,calc(100vw-24px))] animate-fade-up flex-col overflow-hidden rounded-panel border border-line-strong bg-surface/95 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.85)] backdrop-blur-md">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-surface-2 text-accent">
          <Satellite size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-ink-3">{kind} · temps quasi réel</p>
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
          {trail.length > 1 ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-0.5 text-[11.5px] text-ink-3">
              {trail.slice(0, -1).map((t) => (
                <span key={t.label} className="flex items-center gap-0.5">
                  <button type="button" className="hover:text-ink" onClick={() => onFocus(t.focus, bboxFor(t.focus))}>
                    {t.label}
                  </button>
                  <CaretRight size={10} />
                </span>
              ))}
            </p>
          ) : null}
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la fiche du territoire observé" className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X size={15} />
        </button>
      </header>
      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
        {data ? (
          <>
            <div>
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="num text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{fmtInt(within.length)}</span>
                <span className="text-[12.5px] text-ink-3">détection{within.length > 1 ? "s" : ""} sur {data.days === 1 ? "24 h" : `${data.days} jours`}</span>
              </p>
              <p className="mt-1.5 text-[12px] text-ink-3">Dernière acquisition : {latest ? `${utc(latest)}, ${ago(latest)}` : "aucune sur la période"}</p>
            </div>
            {bySat.length ? (
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                {bySat.map(([k, n]) => (
                  <li key={k} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="flex items-center gap-1.5 text-ink-3">
                      <SensorMark color={LIVE_SATELLITE_INFO[k].color} shape={LIVE_SATELLITE_INFO[k].shape} size={8} />
                      {LIVE_SATELLITE_INFO[k].name}
                    </span>
                    <span className="num text-ink">{fmtInt(n)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-ink-3">Aucune anomalie thermique signalée ici pour ces filtres. Ce n'est pas une preuve d'absence de feu : nuages et heures de passage limitent l'observation.</p>
            )}
            {listing.length ? (
              <div className="border-t border-line pt-3">
                <p className="mb-1.5 text-[12px] font-medium text-ink-2">{focus.level1 ? subs?.labels[1] : subs?.labels[0]}</p>
                <ul className="flex flex-col">
                  {shown.map((x) => (
                    <li key={x.name}>
                      <button
                        type="button"
                        onClick={() => {
                          const next: LiveFocus = x.level === 1 ? { territory: focus.territory, level1: x.name } : { territory: focus.territory, level1: focus.level1, level2: x.name };
                          onFocus(next, x.bbox);
                        }}
                        className={cx("grid w-full grid-cols-[minmax(0,1fr)_72px_32px] items-center gap-2 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-surface-2", x.count === 0 && "opacity-60")}
                      >
                        <span className="truncate text-[12.5px] text-ink">{x.name}</span>
                        <span className="h-1.5 rounded-full bg-surface-3">
                          <span className="block h-full rounded-full bg-heat-5" style={{ width: `${(x.count / Math.max(listing[0].count, 1)) * 100}%` }} />
                        </span>
                        <span className="num text-right text-[11.5px] text-ink-2">{fmtInt(x.count)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {listing.length > 8 ? (
                  <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-[12px] font-medium text-accent hover:text-accent-strong">
                    {showAll ? "Réduire" : `Voir les ${listing.length}`}
                  </button>
                ) : null}
              </div>
            ) : null}
            <p className="text-[11px] leading-relaxed text-ink-3">
              Comptes de détections natives, tous satellites confondus selon les filtres : un même feu peut être vu par plusieurs satellites. Aide au repérage et à la priorisation des vérifications de terrain, pas un bilan d'incendies.
            </p>
          </>
        ) : (
          <p className="text-[12.5px] text-ink-3">Interrogation de la NASA…</p>
        )}
      </div>
    </aside>
  );
}
