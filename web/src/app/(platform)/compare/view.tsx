"use client";

import { ArrowsLeftRight } from "@phosphor-icons/react/dist/ssr";
import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { TooltipCard, TooltipRow, useNarrow } from "@/components/charts";
import { zoneLabel } from "@/components/shell/pickers";
import {
  Button,
  ChartSkeleton,
  EmptyState,
  ErrorState,
  Notice,
  PageHeader,
  Panel,
  PanelHeader,
  ReliabilityBadge,
  Segmented,
  Skeleton,
  SourceNote,
  StatusBadge,
  cx,
  inputClass,
} from "@/components/ui";
import { useCalendar, useMetadata, useOverview, useRegions, zoneParam } from "@/lib/api";
import { fmt1, fmtArea, fmtDelta, fmtInt, fmtPct, fmtPeriod, MONTHS, MONTHS_LETTER, MONTHS_SHORT } from "@/lib/format";
import { DEFINITIONS, UNIT, UNIT_SHORT } from "@/lib/labels";
import type { CalendarResponse, MonthRecord, OverviewResponse, ZoneSpec } from "@/lib/types";
import { useFilters } from "@/state/filters";

type Measure = "density" | "raw";

const COLOR = { a: "var(--color-zone-a)", b: "var(--color-zone-b)" } as const;
const AXIS = { fill: "var(--color-ink-3)", fontSize: 11.5, fontFamily: "var(--font-mono)" } as const;
const FLAGGED = new Set(["strong_high", "high", "low"]);

function parseKey(key: string, current: ZoneSpec): ZoneSpec {
  if (key === "country") return { kind: "country" };
  if (key.startsWith("province:")) return { kind: "province", index: Number(key.slice(9)) };
  return current;
}

function inPeriod(m: MonthRecord, from: string, to: string) {
  const first = `${m.year}-${String(m.month).padStart(2, "0")}-01`;
  const last = `${m.year}-${String(m.month).padStart(2, "0")}-${new Date(Date.UTC(m.year, m.month, 0)).getUTCDate()}`;
  return last >= from && first <= to;
}

/** Marqueur de zone : couleur ET forme (disque plein pour A, carre creux pour B), jamais la couleur seule. */
function ZoneMark({ which, size = 10 }: { which: "a" | "b"; size?: number }) {
  return which === "a" ? (
    <span aria-hidden className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, backgroundColor: COLOR.a }} />
  ) : (
    <span aria-hidden className="inline-block shrink-0 rounded-[2px] border-2" style={{ width: size, height: size, borderColor: COLOR.b }} />
  );
}

function ZoneSelect({
  which,
  value,
  onChange,
  provinces,
  current,
  disabledKey,
}: {
  which: "a" | "b";
  value: string;
  onChange: (key: string) => void;
  provinces: { index: number; name: string }[] | undefined;
  current: ZoneSpec;
  disabledKey: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="flex items-center gap-2 text-[12px] font-medium text-ink-2">
        <ZoneMark which={which} />
        {which === "a" ? "Zone A (zone d'analyse partagée)" : "Zone B"}
      </span>
      <select className={cx(inputClass, "font-medium")} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="country" disabled={disabledKey === "country"}>
          Gabon, pays entier
        </option>
        {current.kind === "bbox" ? (
          <option value={zoneParam(current)} disabled={disabledKey === zoneParam(current)}>
            {zoneLabel(current, provinces)}
          </option>
        ) : null}
        <optgroup label="Provinces">
          {(provinces ?? []).map((p) => (
            <option key={p.index} value={`province:${p.index}`} disabled={disabledKey === `province:${p.index}`}>
              {p.name}
            </option>
          ))}
        </optgroup>
      </select>
    </label>
  );
}

function density(value: number, area: number | null) {
  return area ? (value / area) * 1000 : null;
}

/* ------------------------------------------------------------------ Tableau cote a cote */

function Row({ label, a, b, help }: { label: string; a: React.ReactNode; b: React.ReactNode; help?: string }) {
  return (
    <tr className="border-t border-line align-top">
      <th scope="row" className="py-2.5 pr-3 text-left text-[12.5px] font-normal text-ink-3">
        {label}
        {help ? <span className="mt-0.5 block text-[11.5px] text-ink-3/80">{help}</span> : null}
      </th>
      <td className="num py-2.5 pr-3 text-right text-[13px] text-ink">{a}</td>
      <td className="num py-2.5 text-right text-[13px] text-ink">{b}</td>
    </tr>
  );
}

function WindowCell({ o }: { o: OverviewResponse }) {
  if (!o.window) return <span className="text-[12px] text-ink-3">non évalué (période de plus d&apos;un an)</span>;
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <StatusBadge status={o.window.status} />
      {o.window.median !== null ? <span className="text-[11.5px] text-ink-3">{fmtDelta(o.harmonized, o.window.median)} vs médiane</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ Page */

export function CompareView() {
  const { zone, from, to, setZone } = useFilters();
  const meta = useMetadata();
  const regions = useRegions(from, to);
  const narrow = useNarrow();
  const [measure, setMeasure] = useState<Measure>("density");
  const [bChoice, setBChoice] = useState<string | null>(null);

  const aKey = zoneParam(zone);
  // Zone B par defaut : le pays si A est une province, sinon la province la plus active de la periode.
  const defaultB = useMemo(() => {
    if (zone.kind !== "country") return "country";
    const top = regions.data ? [...regions.data.regions].sort((x, y) => y.harmonized - x.harmonized)[0] : undefined;
    return `province:${top?.index ?? meta.data?.provinces[0]?.index ?? 0}`;
  }, [zone.kind, regions.data, meta.data]);
  const bKey = bChoice && bChoice !== aKey ? bChoice : defaultB;
  const zoneB = parseKey(bKey, zone);

  const ovA = useOverview(zone, from, to);
  const ovB = useOverview(zoneB, from, to);
  const calA = useCalendar(zone);
  const calB = useCalendar(zoneB);
  const provinces = meta.data?.provinces;
  const nameA = zoneLabel(zone, provinces);
  const nameB = zoneLabel(zoneB, provinces);

  const swap = () => {
    if (zone.kind === "bbox") return;
    const previousA = aKey;
    setZone(zoneB);
    setBChoice(previousA);
  };

  const a = ovA.data;
  const b = ovB.data;
  const areaA = a?.zone.areaKm2 ?? null;
  const areaB = b?.zone.areaKm2 ?? null;
  const dA = a ? density(a.harmonized, areaA) : null;
  const dB = b ? density(b.harmonized, areaB) : null;

  return (
    <>
      <PageHeader
        title="Comparer deux zones"
        lead={
          <>
            Deux territoires côte à côte sur la même période ({fmtPeriod(from, to).toLowerCase()}), avec la même méthode. Les surfaces diffèrent : la comparaison se lit en{" "}
            <span className="text-ink">densité</span>, en cellules-jour pour 1 000 km².
          </>
        }
      />

      <Panel className="no-print">
        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-end">
          <ZoneSelect which="a" value={aKey} onChange={(k) => setZone(parseKey(k, zone))} provinces={provinces} current={zone} disabledKey={bKey} />
          <Button variant="ghost" size="sm" onClick={swap} disabled={zone.kind === "bbox"} aria-label="Inverser les zones A et B" title="Inverser A et B" className="self-center md:mb-0.5">
            <ArrowsLeftRight size={16} />
          </Button>
          <ZoneSelect which="b" value={bKey} onChange={setBChoice} provinces={provinces} current={zone} disabledKey={aKey} />
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] font-medium text-ink-2">Mesure</span>
            <Segmented
              label="Mesure comparée"
              value={measure}
              onChange={setMeasure}
              options={[
                { value: "density", label: "Densité" },
                { value: "raw", label: "Valeur brute" },
              ]}
            />
          </div>
        </div>
      </Panel>

      {/* Verdict en une phrase */}
      <Headline a={a} b={b} dA={dA} dB={dB} nameA={nameA} nameB={nameB} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <PanelHeader title="Indicateurs côte à côte" subtitle={`${fmtPeriod(from, to)}. Mêmes règles de sélection et de calage pour les deux zones.`} />
          {ovA.error || ovB.error ? (
            <ErrorState error={ovA.error ?? ovB.error} onRetry={() => (ovA.mutate(), ovB.mutate())} compact />
          ) : a && b ? (
            <div className="overflow-x-auto px-5 pb-4 pt-2">
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="text-[12px] text-ink-2">
                    <th className="pb-2 text-left font-normal" />
                    <th className="pb-2 pr-3 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <ZoneMark which="a" size={9} />
                        {nameA}
                      </span>
                    </th>
                    <th className="pb-2 text-right font-medium">
                      <span className="inline-flex items-center gap-1.5">
                        <ZoneMark which="b" size={9} />
                        {nameB}
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <Row label="Superficie" a={fmtArea(areaA)} b={fmtArea(areaB)} />
                  <Row label="Indice harmonisé" help={UNIT_SHORT} a={fmtInt(a.harmonized)} b={fmtInt(b.harmonized)} />
                  <Row label="Densité" help="cellules-jour pour 1 000 km²" a={dA === null ? "n. d." : fmt1(dA)} b={dB === null ? "n. d." : fmt1(dB)} />
                  <Row label="Par rapport aux mêmes dates des autres années" a={<WindowCell o={a} />} b={<WindowCell o={b} />} />
                  <Row label="Cellules de 0,05° actives" a={fmtInt(a.activeCells)} b={fmtInt(b.activeCells)} />
                  <Row label="Détections natives MODIS" help="Terra + Aqua, pixels de 1 km" a={fmtInt(a.detections.terra + a.detections.aqua)} b={fmtInt(b.detections.terra + b.detections.aqua)} />
                  <Row label="Détections natives VIIRS" help="Suomi-NPP et NOAA-20, pixels de 375 m" a={fmtInt(a.detections.snpp + a.detections.noaa20)} b={fmtInt(b.detections.snpp + b.detections.noaa20)} />
                  <Row label="Part estimée depuis MODIS" a={fmtPct(a.estimatedShare)} b={fmtPct(b.estimatedShare)} />
                  <Row
                    label="Fiabilité de l'écart"
                    a={a.window ? <ReliabilityBadge reliability={a.window.reliability} /> : "—"}
                    b={b.window ? <ReliabilityBadge reliability={b.window.reliability} /> : "—"}
                  />
                </tbody>
              </table>
              <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
                Les détections MODIS et VIIRS sont affichées séparément : elles ne s&apos;additionnent pas, les deux capteurs voient en partie les mêmes feux.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 px-5 py-4">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-7" />
              ))}
            </div>
          )}
          <SourceNote provenance={a?.provenance} />
        </Panel>

        <MonthlyPanel calA={calA.data} calB={calB.data} error={calA.error ?? calB.error} from={from} to={to} measure={measure} nameA={nameA} nameB={nameB} narrow={narrow} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SeasonPanel calA={calA.data} calB={calB.data} error={calA.error ?? calB.error} measure={measure} nameA={nameA} nameB={nameB} narrow={narrow} />
        <AnomalyPanel calA={calA.data} calB={calB.data} error={calA.error ?? calB.error} from={from} to={to} nameA={nameA} nameB={nameB} />
      </div>

      <Notice title="Comment lire cette comparaison">
        La densité neutralise l&apos;écart de surface, pas les autres différences : couvert forestier, nuages, accès ou usages des terres varient d&apos;une zone à l&apos;autre. Le calage MODIS vers
        VIIRS est ajusté à chaque zone ; avant 2012, les valeurs sont des estimations. Une zone plus active n&apos;est pas une zone « plus brûlée » : l&apos;indice compte des jours de détection, pas des
        surfaces ni des incendies confirmés.
      </Notice>
    </>
  );
}

/* ------------------------------------------------------------------ Phrase de synthese */

function Headline({ a, b, dA, dB, nameA, nameB }: { a?: OverviewResponse; b?: OverviewResponse; dA: number | null; dB: number | null; nameA: string; nameB: string }) {
  if (!a || !b) return <Skeleton className="h-[74px] rounded-panel" />;
  let text: React.ReactNode;
  if (dA === null || dB === null) {
    text = "Surface inconnue pour l'une des zones : seule la valeur brute est comparable.";
  } else if (dA === 0 && dB === 0) {
    text = "Aucune activité détectée retenue dans les deux zones sur la période. Ce n'est pas une preuve d'absence de feu : nuages et heures de passage limitent l'observation.";
  } else if (dA === 0 || dB === 0) {
    text = (
      <>
        Activité retenue dans <span className="font-medium text-ink">{dA === 0 ? nameB : nameA}</span> seulement sur la période.
      </>
    );
  } else {
    const ratio = dA >= dB ? dA / dB : dB / dA;
    const top = dA >= dB ? nameA : nameB;
    const other = dA >= dB ? nameB : nameA;
    text =
      ratio < 1.1 ? (
        <>
          Densité d&apos;activité détectée comparable dans les deux zones (écart inférieur à 10 %).
        </>
      ) : (
        <>
          Par unité de surface, l&apos;activité détectée est <span className="num font-semibold text-ink">{fmt1(ratio)} fois</span> plus élevée dans{" "}
          <span className="font-medium text-ink">{top}</span> que dans <span className="font-medium text-ink">{other}</span>.
        </>
      );
  }
  const max = Math.max(dA ?? 0, dB ?? 0, 0.0001);
  return (
    <Panel className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
      <p className="max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{text}</p>
      <div className="flex w-full flex-col gap-2 lg:max-w-[420px]" aria-hidden>
        {(
          [
            ["a", nameA, dA],
            ["b", nameB, dB],
          ] as const
        ).map(([w, name, d]) => (
          <div key={w} className="flex items-center gap-3">
            <span className="flex w-32 shrink-0 items-center gap-1.5 truncate text-[12px] text-ink-2">
              <ZoneMark which={w} size={9} />
              <span className="truncate">{name}</span>
            </span>
            <span className="relative h-3 flex-1 overflow-hidden rounded-full bg-surface-3">
              <span
                className={cx("absolute inset-y-0 left-0 rounded-full transition-[width] duration-500", w === "b" && "hatch")}
                style={{ width: `${((d ?? 0) / max) * 100}%`, backgroundColor: COLOR[w] }}
              />
            </span>
            <span className="num w-14 text-right text-[12px] text-ink">{d === null ? "n. d." : fmt1(d)}</span>
          </div>
        ))}
        <span className="text-right text-[11px] text-ink-3">cellules-jour pour 1 000 km²</span>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Series */

function lineLegend(nameA: string, nameB: string) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-5 pt-3 text-[12px] text-ink-2">
      <span className="flex items-center gap-1.5">
        <svg width="20" height="10" aria-hidden>
          <line x1="0" y1="5" x2="20" y2="5" stroke={COLOR.a} strokeWidth="2" />
          <circle cx="10" cy="5" r="3" fill={COLOR.a} />
        </svg>
        {nameA}
      </span>
      <span className="flex items-center gap-1.5">
        <svg width="20" height="10" aria-hidden>
          <line x1="0" y1="5" x2="20" y2="5" stroke={COLOR.b} strokeWidth="2" strokeDasharray="4 3" />
          <rect x="7" y="2" width="6" height="6" fill="var(--color-surface)" stroke={COLOR.b} strokeWidth="1.6" />
        </svg>
        {nameB}
      </span>
    </div>
  );
}

const SquareDot = (props: { cx?: number; cy?: number; value?: number | null }) => {
  const { cx: x, cy: y, value } = props;
  if (x === undefined || y === undefined || value === null || value === undefined) return <g />;
  return <rect x={x - 3} y={y - 3} width={6} height={6} fill="var(--color-surface)" stroke={COLOR.b} strokeWidth={1.6} />;
};

function scale(value: number | null, area: number | null, measure: Measure) {
  if (value === null) return null;
  if (measure === "raw") return value;
  return area ? (value / area) * 1000 : null;
}

function MonthlyPanel({
  calA,
  calB,
  error,
  from,
  to,
  measure,
  nameA,
  nameB,
  narrow,
}: {
  calA?: CalendarResponse;
  calB?: CalendarResponse;
  error: unknown;
  from: string;
  to: string;
  measure: Measure;
  nameA: string;
  nameB: string;
  narrow: boolean;
}) {
  const data = useMemo(() => {
    if (!calA || !calB) return [];
    const byKey = new Map(calB.months.map((m) => [`${m.year}-${m.month}`, m]));
    return calA.months
      .filter((m) => inPeriod(m, from, to))
      .map((m) => {
        const mb = byKey.get(`${m.year}-${m.month}`);
        return {
          label: `${MONTHS_SHORT[m.month - 1]} ${m.year}`,
          title: `${MONTHS[m.month - 1]} ${m.year}`,
          a: scale(m.complete ? m.harmonized : null, calA.zone.areaKm2, measure),
          b: scale(mb && mb.complete ? mb.harmonized : null, calB.zone.areaKm2, measure),
        };
      });
  }, [calA, calB, from, to, measure]);
  const unit = measure === "density" ? "cellules-jour / 1 000 km²" : UNIT_SHORT;
  const showDots = data.length <= 36;
  return (
    <Panel>
      <PanelHeader title="Mois par mois sur la période" subtitle={`Indice harmonisé mensuel, ${measure === "density" ? "rapporté à la surface" : "valeur brute"}. Mois incomplets laissés vides.`} help={DEFINITIONS.index} />
      {error ? (
        <ErrorState error={error} compact />
      ) : !calA || !calB ? (
        <ChartSkeleton height={280} />
      ) : !data.length ? (
        <EmptyState title="Aucun mois dans la période" />
      ) : (
        <>
          {lineLegend(nameA, nameB)}
          <div className="px-2 pb-3 pt-2" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 2, left: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-line)" }} interval="preserveStartEnd" minTickGap={narrow ? 18 : 30} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (measure === "density" ? fmt1(v) : fmtInt(v))} />
                <Tooltip
                  cursor={{ stroke: "var(--color-line-strong)" }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    if (!active || !row) return null;
                    const f = (v: number | null) => (v === null ? "incomplet" : measure === "density" ? fmt1(v) : fmtInt(v));
                    return (
                      <TooltipCard title={row.title}>
                        <TooltipRow label={nameA} mark={<ZoneMark which="a" size={8} />} value={f(row.a)} />
                        <TooltipRow label={nameB} mark={<ZoneMark which="b" size={8} />} value={f(row.b)} />
                        <p className="mt-1 text-[11px] text-ink-3">{unit}</p>
                      </TooltipCard>
                    );
                  }}
                />
                <Line dataKey="a" stroke={COLOR.a} strokeWidth={2} dot={showDots ? { r: 3, fill: COLOR.a, stroke: "var(--color-surface)", strokeWidth: 1.5 } : false} isAnimationActive={false} connectNulls={false} />
                <Line dataKey="b" stroke={COLOR.b} strokeWidth={2} strokeDasharray="5 4" dot={showDots ? <SquareDot /> : false} isAnimationActive={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
      <SourceNote provenance={calA?.provenance} extra={`Unité : ${measure === "density" ? "cellules-jour actives pour 1 000 km²" : UNIT}.`} />
    </Panel>
  );
}

function SeasonPanel({
  calA,
  calB,
  error,
  measure,
  nameA,
  nameB,
  narrow,
}: {
  calA?: CalendarResponse;
  calB?: CalendarResponse;
  error: unknown;
  measure: Measure;
  nameA: string;
  nameB: string;
  narrow: boolean;
}) {
  const data = useMemo(() => {
    if (!calA || !calB) return [];
    return calA.baselines.map((ba, i) => {
      const bb = calB.baselines[i];
      return {
        label: narrow ? MONTHS_LETTER[i] : MONTHS_SHORT[i],
        title: MONTHS[i],
        a: scale(ba.median, calA.zone.areaKm2, measure),
        b: scale(bb?.median ?? null, calB.zone.areaKm2, measure),
      };
    });
  }, [calA, calB, measure, narrow]);
  const critical = (cal?: CalendarResponse) => (cal ? cal.criticalMonths.map((m) => MONTHS[m - 1]).join(", ") || "aucun" : "…");
  return (
    <Panel>
      <PanelHeader title="Saison habituelle" subtitle="Médiane de chaque mois calendaire sur toutes les années complètes. Les saisons coïncident-elles ?" />
      {error ? (
        <ErrorState error={error} compact />
      ) : !calA || !calB ? (
        <ChartSkeleton height={240} />
      ) : (
        <>
          {lineLegend(nameA, nameB)}
          <div className="px-2 pb-2 pt-2" style={{ height: 250 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 10, right: 16, bottom: 2, left: 0 }}>
                <CartesianGrid stroke="var(--color-line)" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: "var(--color-line)" }} interval={0} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => (measure === "density" ? fmt1(v) : fmtInt(v))} />
                <Tooltip
                  cursor={{ stroke: "var(--color-line-strong)" }}
                  isAnimationActive={false}
                  content={({ active, payload }) => {
                    const row = payload?.[0]?.payload as (typeof data)[number] | undefined;
                    if (!active || !row) return null;
                    const f = (v: number | null) => (v === null ? "données insuffisantes" : measure === "density" ? fmt1(v) : fmtInt(v));
                    return (
                      <TooltipCard title={`Médiane de ${row.title}`}>
                        <TooltipRow label={nameA} mark={<ZoneMark which="a" size={8} />} value={f(row.a)} />
                        <TooltipRow label={nameB} mark={<ZoneMark which="b" size={8} />} value={f(row.b)} />
                      </TooltipCard>
                    );
                  }}
                />
                <Line dataKey="a" stroke={COLOR.a} strokeWidth={2} dot={{ r: 3, fill: COLOR.a, stroke: "var(--color-surface)", strokeWidth: 1.5 }} isAnimationActive={false} />
                <Line dataKey="b" stroke={COLOR.b} strokeWidth={2} strokeDasharray="5 4" dot={<SquareDot />} isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <dl className="grid grid-cols-1 gap-2 border-t border-line px-5 py-3 text-[12.5px] sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-1.5 text-ink-3">
                <ZoneMark which="a" size={8} /> Mois critiques, {nameA}
              </dt>
              <dd className="mt-0.5 text-ink-2">{critical(calA)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-ink-3">
                <ZoneMark which="b" size={8} /> Mois critiques, {nameB}
              </dt>
              <dd className="mt-0.5 text-ink-2">{critical(calB)}</dd>
            </div>
          </dl>
        </>
      )}
      <SourceNote provenance={calA?.provenance} extra="Mois critiques : ceux qui concentrent 80 % de l'activité médiane annuelle de la zone. Description du passé, pas une prévision." />
    </Panel>
  );
}

function AnomalyPanel({
  calA,
  calB,
  error,
  from,
  to,
  nameA,
  nameB,
}: {
  calA?: CalendarResponse;
  calB?: CalendarResponse;
  error: unknown;
  from: string;
  to: string;
  nameA: string;
  nameB: string;
}) {
  const rows = useMemo(() => {
    if (!calA || !calB) return [];
    const byKey = new Map(calB.months.map((m) => [`${m.year}-${m.month}`, m]));
    return calA.months
      .filter((m) => inPeriod(m, from, to))
      .map((m) => ({ ma: m, mb: byKey.get(`${m.year}-${m.month}`) }))
      .filter(({ ma, mb }) => FLAGGED.has(ma.assessment.status) || (mb && FLAGGED.has(mb.assessment.status)))
      .reverse();
  }, [calA, calB, from, to]);
  const both = rows.filter(({ ma, mb }) => mb && FLAGGED.has(ma.assessment.status) && FLAGGED.has(mb.assessment.status)).length;
  return (
    <Panel>
      <PanelHeader
        title="Périodes inhabituelles"
        subtitle={rows.length ? `${rows.length} mois signalés dans au moins une zone, dont ${both} dans les deux.` : "Mois de la période qui s'écartent de leur référence saisonnière, zone par zone."}
        help={DEFINITIONS.anomaly}
      />
      {error ? (
        <ErrorState error={error} compact />
      ) : !calA || !calB ? (
        <ChartSkeleton height={200} />
      ) : rows.length ? (
        <div className="max-h-[330px] overflow-auto px-5 pb-3 pt-2">
          <table className="w-full min-w-[380px] text-[12.5px]">
            <thead className="sticky top-0 bg-surface text-[11.5px] text-ink-3">
              <tr>
                <th className="py-2 text-left font-normal">Mois</th>
                <th className="py-2 text-left font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <ZoneMark which="a" size={8} />
                    {nameA}
                  </span>
                </th>
                <th className="py-2 text-left font-normal">
                  <span className="inline-flex items-center gap-1.5">
                    <ZoneMark which="b" size={8} />
                    {nameB}
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ ma, mb }) => (
                <tr key={`${ma.year}-${ma.month}`} className="border-t border-line">
                  <td className="py-2 pr-2 capitalize text-ink">
                    {MONTHS[ma.month - 1]} {ma.year}
                  </td>
                  <td className="py-2 pr-2">
                    <StatusBadge status={ma.assessment.status} />
                  </td>
                  <td className="py-2">{mb ? <StatusBadge status={mb.assessment.status} /> : <span className="text-ink-3">n. d.</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Aucun mois inhabituel dans l'une ou l'autre zone">Sur cette période, chaque mois reste dans la plage habituelle de sa zone, ou ne dispose pas d&apos;une référence suffisante.</EmptyState>
      )}
      <SourceNote provenance={calA?.provenance} extra="Chaque zone est comparée à son propre historique : un même statut ne signifie pas une même intensité." />
    </Panel>
  );
}
