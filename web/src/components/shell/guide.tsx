"use client";

import { ArrowRight, CalendarDots, Compass, FileText, MapPinArea, MapTrifold, Scales, WarningDiamond, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useSyncExternalStore } from "react";

import { Popover, cx } from "@/components/ui";

/**
 * Parcours principal du cahier des charges (4.1) et scenario de demonstration (12.2),
 * presentes comme des etapes cliquables.
 */
export const STEPS = [
  {
    icon: MapPinArea,
    title: "Choisir la zone et la période",
    text: "Le pays, une province ou un rectangle dessiné ; une année, une saison ou des dates libres. Les sélecteurs en haut de page s'appliquent à tous les écrans.",
    href: null,
    cta: "Sélecteurs en haut de page",
  },
  {
    icon: MapTrifold,
    title: "Lire la carte",
    text: "Points natifs par satellite (carré MODIS, disque VIIRS) ou grille harmonisée. Un clic ouvre la fiche de la détection et sa source.",
    href: "/map",
    cta: "Ouvrir la carte",
  },
  {
    icon: CalendarDots,
    title: "Comparer dans le temps",
    text: "Le calendrier place chaque mois depuis 2000 sur une même unité. Passez du mois à la semaine ou au jour.",
    href: "/calendar",
    cta: "Ouvrir le calendrier",
  },
  {
    icon: WarningDiamond,
    title: "Examiner une période inhabituelle",
    text: "Chaque signalement expose sa référence, son score et sa fiabilité, ou indique que les données sont insuffisantes.",
    href: "/anomalies",
    cta: "Voir les périodes",
  },
  {
    icon: Scales,
    title: "Comparer deux zones",
    text: "Deux provinces, ou une province et le pays, côte à côte, ramenées à la même surface.",
    href: "/compare",
    cta: "Comparer",
  },
  {
    icon: FileText,
    title: "Partager le résultat",
    text: "Rapport PDF imprimable, détections en CSV ou GeoJSON, séries mensuelles et anomalies.",
    href: "/reports",
    cta: "Rapports et exports",
  },
] as const;

const HIDDEN_KEY = "firepulse.guide.hidden";
const EVENT = "firepulse:guide";

function subscribe(notify: () => void) {
  window.addEventListener(EVENT, notify);
  return () => window.removeEventListener(EVENT, notify);
}
function readHidden() {
  try {
    return window.localStorage.getItem(HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}
function setHidden(hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(HIDDEN_KEY, "1");
    else window.localStorage.removeItem(HIDDEN_KEY);
  } catch {
    /* stockage indisponible */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Bandeau "Par où commencer" du tableau de bord. Masquable, reouvrable depuis le bouton Guide. */
export function GuideCard() {
  // Cote serveur : masque, pour ne pas faire clignoter le bandeau chez ceux qui l'ont ferme.
  const hidden = useSyncExternalStore(subscribe, readHidden, () => true);
  if (hidden) return null;
  return (
    <section aria-label="Par où commencer" className="no-print relative overflow-hidden rounded-panel border border-accent/30 bg-[linear-gradient(120deg,color-mix(in_srgb,var(--color-accent)_9%,var(--color-surface)),var(--color-surface)_60%)]">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div>
          <p className="flex items-center gap-2 text-[15px] font-medium text-ink">
            <Compass size={18} weight="duotone" className="text-accent" />
            Par où commencer
          </p>
          <p className="mt-1 text-[13px] text-ink-3">
            Le parcours d&apos;analyse en six étapes. Première visite ?{" "}
            <Link href="/understand" className="font-medium text-accent hover:underline">
              Comprendre les données en deux minutes
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Masquer le guide"
          title="Masquer le guide (réouvrable avec le bouton Guide)"
          className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
        >
          <X size={16} />
        </button>
      </div>
      <ol className="grid grid-cols-1 gap-2.5 px-5 pb-5 pt-4 sm:grid-cols-2 xl:grid-cols-3">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const body = (
            <>
              <span className="flex items-center gap-2.5">
                <span className="num flex size-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11.5px] font-semibold text-accent">{i + 1}</span>
                <Icon size={17} className="shrink-0 text-ink-3" />
                <span className="text-[13.5px] font-medium text-ink">{step.title}</span>
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-3">{step.text}</span>
              <span className={cx("mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium", step.href ? "text-accent" : "text-ink-3")}>
                {step.cta}
                {step.href ? <ArrowRight size={13} weight="bold" className="transition-transform group-hover:translate-x-0.5" /> : null}
              </span>
            </>
          );
          return (
            <li key={step.title}>
              {step.href ? (
                <Link href={step.href} className="group block h-full rounded-control border border-line bg-surface/70 p-3.5 transition-colors hover:border-accent/50 hover:bg-surface">
                  {body}
                </Link>
              ) : (
                <div className="h-full rounded-control border border-dashed border-line-strong p-3.5">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Bouton "Guide" de la barre de contexte : parcours compact, toujours accessible. */
export function GuideButton() {
  return (
    <Popover
      label="Guide d'utilisation"
      align="end"
      width={360}
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cx(
            "flex h-9 items-center gap-1.5 rounded-control border bg-surface-2 px-2.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:text-ink",
            open ? "border-accent" : "border-line-strong hover:border-ink-3",
          )}
        >
          <Compass size={16} />
          <span className="hidden sm:inline">Guide</span>
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-1 p-0.5">
          <p className="px-2 pb-1 text-[13px] font-medium text-ink">Parcours d'analyse</p>
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const row = (
              <span className="flex items-start gap-2.5">
                <span className="num mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[10.5px] font-semibold text-accent">{i + 1}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink">
                    <Icon size={14} className="text-ink-3" />
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-3">{step.text}</span>
                </span>
              </span>
            );
            return step.href ? (
              <Link key={step.title} href={step.href} onClick={close} className="rounded-[6px] px-2 py-2 transition-colors hover:bg-surface-3">
                {row}
              </Link>
            ) : (
              <div key={step.title} className="px-2 py-2">
                {row}
              </div>
            );
          })}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-line px-2 pt-2.5">
            <Link href="/understand" onClick={close} className="text-[12.5px] font-medium text-accent">
              Comprendre les données
            </Link>
            <button
              type="button"
              onClick={() => {
                setHidden(false);
                close();
              }}
              className="text-[12.5px] text-ink-3 hover:text-ink"
            >
              Réafficher le guide du tableau de bord
            </button>
          </div>
        </div>
      )}
    </Popover>
  );
}
