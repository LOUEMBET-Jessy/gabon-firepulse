"use client";

import {
  CalendarDots,
  ChartLineUp,
  CompassTool,
  DotsThreeOutline,
  FileText,
  Flask,
  Gauge,
  GitDiff,
  MapTrifold,
  WarningDiamond,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { AssistantPanel } from "@/components/assistant/panel";
import { AssistantSpotlight, GuidedTour } from "@/components/assistant/spotlight";
import { AssistantMark, BRAND, BrandMark, Wordmark } from "@/components/brand";
import { cx } from "@/components/ui";
import { setAssistant, useAssistant } from "@/state/assistant";
import { useFilters } from "@/state/filters";

import { CountrySwitch, DataBadge, PeriodPicker, ZonePicker } from "./pickers";
import { ProvisionalBanner } from "./provisional";

interface NavItem {
  href: string;
  label: string;
  short: string;
  hint: string;
  icon: typeof Gauge;
}

const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Explorer",
    items: [
      { href: "/dashboard", label: "Vue d'ensemble", short: "Synthèse", hint: "La période en un coup d'œil", icon: Gauge },
      { href: "/map", label: "Carte des détections", short: "Carte", hint: "Chaque détection, à sa position", icon: MapTrifold },
      { href: "/calendar", label: "Calendrier d'activité", short: "Calendrier", hint: "Depuis 2000, mois par mois", icon: CalendarDots },
    ],
  },
  {
    group: "Analyser",
    items: [
      { href: "/trends", label: "Analyses et tendances", short: "Tendances", hint: "L'évolution depuis 2000", icon: ChartLineUp },
      { href: "/compare", label: "Comparaison MODIS / VIIRS", short: "Capteurs", hint: "Pourquoi harmoniser", icon: GitDiff },
      { href: "/anomalies", label: "Périodes inhabituelles", short: "Inhabituel", hint: "Les mois hors norme", icon: WarningDiamond },
    ],
  },
  {
    group: "Comprendre",
    items: [
      { href: "/reports", label: "Rapports et exports", short: "Rapports", hint: "PDF et fichiers de données", icon: FileText },
      { href: "/methodology", label: "Méthode et données", short: "Méthode", hint: "Sources, calculs, limites", icon: Flask },
    ],
  },
];

const FLAT: NavItem[] = NAV.flatMap((g) => g.items);
/** Onglets de la barre basse sur telephone ; les autres ecrans sont dans « Plus ». */
const PRIMARY = ["/dashboard", "/map", "/calendar", "/trends"];

/** Pictogramme d'un ecran, repris dans son en-tete pour relier la navigation a la page. */
export function pageIcon(href: string, size = 20) {
  const item = FLAT.find((i) => i.href === href);
  if (!item) return null;
  const Icon = item.icon;
  return <Icon size={size} weight="duotone" />;
}

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-control" aria-label={`${BRAND.name}, accueil`}>
      <BrandMark size={32} />
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <Wordmark className="text-[17px]" />
          <span className="mt-1 text-[11px] text-ink-3">{BRAND.signature}</span>
        </span>
      )}
    </Link>
  );
}

/** Acces unique a l'assistant : toujours dans la barre du haut, sans bouton flottant qui masque les donnees. */
function AssistantButton() {
  const open = useAssistant((s) => s.open);
  const busy = useAssistant((s) => s.busy);
  const status = useAssistant((s) => s.status);
  return (
    <button
      type="button"
      data-tour="assistant-launcher"
      onClick={() => setAssistant({ open: !open })}
      aria-expanded={open}
      aria-label={open ? `Fermer ${BRAND.assistant}` : `Ouvrir ${BRAND.assistant}`}
      className={cx(
        "group relative flex h-9 shrink-0 items-center gap-2 rounded-full border pl-1 pr-1 text-[13px] font-medium transition-[border-color,background-color] duration-200 sm:pr-3.5",
        open ? "border-accent bg-accent/12 text-ink" : "border-line-strong bg-surface-2 text-ink hover:border-accent/70",
      )}
    >
      <span className="relative">
        <AssistantMark size={28} animated={busy} />
        {status ? <span aria-hidden className={cx("absolute -right-0.5 -top-0.5 size-2.5 rounded-full border-2 border-surface-2", status.available ? "bg-good" : "bg-warning")} /> : null}
      </span>
      <span className="hidden sm:inline">{BRAND.assistant}</span>
    </button>
  );
}

function SideNav({ pathname }: { pathname: string }) {
  const reduce = useReducedMotion();
  return (
    <nav aria-label="Navigation principale" data-tour="main-nav" className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4">
      {NAV.map((group) => (
        <div key={group.group}>
          <p className="px-3 pb-2 text-[11px] font-medium text-ink-3">{group.group}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx("group relative flex h-10 items-center gap-3 rounded-control px-3 text-[13.5px] transition-colors", active ? "font-medium text-ink" : "text-ink-2 hover:text-ink")}
                >
                  {active ? (
                    <motion.span
                      layoutId="nav-active"
                      transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 36 }}
                      className="absolute inset-0 rounded-control border border-line-strong/70 bg-surface-2"
                    >
                      <span className="absolute -left-3 top-2.5 h-5 w-[3px] rounded-r-full bg-ember" />
                    </motion.span>
                  ) : (
                    <span aria-hidden className="absolute inset-0 rounded-control bg-surface opacity-0 transition-opacity group-hover:opacity-100" />
                  )}
                  <Icon size={18} weight={active ? "fill" : "regular"} className={cx("relative transition-colors", active ? "text-accent" : "text-ink-3 group-hover:text-ink-2")} />
                  <span className="relative">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

/** Feuille « Plus » sur telephone : les ecrans secondaires, la visite guidee et la nature des donnees. */
function MoreSheet({ open, onClose, pathname }: { open: boolean; onClose: () => void; pathname: string }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const items = FLAT.filter((i) => !PRIMARY.includes(i.href));
  return (
    <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Autres écrans">
      <button type="button" aria-label="Fermer" onClick={onClose} className="absolute inset-0 animate-[fade-in_0.2s_ease-out] bg-bg-deep/70 backdrop-blur-[2px]" />
      <div className="absolute inset-x-0 bottom-0 animate-fade-up rounded-t-[24px] border-t border-line-strong bg-surface px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[15px] font-semibold text-ink">Autres écrans</p>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-full p-2 text-ink-3 hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cx("flex h-full flex-col gap-2 rounded-panel border p-3.5 transition-colors", active ? "border-accent/60 bg-accent/10" : "border-line bg-surface-2 active:bg-surface-3")}
                >
                  <Icon size={20} weight="duotone" className="text-accent" />
                  <span className="text-[13.5px] font-medium leading-tight text-ink">{item.short === "Inhabituel" ? "Périodes inhabituelles" : item.label}</span>
                  <span className="text-[12px] leading-snug text-ink-3">{item.hint}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              setAssistant({ tourStep: 0 });
            }}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface-2 text-[13.5px] font-medium text-ink"
          >
            <CompassTool size={17} className="text-accent" />
            Visite guidée
          </button>
          <DataBadge />
        </div>
      </div>
    </div>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname === "/map";
  const [more, setMore] = useState(false);
  const { restored } = useFilters();
  const inMore = !PRIMARY.includes(pathname);
  return (
    <div className="print-root orbit-glow flex min-h-[100dvh]">
      {/* Navigation laterale (ordinateur) */}
      <aside className="no-print sticky top-0 z-10 hidden h-[100dvh] w-[264px] shrink-0 flex-col border-r border-line/60 bg-bg-deep lg:flex">
        <div className="flex h-[68px] items-center px-5">
          <Logo />
        </div>
        <SideNav pathname={pathname} />
        <div className="flex flex-col gap-1 border-t border-line/60 px-3 py-3">
          <button
            type="button"
            onClick={() => setAssistant({ tourStep: 0 })}
            className="group flex h-10 items-center gap-3 rounded-control px-3 text-[13.5px] text-ink-2 transition-colors hover:bg-surface hover:text-ink"
          >
            <CompassTool size={18} className="text-ink-3 transition-colors group-hover:text-accent" />
            Visite guidée
          </button>
          <p className="px-3 pt-1 text-[10.5px] leading-relaxed text-ink-3">Projet étudiant, NASA Space Apps Challenge 2026. Ni produit officiel de la NASA, ni service d'alerte incendie.</p>
        </div>
      </aside>

      <div className={cx("relative flex min-w-0 flex-1 flex-col", isMap && "h-[100dvh]")}>
        {/* Barre de contexte : zone et periode toujours visibles */}
        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-line/60 bg-bg/80 px-3 backdrop-blur-xl sm:px-4 md:px-6">
          <div className="shrink-0 lg:hidden">
            <Logo compact />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CountrySwitch />
            <ZonePicker />
            <PeriodPicker />
          </div>
          <div className="hidden md:block">
            <DataBadge />
          </div>
          <AssistantButton />
        </header>

        <main className={cx("relative flex-1", isMap ? "min-h-0 pb-[64px] lg:pb-0" : "px-4 pb-28 pt-8 md:px-8 lg:pb-16")}>
          {isMap ? null : <ProvisionalBanner />}
          <div key={pathname} className={isMap ? "h-full" : "stagger mx-auto flex w-full max-w-[1320px] flex-col gap-6"}>
            {restored ? (
              children
            ) : (
              <div className="flex flex-col gap-6" role="status" aria-label="Chargement de l'écran">
                <div className="skeleton h-12 w-72" />
                <div className="skeleton h-[52vh] w-full" />
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Navigation basse (tablette et telephone) : quatre ecrans principaux et « Plus » */}
      <nav
        aria-label="Navigation principale"
        className="no-print fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-line/70 bg-bg-deep/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        {FLAT.filter((i) => PRIMARY.includes(i.href)).map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx("relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10.5px] font-medium transition-colors", active ? "text-ink" : "text-ink-3")}
            >
              {active ? <span aria-hidden className="absolute inset-x-5 top-0 h-[2px] rounded-b-full bg-ember" /> : null}
              <Icon size={21} weight={active ? "fill" : "regular"} className={active ? "text-accent" : ""} />
              {item.short}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMore(true)}
          aria-expanded={more}
          className={cx("relative flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[10.5px] font-medium", inMore ? "text-ink" : "text-ink-3")}
        >
          {inMore ? <span aria-hidden className="absolute inset-x-5 top-0 h-[2px] rounded-b-full bg-ember" /> : null}
          <DotsThreeOutline size={21} weight={inMore ? "fill" : "regular"} className={inMore ? "text-accent" : ""} />
          {inMore ? (FLAT.find((i) => i.href === pathname)?.short ?? "Plus") : "Plus"}
        </button>
      </nav>
      <MoreSheet open={more} onClose={() => setMore(false)} pathname={pathname} />

      <div className="no-print">
        <AssistantPanel />
        <AssistantSpotlight />
        <GuidedTour />
      </div>
    </div>
  );
}
