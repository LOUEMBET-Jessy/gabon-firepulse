"use client";

import { CalendarDots, ChartLineUp, FileText, Flask, Gauge, MapTrifold, Pulse, WarningDiamond } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cx } from "@/components/ui";

import { DataBadge, PeriodPicker, ZonePicker } from "./pickers";

const NAV = [
  { href: "/dashboard", label: "Tableau de bord", short: "Synthèse", icon: Gauge },
  { href: "/map", label: "Carte des détections", short: "Carte", icon: MapTrifold },
  { href: "/calendar", label: "Calendrier d'activité", short: "Calendrier", icon: CalendarDots },
  { href: "/trends", label: "Tendances", short: "Tendances", icon: ChartLineUp },
  { href: "/anomalies", label: "Périodes inhabituelles", short: "Inhabituel", icon: WarningDiamond },
  { href: "/reports", label: "Rapports et exports", short: "Rapports", icon: FileText },
  { href: "/methodology", label: "Méthode et données", short: "Méthode", icon: Flask },
] as const;

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5 rounded-control" aria-label="Gabon FirePulse, accueil">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-[linear-gradient(140deg,#f6b547,#d95926)] text-[#1a0d04]">
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
      <aside className="no-print sticky top-0 hidden h-[100dvh] w-[244px] shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-16 items-center px-4">
          <Logo />
        </div>
        <nav aria-label="Navigation principale" className="flex flex-1 flex-col gap-0.5 px-2.5 py-2">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "group flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] transition-colors",
                  active ? "bg-surface-3 font-medium text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon size={18} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <p className="border-t border-line px-4 py-3 text-[11px] leading-relaxed text-ink-3">
          Projet étudiant indépendant, NASA Space Apps Challenge 2026. Ni produit officiel de la NASA, ni service d'alerte incendie.
        </p>
      </aside>

      <div className={cx("flex min-w-0 flex-1 flex-col", isMap && "h-[100dvh]")}>
        {/* Barre de contexte : zone et periode toujours visibles */}
        <header className="no-print sticky top-0 z-10 flex min-h-16 flex-wrap items-center gap-2 border-b border-line bg-bg/85 px-4 py-2.5 backdrop-blur-md md:px-6">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <ZonePicker />
            <PeriodPicker />
          </div>
          <DataBadge />
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
