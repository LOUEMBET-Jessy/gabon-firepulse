"use client";

import { ArrowSquareOut, DownloadSimple, Faders, PencilSimpleLine, X } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useState } from "react";

import { FireMap } from "@/components/blocks";
import { CONTINENTS, Navigator, TerritoryCard, archiveCountry, hasArchive, isGabon, territoryFromZone, territoryZone, type Territory } from "@/components/map/explorer";
import { LIVE_SATS, LiveControls, LiveDetectionCard, LiveTerritoryCard, TERRITORY_BBOX, ago, type LiveFocus } from "@/components/map/live";
import { ScaleLegend, activityBreaks } from "@/components/heatmaps";
import { DRAW_EVENT, DRAW_FLAG, zoneLabel } from "@/components/shell/pickers";
import { Button, Checkbox, ErrorState, Notice, Segmented, SensorMark, Skeleton, buttonClass, cx } from "@/components/ui";
import { exportUrl, useHydrated, useDetection, useDetections, useGrid, useLive, useMetadata, type MapFilters } from "@/lib/api";
import { fmtCoord, fmtDateShort, fmtDateTimeUtc, fmtInt, fmtPeriod } from "@/lib/format";
import { CONF_LABEL, DEFINITIONS, LIVE_SATELLITE_INFO, SATELLITES } from "@/lib/labels";
import type { DetectionDetail, GridCell, LiveTerritory, ZoneSpec } from "@/lib/types";
import { SATELLITE_KEYS } from "@/lib/types";
import { useFilters } from "@/state/filters";
import { updateView, useView, type MapMode } from "@/state/view";


function Group({ title, children, hint }: { title: string; children: React.ReactNode; hint?: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5 border-t border-line px-4 py-3.5 first:border-t-0">
      <legend className="float-left mb-1 w-full text-[12px] font-medium text-ink-2">{title}</legend>
      <div className="clear-both flex flex-col gap-1">{children}</div>
      {hint ? <p className="text-[11.5px] leading-relaxed text-ink-3">{hint}</p> : null}
    </fieldset>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 text-[12.5px] last:border-b-0">
      <dt className="shrink-0 text-ink-3">{label}</dt>
      <dd className="num min-w-0 break-words text-right text-ink">{children}</dd>
    </div>
  );
}

function DetectionCard({ id, onClose }: { id: number; onClose: () => void }) {
  const { data, error, isLoading } = useDetection(id);
  return (
    <aside aria-label="Fiche de détection" className="flex max-h-full flex-col overflow-hidden rounded-panel border border-line-strong bg-surface shadow-[0_18px_50px_-12px_rgb(0_0_0/0.8)]">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-medium text-ink">Fiche de détection</p>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-3">Centre d'un pixel signalé comme anomalie thermique. Ni incendie confirmé, ni surface brûlée.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer la fiche" className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X size={16} />
        </button>
      </header>
      <div className="overflow-y-auto px-4 py-2">
        {error ? <ErrorState error={error} compact /> : null}
        {isLoading || !data ? (
          error ? null : (
            <div className="flex flex-col gap-2 py-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )
        ) : (
          <DetectionFields d={data} />
        )}
      </div>
    </aside>
  );
}

function DetectionFields({ d }: { d: DetectionDetail }) {
  const s = SATELLITES[d.satellite];
  const na = (v: number | null, unit = "") => (v === null ? "indisponible" : `${String(v).replace(".", ",")}${unit}`);
  return (
    <>
      <p className="flex items-center gap-2 py-2 text-[13px] font-medium text-ink">
        <SensorMark color={s.color} shape={s.shape} />
        {d.sensor} {d.platform}
        <span className="text-ink-3">pixel de {s.pixel} au nadir</span>
      </p>
      <dl>
        <Row label="Acquisition (UTC)">{fmtDateTimeUtc(d.acqDatetimeUtc)}</Row>
        <Row label="Latitude, longitude">
          {fmtCoord(d.lat, 5)}, {fmtCoord(d.lon, 5)}
        </Row>
        <Row label="Jour ou nuit">{d.night ? "Nuit" : "Jour"}</Row>
        <Row label="Confiance native">{d.confidenceNative}</Row>
        <Row label="Classe de confiance">{CONF_LABEL[d.confidenceClass]}</Row>
        <Row label="Puissance radiative (FRP)">{na(d.frp, " MW")}</Row>
        <Row label={d.brightnessLabel}>{na(d.brightness)}</Row>
        <Row label={d.brightness2Label}>{na(d.brightness2)}</Row>
        <Row label="Taille du pixel (scan × track)">{d.scan === null || d.track === null ? "indisponible" : `${na(d.scan)} × ${na(d.track)} km`}</Row>
        <Row label="Type selon le produit">{d.typeLabel}</Row>
        <Row label="Province">{d.province ?? "hors polygones de provinces"}</Row>
        <Row label="Cellule de la grille">
          n° {d.cell.index} ({fmtCoord(d.cell.west, 2)} à {fmtCoord(d.cell.east, 2)}° E)
        </Row>
      </dl>
      <p className={cx("my-2 rounded-control border px-3 py-2 text-[12.5px] leading-relaxed", d.eligible ? "border-good/30 bg-good/[0.06] text-ink-2" : "border-line-strong bg-surface-2 text-ink-2")}>
        <span className="font-medium text-ink">{d.eligible ? "Comptée dans l'indice harmonisé." : "Non comptée dans l'indice harmonisé."}</span> {d.eligibilityReason}
      </p>
      <p className="pb-1 pt-2 text-[12px] font-medium text-ink-2">Provenance</p>
      <dl>
        <Row label="Produit">{d.product}</Row>
        <Row label="Champ version">{d.version}</Row>
        <Row label="Enregistrement source">{d.source.recordId}</Row>
        <Row label="Fichier consulté le">{fmtDateTimeUtc(d.source.accessedAt)}</Row>
        <Row label="Empreinte SHA-256">{d.source.sha256.slice(0, 16)}…</Row>
        <Row label="Importée le">{fmtDateTimeUtc(d.ingestedAt)}</Row>
      </dl>
      <a href={d.source.url} target="_blank" rel="noreferrer" className="my-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent hover:text-accent-strong">
        Fichier source sur NASA FIRMS
        <ArrowSquareOut size={14} />
      </a>
    </>
  );
}

function CellCard({ cell, step, onClose }: { cell: GridCell; step: number; onClose: () => void }) {
  return (
    <aside aria-label="Cellule de la grille" className="rounded-panel border border-line-strong bg-surface shadow-[0_18px_50px_-12px_rgb(0_0_0/0.8)]">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-[14px] font-medium text-ink">Cellule n° {cell.cell}</p>
          <p className="num mt-0.5 text-[12px] text-ink-3">
            {fmtCoord(cell.lon, 2)} à {fmtCoord(cell.lon + step, 2)}° E, {fmtCoord(cell.lat, 2)} à {fmtCoord(cell.lat + step, 2)}° N
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
          <X size={16} />
        </button>
      </header>
      <dl className="px-4 py-2">
        <Row label="Jours actifs harmonisés">{String(cell.harmonized).replace(".", ",")}</Row>
        <Row label="Détections MODIS retenues">{fmtInt(cell.modis)}</Row>
        <Row label="Détections Suomi-NPP retenues">{fmtInt(cell.snpp)}</Row>
        <Row label="Détections NOAA-20 retenues">{fmtInt(cell.noaa20)}</Row>
      </dl>
      <p className="border-t border-line px-4 py-2.5 text-[12px] leading-relaxed text-ink-3">
        La cellule compte une fois par jour où elle est active, pour le capteur qui alimente ce jour. L'agrégation n'améliore pas la résolution native des capteurs.
      </p>
    </aside>
  );
}

export function MapView() {
  const { zone, from, to, setZone, country, setCountry } = useFilters();
  const meta = useMetadata();
  const hydrated = useHydrated();
  // Mode, filtres et couches vivent dans le magasin partage : l'assistant les lit et les modifie.
  const { mode, filters, basemap, showProvinces, streets, source, live: liveFilters } = useView((v) => v.map);
  const setStreets = (value: boolean) => updateView("map", { streets: value });
  const isLive = source === "live";
  const setMode = (value: MapMode) => updateView("map", { mode: value });
  const setFilters = (fn: (f: MapFilters) => MapFilters) => updateView("map", { filters: fn(filters) });
  const setBasemap = (value: boolean) => updateView("map", { basemap: value });
  const setShowProvinces = (value: boolean) => updateView("map", { showProvinces: value });
  const [selected, setSelected] = useState<number | null>(null);
  const [cell, setCell] = useState<GridCell | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [basemapError, setBasemapError] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  // Exploration du globe : territoire montre (pas forcement la zone d'analyse), vols, niveau de zoom.
  const [territory, setTerritory] = useState<Territory>(() => territoryFromZone(zone) ?? { kind: "world" });
  const [cardOpen, setCardOpen] = useState(false);
  const [flight, setFlight] = useState<{ key: number; bbox: [number, number, number, number] | null; maxZoom?: number } | null>(null);
  const [zoomLevel, setZoomLevel] = useState(6);
  // Satellites en orbite : une illustration, que l'on peut masquer (choix memorise dans ce navigateur).
  const [satellites, setSatellites] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- preference lue une fois apres le montage
      if (window.localStorage.getItem("hotspot.globe.satellites") === "0") setSatellites(false);
    } catch {
      /* stockage indisponible */
    }
  }, []);
  const toggleSatellites = (on: boolean) => {
    setSatellites(on);
    try {
      window.localStorage.setItem("hotspot.globe.satellites", on ? "1" : "0");
    } catch {
      /* stockage indisponible */
    }
  };
  // Arrivee depuis l'espace : une fois par navigateur, jamais si l'utilisateur limite les animations.
  // Lecture sans ecriture a l'initialisation (React peut l'executer deux fois) ; la marque est posee apres coup.
  const [intro] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("hotspot.globe.seen") !== "1" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("hotspot.globe.seen", "1");
    } catch {
      /* stockage indisponible : l'arrivee depuis l'espace se rejouera, sans consequence */
    }
  }, []);

  // La zone d'analyse choisie ailleurs (selecteur, assistant) devient le territoire montre.
  useEffect(() => {
    const t = territoryFromZone(zone);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- le territoire suit la zone d'analyse quand elle change
    if (t) setTerritory(t);
  }, [zone]);

  const fly = (bbox: [number, number, number, number] | null, maxZoom?: number) => setFlight({ key: Date.now(), bbox, maxZoom });
  const sameZone = (a: ZoneSpec, b: ZoneSpec) => JSON.stringify(a) === JSON.stringify(b);

  /** Navigation explicite (fil d'Ariane, recherche, fiche) : on se deplace, et la zone suit pour le Gabon. */
  const go = useCallback(
    (t: Territory) => {
      setTerritory(t);
      setCardOpen(true);
      setSelected(null);
      setCell(null);
      if (t.kind === "world") return fly(null);
      if (t.kind === "continent") return fly(CONTINENTS.find((c) => c.name === t.name)?.bbox ?? null, 4);
      if (t.kind === "country" && !hasArchive(t.iso)) return fly(t.bbox, 5.5);
      // Autre pays dote d'une archive : tous les ecrans basculent sur ce pays.
      if (t.kind === "country" && t.iso !== country) {
        setCountry(t.iso as "GAB" | "FRA");
        return fly(t.bbox, 7);
      }
      const z = territoryZone(t)!;
      // Meme zone : un nouvel objet relance le cadrage (on a pu s'en eloigner en naviguant).
      if (sameZone(z, zone)) return z.kind === "country" ? fly(archiveCountry().bbox, 7) : setZone({ ...z });
      setZone(z);
    },
    [zone, setZone, country, setCountry],
  );

  /** Clic sur le globe : un pays fait voyager ; dans le Gabon, le clic montre la fiche sans deplacer la carte. */
  const onPickArea = (pick: Parameters<NonNullable<React.ComponentProps<typeof FireMap>["onPickArea"]>>[0]) => {
    if (!pick) return;
    if (isLive) {
      setSelectedLive(null);
      if (pick.kind === "country" && (pick.iso === "GAB" || pick.iso === "FRA")) {
        const t = pick.iso as LiveTerritory;
        setLiveFocus({ territory: t });
        if (zoomLevel < 4.4) fly(TERRITORY_BBOX[t], 6.5);
        return;
      }
      if (pick.kind === "subdivision") return setLiveFocus(pick.level === 1 ? { territory: "FRA", level1: pick.name } : { territory: "FRA", level2: pick.name });
      if (pick.kind === "province") return setLiveFocus({ territory: "GAB", level1: meta.data?.provinces[pick.index]?.name });
      if (pick.kind === "department") {
        const d = meta.data?.departments[pick.index];
        return setLiveFocus({ territory: "GAB", level1: d ? meta.data?.provinces[d.province]?.name : undefined, level2: d?.name });
      }
      if (pick.kind === "country") return go(pick);
      return;
    }
    if (pick.kind === "country" && (pick.iso !== country || zoomLevel < 4.4)) return go(pick);
    if (pick.kind === "country") return;
    setTerritory(pick);
    setCardOpen(true);
  };
  const detections = useDetections(zone, from, to, filters, !isLive && mode === "points");
  const grid = useGrid(zone, from, to, !isLive && mode === "grid");

  // Observatoire temps reel (NASA FIRMS NRT) : filtres pays, periode, satellites ; fiche d'un territoire observe.
  const liveSats = LIVE_SATS.filter((k) => liveFilters.sats[k]);
  const live = useLive(liveFilters.territories, liveFilters.days, liveSats, isLive);
  const [liveFocus, setLiveFocus] = useState<LiveFocus | null>(null);
  const [selectedLive, setSelectedLive] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const setLive = (patch: Partial<typeof liveFilters>) => updateView("map", { live: { ...liveFilters, ...patch } });
  const refreshLive = async () => {
    setRefreshing(true);
    try {
      const p = new URLSearchParams({ territories: liveFilters.territories.join(","), days: String(liveFilters.days), sats: liveSats.join(","), refresh: "1" });
      const fresh = await fetch(`/api/live?${p}`).then((r) => (r.ok ? r.json() : null));
      if (fresh) await live.mutate(fresh, { revalidate: false });
    } finally {
      setRefreshing(false);
    }
  };
  const switchSource = (next: "archive" | "live") => {
    updateView("map", { source: next });
    setSelected(null);
    setCell(null);
    setSelectedLive(null);
    if (next === "live") {
      setCardOpen(false);
      const t = liveFilters.territories;
      setLiveFocus(t.length === 1 ? { territory: t[0] } : null);
      fly(t.length === 1 ? TERRITORY_BBOX[t[0]] : [-8, -6, 18, 52], 6);
    } else {
      setLiveFocus(null);
      fly(archiveCountry().bbox, 7);
    }
  };
  const liveDetail = isLive && selectedLive ? live.data?.detections.find((x) => x.id === selectedLive) : undefined;
  const lastSync = live.data?.feeds.reduce<string | null>((acc, f) => (f.checkedAt && (!acc || f.checkedAt > acc) ? f.checkedAt : acc), null) ?? null;
  const highlight = isLive
    ? liveFocus?.territory === "FRA" && (liveFocus.level2 || liveFocus.level1)
      ? { subdivision: liveFocus.level2 ? { level: 2 as const, name: liveFocus.level2 } : { level: 1 as const, name: liveFocus.level1! } }
      : liveFocus?.territory === "GAB" && liveFocus.level1
        ? { province: meta.data?.provinces.findIndex((x) => x.name === liveFocus.level1) ?? null, department: liveFocus.level2 ? (meta.data?.departments.find((x) => x.name === liveFocus.level2)?.index ?? null) : null }
        : liveFocus
          ? { country: liveFocus.territory }
          : {}
    : territory.kind === "country" && territory.iso !== country
      ? { country: territory.iso }
      : territory.kind === "province"
        ? { province: territory.index }
        : territory.kind === "department"
          ? { department: territory.index }
          : {};
  const noSatellite = !Object.values(filters.sats).some(Boolean);
  const noConfidence = !Object.values(filters.conf).some(Boolean);

  // Demande de dessin venue du selecteur de zone (autre ecran ou meme ecran).
  useEffect(() => {
    const check = () => {
      try {
        if (window.sessionStorage.getItem(DRAW_FLAG) === "1") {
          window.sessionStorage.removeItem(DRAW_FLAG);
          setDrawing(true);
        }
      } catch {
        /* stockage indisponible */
      }
    };
    check();
    window.addEventListener(DRAW_EVENT, check);
    return () => window.removeEventListener(DRAW_EVENT, check);
  }, []);

  const setSat = (key: keyof MapFilters["sats"], on: boolean) => setFilters((f) => ({ ...f, sats: { ...f.sats, [key]: on } }));
  const setConf = (key: keyof MapFilters["conf"], on: boolean) => setFilters((f) => ({ ...f, conf: { ...f.conf, [key]: on } }));
  const d = detections.data;
  const total = d?.total ?? 0;
  const gridBreaks = grid.data ? activityBreaks(grid.data.cells.map((c) => c.harmonized)) : [];

  const sourceSwitch = (
    <Group title="Observations">
      <Segmented
        label="Source des observations"
        value={source}
        onChange={switchSource}
        options={[
          { value: "archive", label: `Archive 2000-${meta.data?.coverage.lastDate.slice(0, 4) ?? "…"}` },
          { value: "live", label: "Temps réel" },
        ]}
      />
      <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
        {isLive
          ? "Dernières détections NASA FIRMS pour le Gabon et la France, actualisées automatiquement. Non harmonisées, non définitives."
          : `Archive NASA FIRMS ${country === "FRA" ? "de la France métropolitaine" : "du Gabon"}, de 2000 au ${meta.data ? fmtDateShort(meta.data.coverage.lastDate) : "…"}, contrôlée et harmonisée : la base de tous les calculs de la plateforme.${meta.data?.recent?.provisionalFrom ? ` Provisoire depuis le ${fmtDateShort(meta.data.recent.provisionalFrom)}.` : ""}`}
      </p>
    </Group>
  );

  const liveControls = (
    <>
      {sourceSwitch}
      <LiveControls
        data={live.data}
        error={live.error}
        loading={live.isLoading}
        territories={liveFilters.territories}
        days={liveFilters.days}
        sats={liveFilters.sats}
        onChange={(patch) => {
          setLive(patch);
          setSelectedLive(null);
        }}
        onRefresh={() => void refreshLive()}
        refreshing={refreshing}
      />
      <Group title="Couches de contexte">
        <Checkbox checked={satellites} onChange={toggleSatellites}>
          Satellites MODIS et VIIRS en vue Terre
        </Checkbox>
        <Checkbox
          checked={basemap}
          onChange={(on) => {
            setBasemap(on);
            setBasemapError(false);
          }}
        >
          Relief NASA Blue Marble (en ligne)
        </Checkbox>
        <Checkbox checked={streets} onChange={setStreets}>
          Rues et quartiers, très détaillé (en ligne)
        </Checkbox>
        {streets ? (
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            Fond OpenStreetMap, lisible jusqu'aux rues et aux quartiers. À partir du zoom 10, chaque détection montre l'emprise réelle de son pixel : le feu est quelque part dans ce rectangle, pas forcément au point.
          </p>
        ) : null}
        <p className="text-[11.5px] leading-relaxed text-ink-3">France : régions et départements geoBoundaries (Licence Ouverte Etalab 2.0, état 2022). Gabon : geoBoundaries.</p>
      </Group>
    </>
  );

  const controls = isLive ? liveControls : (
    <>
      {sourceSwitch}
      <Group title="Affichage">
        <Segmented
          label="Mode d'affichage"
          value={mode}
          onChange={(v) => {
            setMode(v);
            setSelected(null);
            setCell(null);
          }}
          options={[
            { value: "points", label: "Détections natives" },
            { value: "grid", label: "Grille harmonisée" },
          ]}
        />
        <p className="mt-1 text-[11.5px] leading-relaxed text-ink-3">
          {mode === "points"
            ? "Chaque point est le centre d'un pixel signalé, à sa position d'origine."
            : "Jours actifs par cellule de 0,05°, en équivalent Suomi-NPP : la même unité que le calendrier."}
        </p>
      </Group>

      {mode === "points" ? (
        <>
          <Group title="Satellites">
            {SATELLITE_KEYS.map((key) => (
              <Checkbox key={key} checked={filters.sats[key]} onChange={(on) => setSat(key, on)}>
                <span className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <SensorMark color={SATELLITES[key].color} shape={SATELLITES[key].shape} />
                    {SATELLITES[key].sensor} {SATELLITES[key].name}
                  </span>
                  <span className="num text-[12px] text-ink-3">{d ? fmtInt(d.bySatellite[key]) : ""}</span>
                </span>
              </Checkbox>
            ))}
          </Group>
          <Group title="Confiance" hint="MODIS : faible sous 30 %, élevée à partir de 80 %. VIIRS : classes natives l, n, h.">
            {(["low", "nominal", "high"] as const).map((key) => (
              <Checkbox key={key} checked={filters.conf[key]} onChange={(on) => setConf(key, on)}>
                {CONF_LABEL[key]}
              </Checkbox>
            ))}
          </Group>
          <Group title="Type de source" hint="Le produit classe chaque détection : feu de végétation présumé, ou source statique (par exemple une torchère ou une installation industrielle).">
            <Segmented
              label="Type de source"
              value={filters.types}
              onChange={(types) => setFilters((f) => ({ ...f, types }))}
              options={[
                { value: "all", label: "Toutes" },
                { value: "veg", label: "Végétation" },
                { value: "static", label: "Statiques" },
              ]}
            />
          </Group>
          <Group title="Moment du passage">
            <Segmented
              label="Jour ou nuit"
              value={filters.dayNight}
              onChange={(dayNight) => setFilters((f) => ({ ...f, dayNight }))}
              options={[
                { value: "all", label: "Tous" },
                { value: "day", label: "Jour" },
                { value: "night", label: "Nuit" },
              ]}
            />
          </Group>
        </>
      ) : (
        <Group title="Contenu de la grille">
          <p className="text-[12.5px] leading-relaxed text-ink-2">{DEFINITIONS.eligible}</p>
          <p className="text-[11.5px] leading-relaxed text-ink-3">Les filtres de satellite et de confiance ne s'appliquent pas ici : ils changeraient la définition de l'indice.</p>
        </Group>
      )}

      <Group title="Zone d'analyse">
        <p className="text-[12.5px] text-ink">{zoneLabel(zone, meta.data)}</p>
        {zone.kind === "place" ? <p className="text-[11.5px] text-ink-3">Disque de {meta.data?.placeRadiusKm ?? 15} km autour de la localité : un point n'a pas de surface propre.</p> : null}
        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" variant={drawing ? "primary" : "secondary"} onClick={() => (setDrawing((v) => !v), setPanelOpen(false))}>
            <PencilSimpleLine size={15} />
            {drawing ? "Annuler le dessin" : "Dessiner un rectangle"}
          </Button>
          {zone.kind !== "country" ? (
            <Button size="sm" variant="ghost" onClick={() => setZone({ kind: "country" })}>
              Revenir au pays entier
            </Button>
          ) : null}
        </div>
      </Group>

      <Group title="Couches de contexte">
        <Checkbox checked={showProvinces} onChange={setShowProvinces}>
          Limites des provinces
        </Checkbox>
        <Checkbox checked={satellites} onChange={toggleSatellites}>
          Satellites MODIS et VIIRS en vue Terre
        </Checkbox>
        <Checkbox
          checked={basemap}
          onChange={(on) => {
            setBasemap(on);
            setBasemapError(false);
          }}
        >
          Relief NASA Blue Marble (en ligne)
        </Checkbox>
        <Checkbox checked={streets} onChange={setStreets}>
          Rues et quartiers, très détaillé (en ligne)
        </Checkbox>
        {streets ? (
          <p className="text-[11.5px] leading-relaxed text-ink-3">
            Fond OpenStreetMap, lisible jusqu'aux rues et aux quartiers. À partir du zoom 10, chaque détection montre l'emprise réelle de son pixel : le feu est quelque part dans ce rectangle, pas forcément au point.
          </p>
        ) : null}
        {basemap && basemapError ? <p className="text-[11.5px] text-warning">Fond en ligne indisponible. La carte continue de fonctionner avec les limites locales.</p> : null}
        <p className="text-[11.5px] leading-relaxed text-ink-3">
          Provinces : geoBoundaries (CC BY-SA 3.0, état 2005). Départements : geoBoundaries (CC BY 3.0, état 2018). Localités : GeoNames (CC BY 4.0). Pays du monde : Natural Earth. Repères, pas références juridiques.
        </p>
      </Group>

      <Group title="Exporter la sélection" hint="L'export contient exactement les détections retenues par les filtres ci-dessus, avec le renvoi à leur ligne source.">
        <div className="flex flex-wrap gap-2">
          <a className={buttonClass("secondary", "sm")} href={hydrated ? exportUrl("detections", "csv", zone, from, to, mode === "points" ? filters : undefined) : undefined} download>
            <DownloadSimple size={15} />
            CSV
          </a>
          <a className={buttonClass("secondary", "sm")} href={hydrated ? exportUrl("detections", "geojson", zone, from, to, mode === "points" ? filters : undefined) : undefined} download>
            <DownloadSimple size={15} />
            GeoJSON
          </a>
        </div>
      </Group>
    </>
  );

  return (
    <div className="relative flex h-full space-bg">
      {/* Panneau de filtres (ordinateur) */}
      <aside aria-label="Filtres de la carte" data-tour="map-filters" className="hidden w-[304px] shrink-0 overflow-y-auto border-r border-line bg-surface lg:block">
        {controls}
      </aside>

      <div className="relative min-w-0 flex-1">
        <FireMap
          geoBase={meta.data?.geoUrl}
          streets={streets}
          globe
          intro={intro}
          highlight={highlight}
          flight={flight}
          onPickArea={onPickArea}
          onZoom={setZoomLevel}
          showSatellites={satellites}
          liveMode={isLive}
          live={isLive ? (live.data?.detections ?? null) : null}
          selectedLiveId={selectedLive}
          onSelectLive={(id) => {
            setSelectedLive(id);
            if (id) setLiveFocus(null);
          }}
          placeRadiusKm={meta.data?.placeRadiusKm}
          mode={mode}
          points={isLive || noSatellite || noConfidence ? null : d?.points}
          grid={isLive ? undefined : grid.data}
          zone={zone}
          selectedIndex={selected}
          onSelectDetection={(index) => (setSelected(index), setCell(null))}
          onSelectCell={(c) => (setCell(c), setSelected(null))}
          drawing={drawing}
          onDrawn={(bbox) => {
            setZone({ kind: "bbox", bbox });
            setDrawing(false);
          }}
          onCancelDraw={() => setDrawing(false)}
          basemap={basemap}
          onBasemapError={() => setBasemapError(true)}
          showProvinces={showProvinces}
          className="absolute inset-0"
        />

        {/* Etat, navigation et fiche du territoire */}
        <div className="pointer-events-none absolute bottom-24 left-3 right-14 top-3 flex flex-col items-start gap-2 md:right-auto">
          <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-control border border-line-strong bg-surface/95 px-3 py-2 text-[12.5px] backdrop-blur" role="status" aria-live="polite">
            <button type="button" data-tour="map-filters" onClick={() => setPanelOpen(true)} className="flex items-center gap-1.5 font-medium text-accent lg:hidden">
              <Faders size={15} />
              Filtres
            </button>
            {isLive ? (
              live.error ? (
                <span className="text-critical">NASA FIRMS injoignable</span>
              ) : !live.data ? (
                <span className="text-ink-3">Interrogation de la NASA</span>
              ) : (
                <span className="text-ink-2">
                  <span className="num font-medium text-ink">{fmtInt(live.data.counts.total)}</span> détections récentes · synchro {ago(lastSync)}
                </span>
              )
            ) : mode === "points" ? (
              detections.error ? (
                <span className="text-critical">Chargement impossible</span>
              ) : !d ? (
                <span className="text-ink-3">Lecture des détections</span>
              ) : (
                <span className="text-ink-2">
                  <span className="num font-medium text-ink">{fmtInt(noSatellite || noConfidence ? 0 : total)}</span> détections · {fmtPeriod(from, to)}
                </span>
              )
            ) : grid.error ? (
              <span className="text-critical">Chargement impossible</span>
            ) : !grid.data ? (
              <span className="text-ink-3">Calcul de la grille</span>
            ) : (
              <span className="text-ink-2">
                <span className="num font-medium text-ink">{fmtInt(grid.data.cells.length)}</span> cellules actives · {fmtPeriod(from, to)}
              </span>
            )}
          </div>

          {isLive ? null : <Navigator territory={territory} onGo={go} />}
          {isLive && liveFocus && !liveDetail ? (
            <div className="mt-auto flex max-h-[48%] min-h-0 flex-col md:mt-0 md:max-h-none md:flex-1">
              <LiveTerritoryCard
                focus={liveFocus}
                data={live.data}
                onClose={() => setLiveFocus(null)}
                onFocus={(f, bbox) => {
                  setLiveFocus(f);
                  if (bbox) fly(bbox, f.level2 ? 9 : f.level1 ? 8 : 6.5);
                }}
              />
            </div>
          ) : null}
          {isLive && live.data ? (
            <div className="pointer-events-auto flex flex-wrap gap-1.5" role="group" aria-label="Pays observés">
              <button
                type="button"
                onClick={() => (setLiveFocus(null), setSelectedLive(null), fly(null))}
                className="rounded-full border border-line-strong bg-surface/90 px-3 py-1.5 text-[12.5px] text-ink-2 backdrop-blur-md transition-colors hover:border-accent/60 hover:text-ink"
              >
                Terre
              </button>
              {liveFilters.territories.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => (setLiveFocus({ territory: t }), fly(TERRITORY_BBOX[t], 6.5))}
                  className="rounded-full border border-line-strong bg-surface/90 px-3 py-1.5 text-[12.5px] text-ink-2 backdrop-blur-md transition-colors hover:border-accent/60 hover:text-ink"
                >
                  {t === "GAB" ? "Gabon" : "France"} <span className="num text-ink">{fmtInt(live.data!.counts.byTerritory[t] ?? 0)}</span>
                </button>
              ))}
            </div>
          ) : null}
          {!isLive && cardOpen && !(selected !== null || cell) ? (
            <div className="mt-auto flex max-h-[48%] min-h-0 flex-col md:mt-0 md:max-h-none md:flex-1">
              <TerritoryCard territory={territory} from={from} to={to} activeZone={zone} onClose={() => setCardOpen(false)} onGo={go} onAnalyse={setZone} />
            </div>
          ) : null}
          {!isGabon(territory) && !cardOpen ? (
            <button type="button" onClick={() => setCardOpen(true)} className="pointer-events-auto rounded-full border border-line-strong bg-surface/90 px-3 py-1.5 text-[12px] text-ink-2 backdrop-blur-md hover:text-ink">
              Que montre cette vue ?
            </button>
          ) : null}

          {drawing ? (
            <div className="pointer-events-auto max-w-[420px]">
              <Notice title="Dessin d'une zone">Cliquez et faites glisser sur la carte pour tracer un rectangle. Touche Échap pour annuler.</Notice>
            </div>
          ) : null}
          {isLive && live.data && live.data.counts.total === 0 ? (
            <div className="pointer-events-auto max-w-[440px]">
              <Notice title="Aucune détection récente pour ces filtres">La NASA n'a publié aucune anomalie thermique ici sur la période choisie. Ce n'est pas une preuve d'absence de feu : nuages et heures de passage limitent l'observation.</Notice>
            </div>
          ) : null}
          {!isLive && mode === "points" && d?.truncated ? (
            <div className="pointer-events-auto max-w-[460px]">
              <Notice tone="warning" title={`${fmtInt(d.total)} détections : trop pour un affichage point par point`}>
                Au-delà de {fmtInt(d.cap)} points, la carte n'affiche rien plutôt qu'un échantillon qui fausserait la densité. Réduisez la période ou la zone, ou passez en grille harmonisée. L'export CSV reste complet.
              </Notice>
            </div>
          ) : null}
          {!isLive && mode === "points" && (noSatellite || noConfidence) ? (
            <div className="pointer-events-auto max-w-[420px]">
              <Notice title="Aucun filtre actif">Cochez au moins un satellite et un niveau de confiance pour afficher des détections.</Notice>
            </div>
          ) : null}
          {!isLive && mode === "points" && d && !d.truncated && total === 0 && !noSatellite && !noConfidence ? (
            <div className="pointer-events-auto max-w-[440px]">
              <Notice title="Aucune détection pour ces filtres">Aucun satellite n'a signalé d'anomalie thermique ici sur cette période. Ce n'est pas une preuve d'absence de feu : nuages et heures de passage limitent l'observation.</Notice>
            </div>
          ) : null}
          {!isLive && (mode === "points" ? detections.error : grid.error) ? (
            <div className="pointer-events-auto max-w-[460px] rounded-panel border border-line-strong bg-surface">
              <ErrorState error={mode === "points" ? detections.error : grid.error} onRetry={() => (mode === "points" ? detections.mutate() : grid.mutate())} compact />
            </div>
          ) : null}
        </div>

        {/* Legende */}
        <div className="pointer-events-none absolute bottom-9 left-3 right-3 flex justify-start lg:bottom-10">
          <div data-tour="map-legend" className="pointer-events-auto max-w-full rounded-control border border-line-strong bg-surface/95 px-3 py-2 backdrop-blur">
            {isLive ? (
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
                {LIVE_SATS.filter((k) => liveFilters.sats[k]).map((k) => (
                  <li key={k} className="flex items-center gap-1.5">
                    <SensorMark color={LIVE_SATELLITE_INFO[k].color} shape={LIVE_SATELLITE_INFO[k].shape} /> {LIVE_SATELLITE_INFO[k].sensor} {LIVE_SATELLITE_INFO[k].name}
                  </li>
                ))}
                <li className="flex items-center gap-1.5 text-ink-3">
                  <span aria-hidden className="size-3 rounded-full bg-ink-2/30 shadow-[0_0_6px_2px_rgb(244_247_250/0.25)]" /> halo : moins de 24 h
                </li>
              </ul>
            ) : mode === "points" ? (
              <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ink-2">
                {zoomLevel < 4 && satellites ? (
                  <li className="flex w-full items-center gap-1.5 text-ink-3">
                    <span aria-hidden className="h-[3px] w-3 rounded-full bg-accent" />
                    <span aria-hidden className="-ml-1 h-[3px] w-3 rounded-full bg-ember" />
                    Orbites illustratives de MODIS et VIIRS, temps accéléré : positions non réelles, fauchées à l'échelle.
                  </li>
                ) : null}
                {zoomLevel < 5 ? (
                  <li className="flex items-center gap-1.5 text-ink-3">
                    <span aria-hidden className="inline-block size-3 rounded-full border-[3px] border-l-snpp border-t-modis border-r-noaa20 border-b-snpp" />
                    Anneau : part de chaque capteur dans un groupe de détections
                  </li>
                ) : null}
                <li className="flex items-center gap-1.5">
                  <SensorMark color={SATELLITES.terra.color} shape="square" /> MODIS Terra et Aqua, pixel de 1 km
                </li>
                <li className="flex items-center gap-1.5">
                  <SensorMark color={SATELLITES.snpp.color} shape="circle" /> VIIRS Suomi-NPP, 375 m
                </li>
                <li className="flex items-center gap-1.5">
                  <SensorMark color={SATELLITES.noaa20.color} shape="circle" /> VIIRS NOAA-20, 375 m
                </li>
              </ul>
            ) : (
              <ScaleLegend mode="activity" breaks={gridBreaks} unit="Jours actifs harmonisés par cellule" />
            )}
          </div>
        </div>

        {/* Fiche de detail */}
        {liveDetail ? (
          <div className="absolute inset-x-3 bottom-3 top-auto z-20 max-h-[62%] md:inset-x-auto md:bottom-12 md:right-3 md:top-14 md:max-h-none md:w-[372px]">
            <LiveDetectionCard d={liveDetail} feed={live.data?.feeds.find((f) => f.feed === liveDetail.feed && f.territory === liveDetail.territory)} onClose={() => setSelectedLive(null)} />
          </div>
        ) : null}
        {!isLive && (selected !== null || cell) ? (
          <div className="absolute inset-x-3 bottom-3 top-auto z-20 max-h-[62%] md:inset-x-auto md:bottom-12 md:right-3 md:top-14 md:max-h-none md:w-[372px]">
            {selected !== null ? <DetectionCard id={selected} onClose={() => setSelected(null)} /> : cell && grid.data ? <CellCard cell={cell} step={grid.data.step} onClose={() => setCell(null)} /> : null}
          </div>
        ) : null}
      </div>

      {/* Filtres en feuille (tablette et telephone) */}
      {panelOpen ? (
        <div className="absolute inset-0 z-30 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Filtres de la carte">
          <button type="button" aria-label="Fermer les filtres" className="flex-1 bg-bg/60" onClick={() => setPanelOpen(false)} />
          <div className="flex w-[min(340px,88vw)] animate-fade-up flex-col border-l border-line-strong bg-surface">
            <header className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="text-[14px] font-medium text-ink">Filtres et couches</p>
              <button type="button" onClick={() => setPanelOpen(false)} aria-label="Fermer" className="rounded-control p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink">
                <X size={16} />
              </button>
            </header>
            <div className="overflow-y-auto">{controls}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
