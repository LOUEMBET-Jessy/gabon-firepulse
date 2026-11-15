"use client";

import { CalendarBlank, Check, Database, MagnifyingGlass, MapPinArea, PencilSimpleLine } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, Field, Popover, SelectButton, cx, inputClass } from "@/components/ui";
import { useMetadata } from "@/lib/api";
import { fmtCoord, fmtDateShort, fmtDateTimeUtc, fmtInt, fmtPeriod, lastDayOfMonth, pad2 } from "@/lib/format";
import type { MetadataResponse, ZoneSpec } from "@/lib/types";
import { useFilters } from "@/state/filters";

export const DRAW_FLAG = "hotspot.draw";
export const DRAW_EVENT = "hotspot:draw";

/** Noms des localites choisies sur la carte (villages absents de la liste des villes servie par l'API). */
const placeNames = new Map<number, string>();
export function rememberPlace(id: number, name: string) {
  placeNames.set(id, name);
}

type GeoMeta = Pick<MetadataResponse, "provinces"> & Partial<Pick<MetadataResponse, "departments" | "towns" | "placeRadiusKm" | "countryName">>;

export function zoneLabel(zone: ZoneSpec, meta: GeoMeta | undefined): string {
  if (zone.kind === "country") return meta?.countryName ?? "Gabon";
  if (zone.kind === "province") return meta?.provinces.find((p) => p.index === zone.index)?.name ?? "Province";
  if (zone.kind === "department") return meta?.departments?.find((d) => d.index === zone.index)?.name ?? "Département";
  if (zone.kind === "place") {
    const name = meta?.towns?.find((t) => t.id === zone.id)?.name ?? placeNames.get(zone.id) ?? "Localité";
    return `${name} (${meta?.placeRadiusKm ?? 15} km)`;
  }
  const [w, s, e, n] = zone.bbox;
  return `Zone ${fmtCoord(w, 2)}° à ${fmtCoord(e, 2)}° E, ${fmtCoord(s, 2)}° à ${fmtCoord(n, 2)}° N`;
}

function OptionRow({ active, onClick, children, detail }: { active: boolean; onClick: () => void; children: React.ReactNode; detail?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "flex w-full items-center gap-2 rounded-[6px] px-2.5 py-1.5 text-left text-[13px] transition-colors",
        active ? "bg-surface-3 text-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail ? <span className="num shrink-0 text-[11.5px] text-ink-3">{detail}</span> : null}
      {active ? <Check size={14} weight="bold" className="shrink-0 text-accent" /> : null}
    </button>
  );
}

export function ZonePicker() {
  const { zone, setZone } = useFilters();
  const { data: meta } = useMetadata();
  const router = useRouter();
  const [coords, setCoords] = useState({ w: "", s: "", e: "", n: "" });
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(query.trim());
  const match = (name: string) => !q || norm(name).includes(q);

  const applyCoords = (close: () => void) => {
    const parse = (v: string) => Number(v.trim().replace(",", "."));
    const [w, s, e, n] = [coords.w, coords.s, coords.e, coords.n].map(parse);
    if ([coords.w, coords.s, coords.e, coords.n].some((v) => v.trim() === "") || [w, s, e, n].some((v) => !Number.isFinite(v))) {
      return setError("Saisissez quatre nombres en degrés décimaux.");
    }
    if (w >= e || s >= n) return setError("L'ouest doit être inférieur à l'est, et le sud au nord.");
    if (w < 7.5 || e > 15.5 || s < -5 || n > 3.5) return setError("Zone hors de l'emprise couverte : longitude 7,5 à 15,5, latitude −5 à 3,5.");
    setError(null);
    setZone({ kind: "bbox", bbox: [w, s, e, n] });
    close();
  };

  const startDrawing = (close: () => void) => {
    try {
      window.sessionStorage.setItem(DRAW_FLAG, "1");
    } catch {
      /* stockage indisponible : l'evenement suffit si la carte est deja affichee */
    }
    close();
    router.push("/map");
    window.dispatchEvent(new Event(DRAW_EVENT));
  };

  return (
    <Popover
      label="Choisir la zone d'analyse"
      width={340}
      trigger={({ open, toggle }) => (
        <SelectButton open={open} onClick={toggle} icon={<MapPinArea size={16} />} label="Zone d'analyse" tour="zone-picker">
          {zoneLabel(zone, meta)}
        </SelectButton>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">Rechercher une province, un département ou une localité</span>
            <MagnifyingGlass size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Province, département, ville…" className={cx(inputClass, "pl-8")} autoFocus />
          </label>
          <div>
            <p className="px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">Territoire</p>
            <OptionRow active={zone.kind === "country"} onClick={() => (setZone({ kind: "country" }), close())} detail={meta ? `${fmtInt(Math.round(meta.countryAreaKm2 / 1000) * 1000)} km²` : undefined}>
              {meta?.countryName ?? "Gabon"}, pays entier
            </OptionRow>
          </div>
          <div>
            <p className="px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">{meta ? meta.level1.many.replace(/^./, (c) => c.toUpperCase()) : "Provinces"}</p>
            <div className="grid max-h-[230px] grid-cols-1 overflow-y-auto">
              {meta
                ? meta.provinces.filter((p) => match(p.name)).map((p) => (
                    <OptionRow
                      key={p.index}
                      active={zone.kind === "province" && zone.index === p.index}
                      onClick={() => (setZone({ kind: "province", index: p.index }), close())}
                      detail={`${fmtInt(Math.round(p.areaKm2 / 100) * 100)} km²`}
                    >
                      {p.name}
                    </OptionRow>
                  ))
                : [0, 1, 2, 3].map((i) => <div key={i} className="skeleton mx-2.5 my-1 h-6" />)}
            </div>
          </div>
          {meta && q ? (
            <>
              <div>
                <p className="px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">Départements</p>
                <div className="grid max-h-[160px] grid-cols-1 overflow-y-auto">
                  {meta.departments.filter((d) => match(d.name)).slice(0, 20).map((d) => (
                    <OptionRow key={d.index} active={zone.kind === "department" && zone.index === d.index} onClick={() => (setZone({ kind: "department", index: d.index }), close())} detail={meta.provinces[d.province]?.name}>
                      {d.name}
                    </OptionRow>
                  ))}
                </div>
              </div>
              <div>
                <p className="px-2.5 pb-1 text-[11.5px] font-medium text-ink-3">Villes (rayon de {meta.placeRadiusKm} km)</p>
                <div className="grid max-h-[160px] grid-cols-1 overflow-y-auto">
                  {meta.towns.filter((t) => match(t.name)).slice(0, 20).map((t) => (
                    <OptionRow key={t.id} active={zone.kind === "place" && zone.id === t.id} onClick={() => (setZone({ kind: "place", id: t.id }), close())} detail={t.pop ? `${fmtInt(t.pop)} hab.` : undefined}>
                      {t.name}
                    </OptionRow>
                  ))}
                </div>
              </div>
            </>
          ) : null}
          <div className="border-t border-line pt-3">
            <p className="px-2.5 pb-2 text-[11.5px] font-medium text-ink-3">Zone personnalisée</p>
            <div className="px-2.5">
              <Button size="sm" className="w-full" onClick={() => startDrawing(close)}>
                <PencilSimpleLine size={15} />
                Dessiner un rectangle sur la carte
              </Button>
              <form
                className="mt-3 grid grid-cols-2 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  applyCoords(close);
                }}
              >
                {(
                  [
                    ["w", "Ouest (longitude)", "11,0"],
                    ["e", "Est (longitude)", "13,5"],
                    ["s", "Sud (latitude)", "-2,5"],
                    ["n", "Nord (latitude)", "-0,5"],
                  ] as const
                ).map(([key, label, placeholder]) => (
                  <Field key={key} label={label}>
                    {(id) => (
                      <input
                        id={id}
                        inputMode="decimal"
                        className={cx(inputClass, "num h-8")}
                        placeholder={placeholder}
                        value={coords[key]}
                        onChange={(e) => setCoords((c) => ({ ...c, [key]: e.target.value }))}
                      />
                    )}
                  </Field>
                ))}
                {error ? (
                  <p role="alert" className="col-span-2 text-[12px] text-critical">
                    {error}
                  </p>
                ) : null}
                <Button size="sm" type="submit" className="col-span-2">
                  Appliquer ces coordonnées
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </Popover>
  );
}

export function PeriodPicker() {
  const { from, to, setPeriod, coverage } = useFilters();
  const firstYear = Number(coverage.first.slice(0, 4));
  const lastYear = Number(coverage.last.slice(0, 4));
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => lastYear - i);
  const [year, setYear] = useState(Number(to.slice(0, 4)));
  const [draft, setDraft] = useState({ from, to });
  const [error, setError] = useState<string | null>(null);

  const apply = (a: string, b: string, close: () => void) => {
    setError(null);
    setPeriod(a, b);
    setDraft({ from: a < coverage.first ? coverage.first : a, to: b > coverage.last ? coverage.last : b });
    close();
  };

  const applyDraft = (close: () => void) => {
    if (!draft.from || !draft.to) return setError("Indiquez une date de début et une date de fin.");
    if (draft.from > draft.to) return setError("La date de début doit précéder la date de fin.");
    if (draft.to < coverage.first || draft.from > coverage.last) {
      return setError(`Aucune donnée hors de la couverture, du ${fmtDateShort(coverage.first)} au ${fmtDateShort(coverage.last)}.`);
    }
    apply(draft.from, draft.to, close);
  };

  const presets: { label: string; range: [string, string] }[] = [
    { label: `Année ${year}`, range: [`${year}-01-01`, `${year}-12-31`] },
    { label: `Saison sèche ${year} (juin à sept.)`, range: [`${year}-06-01`, `${year}-09-30`] },
    { label: `Petite saison sèche ${year} (janv. à mars)`, range: [`${year}-01-01`, `${year}-03-${pad2(lastDayOfMonth(year, 3))}`] },
    { label: "Tout l'historique", range: [coverage.first, coverage.last] },
  ];

  return (
    <Popover
      label="Choisir la période"
      width={330}
      trigger={({ open, toggle }) => (
        <SelectButton open={open} onClick={toggle} icon={<CalendarBlank size={16} />} label="Période" tour="period-picker">
          {fmtPeriod(from, to)}
        </SelectButton>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-3">
          <Field label="Année de référence des raccourcis">
            {(id) => (
              <select id={id} className={cx(inputClass, "num h-8")} value={year} onChange={(e) => setYear(Number(e.target.value))}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <div className="flex flex-col">
            {presets.map((preset) => (
              <OptionRow
                key={preset.label}
                active={from === (preset.range[0] < coverage.first ? coverage.first : preset.range[0]) && to === preset.range[1]}
                onClick={() => apply(preset.range[0], preset.range[1], close)}
              >
                {preset.label}
              </OptionRow>
            ))}
          </div>
          <form
            className="grid grid-cols-2 gap-2 border-t border-line pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              applyDraft(close);
            }}
          >
            <Field label="Début">
              {(id) => (
                <input id={id} type="date" className={cx(inputClass, "num h-8")} min={coverage.first} max={coverage.last} value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
              )}
            </Field>
            <Field label="Fin">
              {(id) => (
                <input id={id} type="date" className={cx(inputClass, "num h-8")} min={coverage.first} max={coverage.last} value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} />
              )}
            </Field>
            {error ? (
              <p role="alert" className="col-span-2 text-[12px] text-critical">
                {error}
              </p>
            ) : (
              <p className="col-span-2 text-[12px] text-ink-3">
                Données disponibles du {fmtDateShort(coverage.first)} au {fmtDateShort(coverage.last)}.
              </p>
            )}
            <Button size="sm" type="submit" className="col-span-2">
              Appliquer ces dates
            </Button>
          </form>
        </div>
      )}
    </Popover>
  );
}

/** Nature des donnees chargees : reelles ou simulees, et date de l'archive. Toujours visible. */
export function DataBadge() {
  const { data: meta, error } = useMetadata();
  const simulated = meta?.dataKind === "simulated";
  return (
    <Popover
      label="Nature et fraîcheur des données"
      align="end"
      width={340}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          data-tour="data-badge"
          className={cx(
            "flex h-9 items-center gap-2 rounded-control border px-2.5 text-[12.5px] font-medium transition-colors",
            error ? "border-critical/50 text-critical" : simulated ? "border-warning/50 bg-warning/10 text-warning" : "border-line-strong bg-surface-2 text-ink-2 hover:border-ink-3",
          )}
        >
          <Database size={15} className={error ? "" : simulated ? "" : "text-good"} />
          <span className="hidden sm:inline">{error ? "Données indisponibles" : !meta ? "Chargement" : simulated ? "Données simulées" : "Données NASA réelles"}</span>
          <span className="sm:hidden">{error ? "Erreur" : simulated ? "Simulé" : "Réel"}</span>
        </button>
      )}
    >
      {() =>
        meta ? (
          <div className="flex flex-col gap-2.5 p-1 text-[13px] leading-relaxed text-ink-2">
            <p className="font-medium text-ink">{simulated ? "Jeu de données simulé" : "Archive NASA FIRMS réelle, figée"}</p>
            <p>
              {fmtInt(meta.rows.kept)} détections lues dans {meta.sources.length} fichiers annuels FIRMS pour {meta.countryName === "Gabon" ? "le Gabon" : "la France métropolitaine"}, du {fmtDateShort(meta.coverage.firstDate)} au{" "}
              {fmtDateShort(meta.coverage.lastDate)}.
            </p>
            <p>
              Fichiers téléchargés le {fmtDateTimeUtc(meta.accessed.last)}. L'application lit cette copie locale : elle fonctionne sans connexion et{" "}
              <span className="text-ink">n'affiche pas de temps réel</span>.
            </p>
            <p className="text-ink-3">L'année 2026 n'est pas publiée dans l'archive par pays à la date de téléchargement.</p>
          </div>
        ) : (
          <p className="p-1 text-[13px] text-ink-2">{error ? error.message : "Lecture des métadonnées."}</p>
        )
      }
    </Popover>
  );
}

/** Pays de l'archive : Gabon ou France metropolitaine. Changer de pays ramene la zone au pays entier. */
export function CountrySwitch() {
  const { country, setCountry } = useFilters();
  const options = [
    { value: "GAB", label: "Gabon", short: "GA" },
    { value: "FRA", label: "France", short: "FR" },
  ] as const;
  return (
    <div role="radiogroup" aria-label="Pays analysé" data-tour="country-switch" className="flex h-9 shrink-0 items-center rounded-control border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = country === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            onClick={() => setCountry(o.value)}
            className={cx("h-full rounded-[7px] px-2 text-[12.5px] font-medium transition-colors sm:px-2.5", active ? "bg-surface-3 text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "text-ink-3 hover:text-ink")}
          >
            <span className="sm:hidden">{o.short}</span>
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
