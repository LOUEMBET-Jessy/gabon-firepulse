"use client";

import type { Icon } from "@phosphor-icons/react";
import { CalendarDots, ChartBar, Database, Lightbulb, ChartLineUp, FileText, Flask, Gauge, MapTrifold, Pulse, Scales, WarningDiamond } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/components/ui";

import { GuideButton } from "./guide";
import { DataBadge, PeriodPicker, ZonePicker } from "./pickers";
import { ThemeToggle } from "./theme";

type NavItem = {
  href: "/dashboard" | "/map" | "/calendar" | "/trends" | "/anomalies" | "/compare" | "/statistics" | "/reports" | "/understand" | "/data" | "/methodology"; label: string; short: string; icon: Icon };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Explorer",
    items: [
      { href: "/dashboard", label: "Tableau de bord", short: "Synthèse", icon: Gauge },
      { href: "/map", label: "Carte des détections", short: "Carte", icon: MapTrifold },
      { href: "/calendar", label: "Calendrier d'activité", short: "Calendrier", icon: CalendarDots },
    ],
  },
  {
    title: "Analyser",
    items: [
      { href: "/trends", label: "Tendances", short: "Tendances", icon: ChartLineUp },
      { href: "/anomalies", label: "Périodes inhabituelles", short: "Inhabituel", icon: WarningDiamond },
      { href: "/compare", label: "Comparer deux zones", short: "Comparer", icon: Scales },
      { href: "/statistics", label: "Statistiques détaillées", short: "Stats", icon: ChartBar },
    ],
  },
  {
    title: "Partager et comprendre",
    items: [
      { href: "/reports", label: "Rapports et exports", short: "Rapports", icon: FileText },
      { href: "/understand", label: "Comprendre les données", short: "Comprendre", icon: Lightbulb },
      { href: "/data", label: "Données et sources", short: "Sources", icon: Database },
      { href: "/methodology", label: "Méthode détaillée", short: "Méthode", icon: Flask },
    ],
  },
];

const NAV: NavItem[] = SECTIONS.flatMap((section) => section.items);

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-control" aria-label="Gabon FirePulse, accueil">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-[linear-gradient(140deg,#5b8cff,#1d4ed8)] text-white shadow-[0_2px_8px_-2px_rgb(29_78_216/0.6)]">
        <Pulse size={18} weight="bold" />
      </span>
      {compact ? null : (
        <span className="flex flex-col leading-none">
          <span className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">Gabon FirePulse</span>
          <span className="mt-1 text-[11px] text-ink-3">Détections MODIS et VIIRS harmonisées</span>
        </span>
      )}
    </Link>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname === "/map";
  return (
    <div className="print-root flex min-h-[100dvh]">
      {/* Navigation laterale (ordinateur) */}
      <aside className="theme-navy no-print sticky top-0 hidden h-[100dvh] w-[248px] shrink-0 flex-col lg:flex">
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-4 overflow-y-auto px-2.5 py-2">
          {SECTIONS.map((section) => (
            <div key={section.title} className="flex flex-col gap-0.5">
              <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-ink-3">{section.title}</p>
              {section.items.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "group relative flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] transition-colors",
                      active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                    )}
                  >
                    {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-accent" /> : null}
                    <Icon size={18} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-3">
          Projet étudiant indépendant, NASA Space Apps Challenge 2026. Ni produit officiel de la NASA, ni service d'alerte incendie.
        </p>
      </aside>

      <div className={cx("flex min-w-0 flex-1 flex-col", isMap && "h-[100dvh]")}>
        {/* Barre de contexte : zone et periode toujours visibles */}
        <header className="no-print sticky top-0 z-10 flex min-h-16 flex-wrap items-center gap-2 border-b border-line bg-surface/90 px-4 py-2.5 backdrop-blur-md md:px-6">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <ZonePicker />
            <PeriodPicker />
          </div>
          <div className="flex items-center gap-2">
            <GuideButton />
            <ThemeToggle />
            <DataBadge />
          </div>
        </header>

        <main className={cx("flex-1", isMap ? "min-h-0 pb-[58px] lg:pb-0" : "px-4 pb-28 pt-6 md:px-6 lg:pb-12")}>
          <div className={isMap ? "h-full" : "mx-auto flex w-full max-w-[1400px] flex-col gap-5"}>{children}</div>
        </main>
      </div>

      {/* Navigation basse (tablette et telephone) */}
      <nav
        aria-label="Navigation principale"
        className="no-print fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx("flex min-w-[76px] flex-1 flex-col items-center gap-1 px-1 py-2 text-[10.5px] font-medium", active ? "text-accent" : "text-ink-3")}
            >
              <Icon size={20} weight={active ? "fill" : "regular"} />
              {item.short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
