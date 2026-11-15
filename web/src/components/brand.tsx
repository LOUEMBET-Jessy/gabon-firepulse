/**
 * Identite Hot-Spots : symbole et logotype.
 * Le symbole reprend ce que fait le produit : une orbite de satellite (cyan) qui croise
 * un point de detection (orange) pose sur une cellule de grille. Composant serveur, sans etat.
 */

import { cx } from "@/lib/classes";

export const BRAND = {
  name: "Hot-Spots",
  signature: "Observer. Comprendre. Préserver.",
  assistant: "Hot-Spots AI",
} as const;

export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className={className}>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="var(--color-forest)" />
      {/* Cellule de grille */}
      <rect x="11" y="11" width="10" height="10" rx="2" fill="var(--color-fire-3)" fillOpacity="0.2" stroke="var(--color-fire-3)" strokeOpacity="0.6" />
      {/* Orbite */}
      <ellipse cx="16" cy="16" rx="12.5" ry="5.2" transform="rotate(-28 16 16)" fill="none" stroke="var(--color-leaf)" strokeWidth="1.6" />
      {/* Point detecte */}
      <circle cx="16" cy="16" r="3.1" fill="var(--color-fire-3)" />
      {/* Satellite */}
      <circle cx="26.2" cy="10.6" r="1.9" fill="var(--color-forest-ink)" />
    </svg>
  );
}

/** Logotype : le trait d'union porte la couleur de la detection. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cx("font-semibold tracking-[-0.03em] text-ink", className)}>
      Hot<span className="text-ember">-</span>Spots
    </span>
  );
}

/** Symbole de l'assistant : le meme point, entoure d'un halo de dialogue. */
/**
 * Marque de l'assistant. `animated` fait tourner l'orbite (le satellite autour du point detecte) :
 * reserve aux moments ou l'assistant travaille, pour que le mouvement signifie quelque chose.
 */
export function AssistantMark({ size = 28, className, animated }: { size?: number; className?: string; animated?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden className={className}>
      <circle cx="14" cy="14" r="13.5" fill="var(--color-forest)" stroke="var(--color-leaf)" strokeOpacity="0.8" />
      <g className={animated ? "assistant-orbit" : undefined}>
        <circle cx="14" cy="14" r="8.5" fill="none" stroke="var(--color-forest-ink)" strokeOpacity="0.45" strokeDasharray="2.2 2.6" />
        <circle cx="21.4" cy="7.4" r="1.7" fill="var(--color-leaf)" />
      </g>
      <circle cx="14" cy="14" r="3.6" fill="var(--color-fire-3)" />
    </svg>
  );
}
