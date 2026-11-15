"use client";

import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import Link from "next/link";

import { ReliabilityBadge, SensorMark, Skeleton, StatusBadge, cx } from "@/components/ui";
import { fmt1, fmtDelta, fmtInt, fmtPct, fmtScore, MONTHS_SHORT, monthLabel } from "@/lib/format";
import { KIND_LABEL, SATELLITES } from "@/lib/labels";
import type { AnomalyAssessment } from "@/lib/science/anomaly";
import type { DistributionSummary, MonthRecord, PerSatellite, RegionRecord, SatelliteKey } from "@/lib/types";
import { SATELLITE_KEYS } from "@/lib/types";

export const FireMap = dynamic(() => import("@/components/map/fire-map"), {
  ssr: false,
  loading: () => <div className="skeleton size-full rounded-none" role="status" aria-label="Chargement de la carte" />,
});

/** Lien vers un autre ecran, en pied de panneau. */
export function MoreLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:text-accent-strong">
      {children}
      <ArrowRight size={14} weight="bold" className="transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Activite par province : barres horizontales, densite et statut saisonnier. */
export function RegionBars({ regions, onSelect, activeIndex }: { regions: RegionRecord[]; onSelect?: (index: number) => void; activeIndex?: number | null }) {
  const reduce = useReducedMotion();
  const sorted = [...regions].sort((a, b) => b.harmonized - a.harmonized);
  const max = Math.max(...sorted.map((r) => r.harmonized), 1);
  return (
    <ul className="flex flex-col px-5 py-3">
      {sorted.map((r, i) => {
        const active = activeIndex === r.index;
        const row = (
          <>
            <span className={cx("w-[128px] shrink-0 truncate text-left text-[13px]", active ? "font-medium text-accent-strong" : "text-ink")}>{r.name}</span>
            <span className="relative h-4 min-w-0 flex-1">
              <motion.span
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max((r.harmonized / max) * 100, r.harmonized > 0 ? 0.8 : 0)}%` }}
                transition={{ duration: 0.7, delay: 0.1 + i * 0.04, ease: [0.16, 1, 0.3, 1] }}
                className={cx("absolute inset-y-[3px] left-0 rounded-r-[3px] transition-colors", active ? "bg-heat-6" : "bg-heat-5 group-hover:bg-heat-6")}
              />
            </span>
            <span className="num w-[52px] shrink-0 text-right text-[12.5px] text-ink">{fmtInt(r.harmonized)}</span>
            <span className="num hidden w-[46px] shrink-0 text-right text-[12px] text-ink-3 sm:block">{fmtPct(r.share)}</span>
            <span className="num hidden w-[54px] shrink-0 text-right text-[12px] text-ink-3 md:block" title="Cellules-jour pour 1 000 km²">
              {fmt1(r.density)}
            </span>
            <span className="hidden w-[118px] shrink-0 justify-end lg:flex">{r.window ? <StatusBadge status={r.window.status} /> : null}</span>
          </>
        );
        return (
          <li key={r.index}>
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(r.index)}
                aria-pressed={active}
                className={cx("group flex w-full items-center gap-3 rounded-[8px] px-1.5 py-1.5 transition-colors hover:bg-surface-2", active && "bg-surface-2 shadow-[inset_0_0_0_1px_var(--color-line-strong)]")}
              >
                {row}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-1.5 py-1.5">{row}</div>
            )}
          </li>
        );
      })}
      <li className="mt-1 flex items-center gap-3 border-t border-line px-1.5 pt-2 text-[11px] text-ink-3">
        <span className="w-[128px] shrink-0">Province</span>
        <span className="flex-1">Indice harmonisé sur la période</span>
        <span className="w-[52px] shrink-0 text-right">Valeur</span>
        <span className="hidden w-[46px] shrink-0 text-right sm:block">Part</span>
        <span className="hidden w-[54px] shrink-0 text-right md:block">Densité</span>
        <span className="hidden w-[118px] shrink-0 text-right lg:block">Par rapport à la saison</span>
      </li>
    </ul>
  );
}

/** Detections natives par satellite. Les nombres ne s'additionnent pas : les capteurs voient les memes feux. */
export function SatelliteCounts({ detections, eligible }: { detections: PerSatellite; eligible?: PerSatellite }) {
  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-3">
      {SATELLITE_KEYS.map((key) => {
        const s = SATELLITES[key];
        return (
          <li key={key} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
              <SensorMark color={s.color} shape={s.shape} size={9} />
              <span className="truncate">
                {s.sensor} {s.name}
              </span>
            </p>
            <p className="num mt-0.5 text-[18px] font-medium leading-tight text-ink">{fmtInt(detections[key])}</p>
            {eligible ? <p className="num text-[11.5px] text-ink-3">dont {fmtInt(eligible[key])} retenues</p> : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Detail du calcul d'un ecart : valeur, reference, score, rang, fiabilite, reserves. */
export function AssessmentDetail({ a, unit = "cellules-jour", referenceLabel }: { a: AnomalyAssessment; unit?: string; referenceLabel: string }) {
  const rows: [string, React.ReactNode][] = [
    ["Valeur observée", `${fmtInt(a.value)} ${unit}`],
    ["Médiane de référence", a.median === null ? "n. d." : `${fmtInt(a.median)} ${unit}`],
    ["Écart à la médiane", a.median ? fmtDelta(a.value, a.median) : "n. d."],
    ["Plage habituelle (1er au 3e quartile)", a.q25 === null || a.q75 === null ? "n. d." : `${fmtInt(a.q25)} à ${fmtInt(a.q75)}`],
    ["Minimum et maximum de référence", a.referenceMin === null || a.referenceMax === null ? "n. d." : `${fmtInt(a.referenceMin)} à ${fmtInt(a.referenceMax)}`],
    ["Score robuste (médiane et MAD)", a.robustZ === null ? "non calculable" : fmtScore(a.robustZ)],
    ["Score classique (moyenne et écart-type)", a.classicZ === null ? "non calculable" : fmtScore(a.classicZ)],
    ["Rang parmi les années de référence", a.percentile === null ? "n. d." : `${fmtInt(a.percentile)}e centile`],
    ["Années de référence", `${a.referenceCount} (${referenceLabel})`],
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={a.status} long />
        <ReliabilityBadge reliability={a.reliability} />
      </div>
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 text-[13px]">
            <dt className="text-ink-3">{label}</dt>
            <dd className="num shrink-0 text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {a.caveats.length ? (
        <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-ink-2">
          {a.caveats.map((c) => (
            <li key={c} className="flex gap-2">
              <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-full bg-ink-3" />
              {c}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Liste compacte de mois signales. */
export function FlaggedMonths({ months, onSelect, empty }: { months: MonthRecord[]; onSelect?: (m: MonthRecord) => void; empty: string }) {
  if (months.length === 0) return <p className="px-5 py-6 text-[13px] text-ink-3">{empty}</p>;
  return (
    <ul className="flex flex-col px-3 py-2">
      {months.map((m) => {
        const body = (
          <>
            <span className="w-[92px] shrink-0 text-left text-[13px] capitalize text-ink">
              {MONTHS_SHORT[m.month - 1]} {m.year}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <StatusBadge status={m.assessment.status} />
            </span>
            <span className="num shrink-0 text-right text-[12.5px] text-ink-2">
              {fmtInt(m.harmonized)} <span className="text-ink-3">pour {fmtInt(m.assessment.median)}</span>
            </span>
            <span className="num hidden w-[52px] shrink-0 text-right text-[12.5px] text-ink sm:block">{m.assessment.median ? fmtDelta(m.harmonized, m.assessment.median) : ""}</span>
            {onSelect ? <ArrowRight size={13} weight="bold" className="-ml-1 shrink-0 text-ink-3 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" /> : null}
          </>
        );
        return (
          <li key={`${m.year}-${m.month}`}>
            {onSelect ? (
              <button type="button" onClick={() => onSelect(m)} className="group flex w-full items-center gap-3 rounded-[8px] px-2 py-2 transition-colors hover:bg-surface-2" aria-label={`Ouvrir ${monthLabel(m.month, m.year)}`}>
                {body}
              </button>
            ) : (
              <div className="flex items-center gap-3 px-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Distribution de la puissance radiative (FRP) par satellite : mediane et quantiles, echelle commune. */
export function FrpDistribution({ frp }: { frp: PerSatellite<DistributionSummary> }) {
  const keys = SATELLITE_KEYS.filter((k) => frp[k].n > 0);
  if (keys.length === 0) return <p className="px-5 py-6 text-[13px] text-ink-3">Aucune détection retenue sur la période : pas de distribution à afficher.</p>;
  const max = Math.max(...keys.map((k) => frp[k].q90 ?? 0), 1);
  const pos = (v: number | null) => `${Math.min(((v ?? 0) / max) * 100, 100)}%`;
  return (
    <div className="px-5 py-3">
      <ul className="flex flex-col gap-3">
        {keys.map((k: SatelliteKey) => {
          const d = frp[k];
          const s = SATELLITES[k];
          return (
            <li key={k} className="grid grid-cols-[112px_minmax(0,1fr)_64px] items-center gap-3">
              <span className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
                <SensorMark color={s.color} shape={s.shape} size={9} />
                {s.name}
              </span>
              <span className="relative h-5" title={`10 % : ${fmt1(d.q10)} · 25 % : ${fmt1(d.q25)} · médiane : ${fmt1(d.median)} · 75 % : ${fmt1(d.q75)} · 90 % : ${fmt1(d.q90)} MW`}>
                <span className="absolute top-1/2 h-px -translate-y-1/2 bg-ink-3" style={{ left: pos(d.q10), right: `calc(100% - ${pos(d.q90)})` }} />
                <span className="absolute inset-y-[3px] rounded-[2px]" style={{ left: pos(d.q25), right: `calc(100% - ${pos(d.q75)})`, backgroundColor: s.color, opacity: 0.55 }} />
                <span className="absolute inset-y-0 w-[2px] bg-ink" style={{ left: pos(d.median) }} />
              </span>
              <span className="num text-right text-[12.5px] text-ink">{fmt1(d.median)} MW</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 grid grid-cols-[112px_minmax(0,1fr)_64px] gap-3 text-[11px] text-ink-3">
        <span />
        <span className="num flex justify-between">
          <span>0</span>
          <span>{fmt1(max / 2)}</span>
          <span>{fmt1(max)} MW</span>
        </span>
        <span className="text-right">médiane</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">Trait : du 10e au 90e centile. Rectangle : 1er au 3e quartile. Barre claire : médiane. Détections retenues uniquement.</p>
    </div>
  );
}

export function KindNote({ month }: { month: MonthRecord }) {
  return (
    <p className="text-[12.5px] leading-relaxed text-ink-3">
      <span className="text-ink-2">{KIND_LABEL[month.kind].label}.</span> {KIND_LABEL[month.kind].detail}
    </p>
  );
}

/**
 * Ou se place la valeur dans son historique : etendue des annees de reference (trait), plage habituelle
 * du 1er au 3e quartile (bande), mediane (repere) et valeur de la periode (pastille).
 * La pastille glisse depuis la mediane jusqu'a sa position : le mouvement montre l'ecart.
 */
export function ReferenceGauge({ a, unit = "cellules-jour" }: { a: AnomalyAssessment; unit?: string }) {
  const reduce = useReducedMotion();
  if (a.median === null || a.q25 === null || a.q75 === null || a.referenceMin === null || a.referenceMax === null) return null;
  const lo = Math.min(a.referenceMin, a.value);
  const hi = Math.max(a.referenceMax, a.value);
  const span = hi - lo || 1;
  const pct = (v: number) => ((v - lo) / span) * 100;
  const above = a.value > a.q75;
  const below = a.value < a.q25;
  const color = above ? (a.status === "strong_high" ? "var(--color-critical)" : "var(--color-warning)") : below ? "var(--color-div-n2)" : "var(--color-ink)";
  return (
    <figure className="flex flex-col gap-2" aria-label={`Valeur ${fmtInt(a.value)} ${unit} ; plage habituelle ${fmtInt(a.q25)} à ${fmtInt(a.q75)} ; médiane ${fmtInt(a.median)}`}>
      <div className="relative h-7">
        {/* Etendue min-max des annees de reference */}
        <span className="absolute top-1/2 h-px -translate-y-1/2 bg-line-strong" style={{ left: `${pct(a.referenceMin)}%`, right: `${100 - pct(a.referenceMax)}%` }} />
        <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-ink-3" style={{ left: `${pct(a.referenceMin)}%` }} />
        <span className="absolute top-1/2 h-2.5 w-px -translate-y-1/2 bg-ink-3" style={{ left: `${pct(a.referenceMax)}%` }} />
        {/* Plage habituelle */}
        <span className="absolute inset-y-[7px] rounded-[4px] bg-surface-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)]" style={{ left: `${pct(a.q25)}%`, right: `${100 - pct(a.q75)}%` }} />
        {/* Mediane */}
        <span className="absolute inset-y-[4px] w-[2px] -translate-x-1/2 rounded-full bg-ink-2" style={{ left: `${pct(a.median)}%` }} />
        {/* Valeur */}
        <motion.span
          initial={reduce ? false : { left: `${pct(a.median)}%`, opacity: 0 }}
          animate={{ left: `${pct(a.value)}%`, opacity: 1 }}
          transition={{ type: "spring", stiffness: 90, damping: 18, delay: 0.25 }}
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface"
          style={{ backgroundColor: color, boxShadow: `0 0 0 1px ${color}` }}
        />
      </div>
      <figcaption className="num flex justify-between text-[11px] text-ink-3">
        <span>{fmtInt(lo)}</span>
        <span className="flex items-center gap-3 font-sans">
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-3 rounded-[2px] bg-surface-3 shadow-[inset_0_0_0_1px_var(--color-line-strong)]" />
            plage habituelle
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="h-2.5 w-[2px] rounded-full bg-ink-2" />
            médiane
          </span>
        </span>
        <span>{fmtInt(hi)}</span>
      </figcaption>
    </figure>
  );
}

export function StatSkeleton() {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label="Chargement">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-40" />
    </div>
  );
}
