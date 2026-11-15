"use client";

/**
 * Exploration geographique : fil d'Ariane (Terre, continent, pays, province, departement, localite),
 * recherche de lieux, et fiche du territoire selectionne.
 *
 * Le Gabon et la France metropolitaine disposent d'une archive : pour les autres pays, la fiche le dit, sans chiffre.
 * Les indicateurs sont une aide a l'analyse et a la priorisation des verifications de terrain,
 * jamais une prediction d'incendie.
 */

import { ArrowRight, CaretRight, Globe, GlobeHemisphereEast, MagnifyingGlass, MapPin, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useMemo, useState } from "react";

import type { AreaPick } from "@/components/map/fire-map";
import { rememberPlace, zoneLabel } from "@/components/shell/pickers";
import { Button, ReliabilityBadge, SensorMark, Skeleton, StatusBadge, cx } from "@/components/ui";
import { getApiCountry, useCalendar, useDepartmentRegions, useMetadata, useOverview, useRegions } from "@/lib/api";
import { fmtDelta, fmtInt, MONTHS_SHORT } from "@/lib/format";
import { SATELLITES } from "@/lib/labels";
import type { MetadataResponse, ZoneSpec } from "@/lib/types";
import { SATELLITE_KEYS } from "@/lib/types";

type Bbox = [number, number, number, number];

export type Territory = { kind: "world" } | { kind: "continent"; name: string } | AreaPick;

/** Emprises des continents pour les vols depuis la vue Terre. */
export const CONTINENTS: { name: string; bbox: Bbox }[] = [
  { name: "Afrique", bbox: [-18, -35, 52, 37] },
  { name: "Europe", bbox: [-11, 35, 40, 70] },
  { name: "Asie", bbox: [40, -10, 145, 60] },
  { name: "Amérique du Nord", bbox: [-130, 8, -60, 60] },
  { name: "Amérique du Sud", bbox: [-82, -55, -34, 12] },
  { name: "Océanie", bbox: [110, -47, 180, 0] },
];

/** Memes limites que GABON_BOUNDS de la carte (non importe ici : le moteur de carte ne se charge que dans le navigateur). */
export const GABON_BBOX: Bbox = [8.45, -4.1, 14.75, 2.45];

/** Pays dotes d'une archive harmonisee. */
export const ARCHIVE_COUNTRIES = {
  GAB: { iso: "GAB", name: "Gabon", continent: "Afrique", bbox: GABON_BBOX },
  FRA: { iso: "FRA", name: "France métropolitaine", continent: "Europe", bbox: [-5.2, 41.3, 9.6, 51.1] as Bbox },
} as const;

/** Territoire « pays » de l'archive consultee (ou d'un autre pays dote d'une archive). */
export function archiveCountry(code: "GAB" | "FRA" = getApiCountry()): Extract<Territory, { kind: "country" }> {
  const c = ARCHIVE_COUNTRIES[code];
  return { kind: "country", iso: c.iso, name: c.name, continent: c.continent, bbox: c.bbox };
}

export function hasArchive(iso: string): iso is "GAB" | "FRA" {
  return iso === "GAB" || iso === "FRA";
}

/** Territoire couvert par une archive (pays, province ou region, departement, localite). */
export function isGabon(t: Territory): boolean {
  return t.kind === "province" || t.kind === "department" || t.kind === "place" || (t.kind === "country" && hasArchive(t.iso));
}

export function territoryZone(t: Territory): ZoneSpec | null {
  if (t.kind === "country") return t.iso === getApiCountry() ? { kind: "country" } : null;
  if (t.kind === "province") return { kind: "province", index: t.index };
  if (t.kind === "department") return { kind: "department", index: t.index };
  if (t.kind === "place") return { kind: "place", id: t.id };
  return null;
}

export function territoryFromZone(zone: ZoneSpec): Territory | null {
  if (zone.kind === "country") return archiveCountry();
  if (zone.kind === "province") return { kind: "province", index: zone.index };
  if (zone.kind === "department") return { kind: "department", index: zone.index };
  if (zone.kind === "place") return { kind: "place", id: zone.id, name: "" };
  return null;
}

type Crumb = { label: string; target: Territory };

function crumbs(t: Territory, meta: MetadataResponse | undefined): Crumb[] {
  const home = archiveCountry();
  const out: Crumb[] = [{ label: "Terre", target: { kind: "world" } }];
  if (t.kind === "world") return out;
  if (t.kind === "continent") return [...out, { label: t.name, target: t }];
  if (t.kind === "country") return [...out, { label: t.continent, target: { kind: "continent", name: t.continent } }, { label: t.name, target: t }];
  out.push({ label: home.continent, target: { kind: "continent", name: home.continent } }, { label: home.name, target: home });
  const province = t.kind === "province" ? t.index : t.kind === "department" ? meta?.departments[t.index]?.province : t.kind === "place" ? (t.province ?? meta?.towns.find((x) => x.id === t.id)?.province) : undefined;
  const department = t.kind === "department" ? t.index : t.kind === "place" ? (t.department ?? meta?.towns.find((x) => x.id === t.id)?.department) : undefined;
  if (province !== undefined && province >= 0 && meta) out.push({ label: meta.provinces[province].name, target: { kind: "province", index: province } });
  if (department !== undefined && department >= 0 && meta && t.kind !== "province") out.push({ label: meta.departments[department].name, target: { kind: "department", index: department } });
  if (t.kind === "place") out.push({ label: t.name || zoneLabel({ kind: "place", id: t.id }, meta).replace(/ \(\d+ km\)$/, ""), target: t });
  return out;
}

/* ------------------------------------------------------------------ Fil d'Ariane et recherche */

export function Navigator({ territory, onGo }: { territory: Territory; onGo: (t: Territory) => void }) {
  const meta = useMetadata().data;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const trail = crumbs(territory, meta);
  const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query.trim());
  const results = useMemo(() => {
    if (!meta || q.length < 2) return [];
    const hit = (name: string) => norm(name).includes(q);
    const list: { label: string; detail: string; target: Territory }[] = [];
    meta.provinces.filter((p) => hit(p.name)).forEach((p) => list.push({ label: p.name, detail: "Province", target: { kind: "province", index: p.index } }));
    meta.departments.filter((d) => hit(d.name)).forEach((d) => list.push({ label: d.name, detail: `Département, ${meta.provinces[d.province]?.name ?? ""}`, target: { kind: "department", index: d.index } }));
    meta.towns.filter((t) => hit(t.name)).forEach((t) => list.push({ label: t.name, detail: t.pop ? `Ville, ${fmtInt(t.pop)} hab.` : "Localité", target: { kind: "place", id: t.id, name: t.name, province: t.province, department: t.department } }));
    CONTINENTS.filter((c) => hit(c.name)).forEach((c) => list.push({ label: c.name, detail: "Continent", target: { kind: "continent", name: c.name } }));
    return list.slice(0, 8);
  }, [meta, q]);

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <nav aria-label="Niveau d'exploration" className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-line-strong bg-surface/90 py-1 pl-1.5 pr-2 text-[12.5px] shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)] backdrop-blur-md no-scrollbar">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <span key={`${c.label}-${i}`} className="flex shrink-0 items-center gap-0.5">
              {i > 0 ? <CaretRight size={11} className="text-ink-3" aria-hidden /> : null}
              <button
                type="button"
                onClick={() => onGo(c.target)}
                aria-current={last ? "location" : undefined}
                className={cx("flex items-center gap-1 rounded-full px-2 py-1 transition-colors", last ? "font-medium text-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink")}
              >
                {i === 0 ? <GlobeHemisphereEast size={14} className="text-accent" /> : null}
                {c.label}
              </button>
            </span>
          );
        })}
      </nav>
      <div className="relative w-[min(340px,calc(100vw-24px))]">
        <label className="relative block">
          <span className="sr-only">Rechercher un lieu</span>
          <MagnifyingGlass size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            value={query}
            onChange={(e) => (setQuery(e.target.value), setOpen(true))}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && results[0]) {
                onGo(results[0].target);
                setQuery("");
                setOpen(false);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Rechercher : province, département, ville…"
            className="h-10 w-full rounded-full border border-line-strong bg-surface/90 pl-9 pr-3 text-[13px] text-ink shadow-[0_8px_24px_-12px_rgb(0_0_0/0.8)] backdrop-blur-md placeholder:text-ink-3 focus:border-accent focus:outline-none"
          />
        </label>
        {open && results.length ? (
          <ul className="absolute left-0 right-0 top-[calc(100%+6px)] z-10 animate-fade-up overflow-hidden rounded-panel border border-line-strong bg-surface-2 py-1 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.8)]" role="listbox" aria-label="Lieux trouvés">
            {results.map((r) => (
              <li key={`${r.detail}-${r.label}`}>
                <button
                  type="button"
                  onClick={() => {
                    onGo(r.target);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-3"
                >
                  <MapPin size={15} className="shrink-0 text-accent" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{r.label}</span>
                    <span className="block truncate text-[11.5px] text-ink-3">{r.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {territory.kind === "world" || territory.kind === "continent" ? (
        <div className="flex max-w-[340px] flex-wrap gap-1.5">
          {CONTINENTS.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => onGo({ kind: "continent", name: c.name })}
              className={cx(
                "rounded-full border px-2.5 py-1 text-[12px] backdrop-blur-md transition-colors",
                territory.kind === "continent" && territory.name === c.name ? "border-accent/60 bg-accent/15 text-ink" : "border-line-strong bg-surface/80 text-ink-2 hover:text-ink",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ Fiche du territoire */

function MiniYears({ years }: { years: { year: number; harmonized: number; estimatedShare: number; complete: boolean }[] }) {
  const max = Math.max(...years.map((y) => y.harmonized), 1);
  return (
    <div className="flex h-12 items-end gap-[2px]" aria-hidden>
      {years.map((y) => (
        <span
          key={y.year}
          title={`${y.year} : ${fmtInt(y.harmonized)}`}
          className={cx("min-w-0 flex-1 rounded-t-[2px]", !y.complete ? "bg-line-strong" : y.estimatedShare > 0.5 ? "bg-heat-4/70" : "bg-heat-5")}
          style={{ height: `${Math.max((y.harmonized / max) * 100, 2)}%` }}
        />
      ))}
    </div>
  );
}

export function TerritoryCard({
  territory,
  from,
  to,
  onClose,
  onGo,
  onAnalyse,
  activeZone,
}: {
  territory: Territory;
  from: string;
  to: string;
  onClose: () => void;
  onGo: (t: Territory) => void;
  onAnalyse: (zone: ZoneSpec) => void;
  activeZone: ZoneSpec;
}) {
  const meta = useMetadata().data;
  const zone = territoryZone(territory);
  const fallback: ZoneSpec = { kind: "country" };
  const overview = useOverview(zone ?? fallback, from, to);
  const calendar = useCalendar(zone ?? fallback);
  const provinceIndex = territory.kind === "province" ? territory.index : null;
  const regions = useRegions(from, to);
  const departments = useDepartmentRegions(from, to, provinceIndex, territory.kind === "province");
  const o = zone ? overview.data : undefined;
  const c = zone ? calendar.data : undefined;

  if (territory.kind === "place" && territory.name) rememberPlace(territory.id, territory.name);

  const title =
    territory.kind === "world" ? "La Terre" : territory.kind === "continent" ? territory.name : territory.kind === "country" ? territory.name : zone ? zoneLabel(zone, meta) : "";
  const kindLabel =
    territory.kind === "country" ? "Pays" : territory.kind === "province" ? "Province" : territory.kind === "department" ? "Département" : territory.kind === "place" ? "Localité" : territory.kind === "continent" ? "Continent" : "Vue d'ensemble";
  const same = zone && JSON.stringify(zone) === JSON.stringify(activeZone);

  const children =
    territory.kind === "country" && territory.iso === getApiCountry()
      ? regions.data?.regions.map((r) => ({ name: r.name, value: r.harmonized, target: { kind: "province", index: r.index } as Territory }))
      : territory.kind === "province"
        ? departments.data?.regions.map((r) => ({ name: r.name, value: r.harmonized, target: { kind: "department", index: r.index } as Territory }))
        : territory.kind === "department" && meta
          ? meta.towns.filter((t) => t.department === territory.index).map((t) => ({ name: t.name, value: t.pop, target: { kind: "place", id: t.id, name: t.name, province: t.province, department: t.department } as Territory }))
          : undefined;
  const childTitle = territory.kind === "country" ? "Provinces" : territory.kind === "province" ? "Départements" : "Villes du département";
  const flagged = c ? c.months.filter((m) => ["strong_high", "high", "low"].includes(m.assessment.status)).slice(-3).reverse() : [];
  const trend = c?.trends.full ?? null;
  // Meme regle que la page Tendances : calage local non verifiable ou erreur annuelle au-dela de 20 %.
  const zoneCal = c?.calibration.configs.TA ?? null;
  const weakCalibration = Boolean(c?.calibration.local && zoneCal && (!zoneCal.verified || zoneCal.annualErrorLoyo === null || zoneCal.annualErrorLoyo > 0.2));

  return (
    <aside aria-label="Fiche du territoire" className="pointer-events-auto flex max-h-full w-[min(340px,calc(100vw-24px))] animate-fade-up flex-col overflow-hidden rounded-panel border border-line-strong bg-surface/95 shadow-[0_18px_50px_-12px_rgb(0_0_0/0.85)] backdrop-blur-md">
      <header className="flex items-start gap-3 border-b border-line px-4 py-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-control bg-surface-2 text-accent">{isGabon(territory) ? <MapPin size={16} /> : <Globe size={16} />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[11.5px] text-ink-3">{kindLabel}</p>
          <p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la fiche du territoire" className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X size={15} />
        </button>
      </header>

      <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
        {!zone ? (
          <>
            <p className="text-[13px] leading-relaxed text-ink-2">
              {territory.kind === "country"
                ? hasArchive(territory.iso)
                  ? "Ce pays a son archive NASA FIRMS 2000 à 2025 : passez-y pour en voir les chiffres, tendances et périodes inhabituelles."
                  : "Aucune détection n'est chargée pour ce pays. Hot-Spot traite les archives NASA FIRMS du Gabon et de la France métropolitaine : chiffres, tendances et périodes inhabituelles n'existent que là."
                : "Faites tourner le globe et choisissez une région. Les archives chargées couvrent le Gabon et la France métropolitaine (NASA FIRMS, 2000 à 2025)."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => onGo(archiveCountry("GAB"))}>
                Gabon
                <ArrowRight size={14} />
              </Button>
              <Button size="sm" variant="primary" onClick={() => onGo(archiveCountry("FRA"))}>
                France
                <ArrowRight size={14} />
              </Button>
            </div>
          </>
        ) : (
          <>
            {/* Activite de la periode */}
            {o ? (
              <div className="flex flex-col gap-2.5">
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="num text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink">{fmtInt(o.harmonized)}</span>
                  <span className="text-[12.5px] text-ink-3">cellules-jour actives</span>
                </p>
                {o.window ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <StatusBadge status={o.window.status} />
                    <ReliabilityBadge reliability={o.window.reliability} />
                    {o.window.median ? <span className="num text-[12px] text-ink-3">{fmtDelta(o.harmonized, o.window.median)} / médiane</span> : null}
                  </div>
                ) : null}
                <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
                  {SATELLITE_KEYS.map((k) => (
                    <li key={k} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-1.5 text-ink-3">
                        <SensorMark color={SATELLITES[k].color} shape={SATELLITES[k].shape} size={8} />
                        {SATELLITES[k].name}
                      </span>
                      <span className="num text-ink">{fmtInt(o.detections[k])}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-[11.5px] text-ink-3">Détections natives : les satellites voient en partie les mêmes feux, ces nombres ne s'additionnent pas.</p>
              </div>
            ) : overview.error ? (
              <p className="text-[12.5px] text-critical">Chiffres indisponibles : {overview.error.message}</p>
            ) : (
              <Skeleton className="h-24 w-full" />
            )}

            {/* Historique */}
            <div className="border-t border-line pt-3">
              <p className="mb-2 flex items-center justify-between text-[12px]">
                <span className="font-medium text-ink-2">Depuis 2000</span>
                <span className="text-ink-3">{trend ? (trend.pValue < 0.05 ? (trend.slope > 0 ? "en hausse significative" : "en baisse significative") : "pas de tendance nette") : "tendance non calculée"}</span>
              </p>
              {c ? <MiniYears years={c.years} /> : <Skeleton className="h-12 w-full" />}
              <p className="mt-1 flex justify-between text-[10.5px] text-ink-3">
                <span>2000</span>
                <span>2025</span>
              </p>
              {weakCalibration ? (
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-warning">Calage MODIS fragile sur ce territoire : avant 2012, les valeurs sont peu sûres. Comparez avec « VIIRS seul » dans Tendances.</p>
              ) : null}
            </div>

            {/* Periodes inhabituelles recentes */}
            {c ? (
              <div className="border-t border-line pt-3">
                <p className="mb-1.5 text-[12px] font-medium text-ink-2">Derniers mois inhabituels</p>
                {flagged.length ? (
                  <ul className="flex flex-col gap-1">
                    {flagged.map((m) => (
                      <li key={`${m.year}-${m.month}`} className="flex items-center justify-between gap-2 text-[12.5px]">
                        <span className="capitalize text-ink">
                          {MONTHS_SHORT[m.month - 1]} {m.year}
                        </span>
                        <StatusBadge status={m.assessment.status} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12.5px] text-ink-3">Aucun mois ne s'écarte de sa référence saisonnière.</p>
                )}
              </div>
            ) : null}

            {/* Sous-territoires : comparaison */}
            {children && children.length ? (
              <div className="border-t border-line pt-3">
                <p className="mb-1.5 text-[12px] font-medium text-ink-2">{childTitle}</p>
                <ul className="flex flex-col">
                  {[...children]
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 6)
                    .map((child, i, arr) => (
                      <li key={child.name}>
                        <button type="button" onClick={() => onGo(child.target)} className="group grid w-full grid-cols-[minmax(0,1fr)_80px_44px] items-center gap-2 rounded-[8px] px-1.5 py-1 text-left transition-colors hover:bg-surface-2">
                          <span className="truncate text-[12.5px] text-ink">{child.name}</span>
                          <span className="h-1.5 rounded-full bg-surface-3">
                            <span className="block h-full rounded-full bg-heat-5" style={{ width: `${(child.value / Math.max(arr[0].value, 1)) * 100}%` }} />
                          </span>
                          <span className="num text-right text-[11.5px] text-ink-2">{fmtInt(child.value)}</span>
                        </button>
                      </li>
                    ))}
                </ul>
                <p className="mt-1 text-[11px] text-ink-3">{territory.kind === "department" ? "Classées par population (GeoNames)." : "Indice harmonisé de la période, en cellules-jour."}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              {same ? (
                <span className="text-[12.5px] text-good">Zone d'analyse active</span>
              ) : (
                <Button size="sm" variant="primary" onClick={() => onAnalyse(zone)}>
                  Analyser ce territoire
                </Button>
              )}
              <Link href="/calendar" onClick={() => !same && onAnalyse(zone)} className="inline-flex h-8 items-center rounded-control px-2.5 text-[13px] font-medium text-accent hover:text-accent-strong">
                Calendrier
              </Link>
              <Link href="/anomalies" onClick={() => !same && onAnalyse(zone)} className="inline-flex h-8 items-center rounded-control px-2.5 text-[13px] font-medium text-accent hover:text-accent-strong">
                Mois inhabituels
              </Link>
            </div>
            <p className="text-[11px] leading-relaxed text-ink-3">
              Indicateurs d'aide à l'analyse et à la priorisation des vérifications de terrain. Ni incendie confirmé, ni prédiction.
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
