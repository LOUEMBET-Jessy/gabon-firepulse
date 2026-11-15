"use client";

import { Info } from "@phosphor-icons/react/dist/ssr";

import { useMetadata } from "@/lib/api";
import { fmtDateShort } from "@/lib/format";
import { useFilters } from "@/state/filters";

/**
 * Bandeau de lecture :
 * - la periode choisie contient des donnees NRT (provisoires, type de source deduit) ;
 * - ou l'archive du pays s'arrete avant aujourd'hui (annee en cours non encore publiee par la NASA).
 */
export function ProvisionalBanner() {
  const { to } = useFilters();
  const meta = useMetadata().data;
  if (!meta) return null;
  const recent = meta.recent;
  if (recent?.provisionalFrom && to >= recent.provisionalFrom) {
    return (
      <p className="mx-auto mb-5 flex w-full max-w-[1320px] items-start gap-2.5 rounded-control border border-warning/30 bg-warning/[0.06] px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <Info size={16} weight="fill" className="mt-0.5 shrink-0 text-warning" />
        <span>
          <span className="font-medium text-ink">Données provisoires depuis le {fmtDateShort(recent.provisionalFrom)}.</span> Ces jours viennent du flux NASA FIRMS en temps quasi réel (NRT) : la NASA peut les réviser, et le type de source (feu de végétation ou site industriel) y est déduit de l'archive, juste à {Math.round(recent.vegetationPrecision * 1000) / 10} % sur {recent.testYear}.
        </span>
      </p>
    );
  }
  const year = Number(meta.coverage.lastDate.slice(0, 4));
  if (!recent && to.slice(0, 4) >= String(year) && year < new Date().getUTCFullYear()) {
    return (
      <p className="mx-auto mb-5 flex w-full max-w-[1320px] items-start gap-2.5 rounded-control border border-line-strong bg-surface-2/60 px-4 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
        <Info size={16} weight="fill" className="mt-0.5 shrink-0 text-accent" />
        <span>
          Archive arrêtée au {fmtDateShort(meta.coverage.lastDate)} : la NASA publie l'archive annuelle après la fin de l'année. Pour analyser jusqu'à aujourd'hui, ajoutez une clé FIRMS et lancez <code className="num text-ink">pipeline/recent.py</code> (voir le README).
        </span>
      </p>
    );
  }
  return null;
}
