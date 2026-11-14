"use client";

import { CalendarDots, ChartLineUp, FileText, Flask, Gauge, GitDiff, MapTrifold, WarningDiamond } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AssistantLauncher, AssistantPanel } from "@/components/assistant/panel";
import { AssistantSpotlight, GuidedTour } from "@/components/assistant/spotlight";
import { AssistantMark, BRAND, BrandMark, Wordmark } from "@/components/brand";
import { cx } from "@/components/ui";
import { setAssistant, useAssistant } from "@/state/assistant";

import { DataBadge, PeriodPicker, ZonePicker } from "./pickers";

interface NavItem {
  href: string;
  label: string;
  short: string;
  icon: typeof Gauge;
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: "Explorer", items: [
    { href: "/dashboard", label: "Vue d'ensemble", short: "Synthèse", icon: Gauge },
    { href: "/map", label: "Carte des détections", short: "Carte", icon: MapTrifold },
    { href: "/calendar", label: "Calendrier d'activité", short: "Calendrier", icon: CalendarDots },
  ] },
  { group: "Analyser", items: [
    { href: "/trends", label: "Analyses et tendances", short: "Tendances", icon: ChartLineUp },
    { href: "/compare", label: "Comparaison MODIS / VIIRS", short: "Capteurs", icon: GitDiff },
    { href: "/anomalies", label: "Périodes inhabituelles", short: "Inhabituel", icon: WarningDiamond },
  ] },
  { group: "Comprendre", items: [
    { href: "/reports", label: "Rapports et exports", short: "Rapports", icon: FileText },
    { href: "/methodology", label: "Méthode et données", short: "Méthode", icon: Flask },
  ] },
];

const FLAT: NavItem[] = NAV.flatMap((g) => g.items);

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

function AssistantButton() {
  const open = useAssistant((s) => s.open);
  return (
    <button
      type="button"
      onClick={() => setAssistant({ open: !open })}
      aria-expanded={open}
      className={cx(
        "flex h-9 items-center gap-2 rounded-control border pl-1.5 pr-3 text-[13px] font-medium transition-colors",
        open ? "border-accent bg-accent/10 text-ink" : "border-line-strong bg-surface-2 text-ink hover:border-accent",
      )}
    >
      <AssistantMark size={24} />
      <span className="hidden sm:inline">{BRAND.assistant}</span>
      <span className="sm:hidden">IA</span>
    </button>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMap = pathname === "/map";
  return (
    <div className="print-root flex min-h-[100dvh]">
      {/* Navigation laterale (ordinateur) */}
      <aside className="no-print sticky top-0 hidden h-[100dvh] w-[252px] shrink-0 flex-col bg-bg-deep lg:flex">
        <div className="flex h-[72px] items-center px-5">
          <Logo />
        </div>
        <nav aria-label="Navigation principale" data-tour="main-nav" className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-3">
          {NAV.map((group) => (
            <div key={group.group}>
              <p className="px-2.5 pb-1.5 text-[11px] font-medium text-ink-3">{group.group}</p>
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group relative flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] transition-colors",
                        active ? "bg-surface-2 font-medium text-ink" : "text-ink-2 hover:bg-surface hover:text-ink",
                      )}
                    >
                      {active ? <span aria-hidden className="absolute -left-3 top-2 h-5 w-[3px] rounded-r-full bg-ember" /> : null}
                      <Icon size={18} weight={active ? "fill" : "regular"} className={active ? "text-accent" : "text-ink-3 group-hover:text-ink-2"} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mx-3 mb-3 rounded-panel bg-surface p-3.5">
          <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <AssistantMark size={20} />
            Besoin d'un repère ?
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-3">Visite guidée, questions, actions : {BRAND.assistant} vous accompagne.</p>
          <button type="button" onClick={() => setAssistant({ tourStep: 0 })} className="mt-2 text-[12.5px] font-medium text-accent hover:text-accent-strong">
            Lancer la visite guidée
          </button>
        </div>
        <p className="px-5 pb-4 text-[10.5px] leading-relaxed text-ink-3">
          Projet étudiant, NASA Space Apps Challenge 2026. Ni produit officiel de la NASA, ni service d'alerte incendie.
        </p>
      </aside>

      <div className={cx("flex min-w-0 flex-1 flex-col", isMap && "h-[100dvh]")}>
        {/* Barre de contexte : zone et periode toujours visibles */}
        <header className="no-print sticky top-0 z-10 flex min-h-16 flex-wrap items-center gap-2 border-b border-line/70 bg-bg/90 px-4 py-2.5 backdrop-blur-md md:px-6">
          <div className="lg:hidden">
            <Logo compact />
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <ZonePicker />
            <PeriodPicker />
          </div>
          <DataBadge />
          <AssistantButton />
        </header>

        <main className={cx("flex-1", isMap ? "min-h-0 pb-[58px] lg:pb-0" : "px-4 pb-28 pt-7 md:px-8 lg:pb-14")}>
          <div className={isMap ? "h-full" : "mx-auto flex w-full max-w-[1360px] flex-col gap-6"}>{children}</div>
        </main>
      </div>

      {/* Navigation basse (tablette et telephone) */}
      <nav
        aria-label="Navigation principale"
        className="no-print fixed inset-x-0 bottom-0 z-10 flex overflow-x-auto border-t border-line bg-bg-deep/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        {FLAT.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx("flex min-w-[72px] flex-1 flex-col items-center gap-1 px-1 py-2 text-[10.5px] font-medium", active ? "text-accent" : "text-ink-3")}
            >
              <Icon size={20} weight={active ? "fill" : "regular"} />
              {item.short}
            </Link>
          );
        })}
      </nav>

      <div className="no-print">
        {isMap ? null : <AssistantLauncher className="bottom-[78px] right-4 lg:bottom-6 lg:right-6" />}
        <AssistantPanel />
        <AssistantSpotlight />
        <GuidedTour />
      </div>
    </div>
  );
}
