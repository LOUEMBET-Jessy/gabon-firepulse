import { ArrowRight, CalendarDots, ChartLineUp, GitDiff, MapTrifold } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { BRAND, BrandMark, Wordmark } from "@/components/brand";
import { AssistantInvite } from "@/components/landing/assistant-invite";
import { CountUp } from "@/components/landing/count-up";
import type { GlowCell } from "@/components/landing/hero-globe";
import { HeroGlobeLazy } from "@/components/landing/hero-globe-lazy";
import { Reveal } from "@/components/landing/reveal";
import { GabonGrid, HarmonizedYears, MiniCalendar, RawGapChart } from "@/components/landing/visuals";
import { buttonClass } from "@/lib/classes";
import { fmt1, fmtDate } from "@/lib/format";
import { calendar } from "@/lib/server/engine";
import { queryGrid } from "@/lib/server/queries";
import { type CountryCode, dayToIso, getStore, isoToDay } from "@/lib/server/store";

/** Cellules les plus actives par pays sur le globe : assez pour dessiner le territoire, assez peu pour une page legere. */
const GLOW_LIMIT = 1800;

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Cellules de 5 km actives pendant l'annee en cours, calculees sur l'archive chargee du pays (aucune donnee inventee). */
function activeCells(country: CountryCode) {
  const store = getStore(country);
  const lastYear = dayToIso(store, store.lastDay).slice(0, 4);
  const grid = queryGrid({ kind: "country" }, isoToDay(store, `${lastYear}-01-01`), store.lastDay, store);
  const half = store.harmonization.grid.step_deg / 2;
  const top = [...grid.cells].sort((a, b) => b.harmonized - a.harmonized).slice(0, GLOW_LIMIT);
  const max = top[0]?.harmonized || 1;
  const cells: GlowCell[] = top.map((c) => [r2(c.lon + half), r2(c.lat + half), r2(Math.sqrt(c.harmonized / max))]);
  return { store, grid, cells };
}

const NAV = [
  ["Carte", "/map"],
  ["Calendrier", "/calendar"],
  ["Tendances", "/trends"],
  ["Méthode", "/methodology"],
] as const;

export default function LandingPage() {
  const gab = activeCells("GAB");
  const fra = activeCells("FRA");
  const store = gab.store;
  const lastIso = dayToIso(store, store.lastDay);
  const lastYear = Number(lastIso.slice(0, 4));
  const firstYear = Number(dayToIso(store, store.firstDay).slice(0, 4));
  const national = calendar({ kind: "country" }, store);
  const unit = store.harmonization.diagnostics.unit_comparison;
  const cells = [...gab.cells, ...fra.cells];

  const shortcuts = [
    {
      href: "/map",
      icon: MapTrifold,
      title: "Explorer la carte",
      text: "Du globe au quartier : chaque détection à sa place, satellite par satellite, archive ou 7 derniers jours.",
      visual: (
        <div className="mx-auto w-full max-w-[400px]">
          <GabonGrid grid={gab.grid} />
        </div>
      ),
      className: "lg:col-span-7 lg:row-span-2",
      tone: "bg-[linear-gradient(165deg,#142b48,#0e1e36_70%)]",
    },
    {
      href: "/calendar",
      icon: CalendarDots,
      title: "Lire les saisons",
      text: `Chaque mois depuis ${firstYear}, comparé à ce qui est habituel pour lui.`,
      visual: <MiniCalendar months={national.months} years={6} />,
      className: "lg:col-span-5",
      tone: "bg-surface",
    },
    {
      href: "/trends",
      icon: ChartLineUp,
      title: "Suivre les tendances",
      text: "Totaux annuels harmonisés, pente robuste et test de significativité.",
      visual: <HarmonizedYears years={national.years} />,
      className: "lg:col-span-5",
      tone: "bg-surface",
    },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-[72px] w-full max-w-[1320px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name}, accueil`}>
            <BrandMark size={32} />
            <Wordmark className="text-[18px]" />
          </Link>
          <nav aria-label="Espaces" className="hidden items-center gap-1 rounded-full border border-line/60 bg-bg/40 p-1 text-[13.5px] text-ink-2 backdrop-blur-md md:flex">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-full px-3.5 py-1.5 transition-colors hover:bg-surface-2 hover:text-ink">
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/dashboard" className={`${buttonClass("secondary", "md")} h-10 rounded-full border-line-strong/80 bg-bg/40 px-4 backdrop-blur-md`}>
            Ouvrir la plateforme
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* Hero : la Terre vue de l'espace, les satellites en orbite, les cellules actives qui brillent. */}
        <section className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden">
          <div aria-hidden className="starfield pointer-events-none absolute inset-0 -z-20 opacity-80" />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(55%_60%_at_50%_30%,rgb(18_191_210/0.10),transparent_70%)] lg:bg-[radial-gradient(45%_70%_at_66%_50%,rgb(18_191_210/0.12),transparent_70%)]"
          />
          <div className="absolute inset-x-[-22%] top-[64px] -z-10 h-[60vh] sm:inset-x-[-8%] lg:inset-y-0 lg:left-[30%] lg:right-[-12%] lg:h-auto">
            <HeroGlobeLazy cells={cells} />
          </div>
          {/* Voiles : le texte reste lisible quelle que soit la position du globe. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_46%,var(--color-bg)_70%)] lg:bg-[linear-gradient(90deg,var(--color-bg)_24%,rgb(11_24_48/0.55)_44%,transparent_62%),linear-gradient(180deg,transparent_78%,var(--color-bg))]"
          />

          <div className="pointer-events-none mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-5 pb-8 pt-[57vh] sm:pt-[56vh] md:px-8 lg:justify-center lg:pb-10 lg:pt-[104px]">
            <div className="pointer-events-auto max-w-[620px]">
              <p className="animate-fade-up inline-flex items-center gap-2.5 rounded-full border border-line/70 bg-bg/50 px-3 py-1.5 text-[12.5px] text-ink-2 backdrop-blur-md">
                <span aria-hidden className="live-dot size-1.5 rounded-full bg-ember text-ember" />
                NASA FIRMS · données jusqu'au {fmtDate(lastIso)}
              </p>
              <h1 className="mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] text-ink sm:text-[60px] lg:text-[78px]">
                <span className="hero-line">{lastYear - firstYear} ans de feux,</span>
                <span className="hero-line bg-[linear-gradient(95deg,#f4f7fa_10%,#7fe3ee_55%,#12bfd2)] bg-clip-text pb-1 text-transparent">vus de l'espace.</span>
              </h1>
              <p className="animate-fade-up mt-5 max-w-[44ch] text-pretty text-[16.5px] leading-relaxed text-ink-2 [animation-delay:260ms] md:text-[18px]">
                Hot-Spots rend comparables les détections des satellites NASA MODIS et VIIRS, pour lire l'activité des feux du pays jusqu'au quartier.
              </p>
              <div className="animate-fade-up mt-8 flex flex-wrap items-center gap-3 [animation-delay:380ms]">
                <Link href="/map" className={`${buttonClass("primary", "md")} group h-12 rounded-full px-6 text-[15px] shadow-[0_0_0_1px_rgb(18_191_210/0.35),0_10px_40px_-8px_rgb(18_191_210/0.55)] active:scale-[0.98]`}>
                  Explorer le globe
                  <ArrowRight size={17} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link href="/dashboard" className="inline-flex h-12 items-center rounded-full px-4 text-[15px] font-medium text-ink-2 transition-colors hover:text-ink">
                  Vue d'ensemble
                </Link>
              </div>
            </div>

            {/* Chiffres et legende : ce que l'on voit sur le globe, et d'ou cela vient. */}
            <div className="animate-fade-up pointer-events-auto mt-12 flex flex-col gap-6 border-t border-line/60 pt-6 [animation-delay:520ms] lg:mt-auto lg:flex-row lg:items-end lg:justify-between lg:pt-7">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:gap-10">
                <div>
                  <dd className="num text-[24px] font-semibold leading-none tracking-[-0.03em] text-ink md:text-[28px]">
                    <CountUp value={gab.store.n} />
                  </dd>
                  <dt className="mt-1.5 text-[13px] text-ink-3">détections au Gabon</dt>
                </div>
                <div>
                  <dd className="num text-[24px] font-semibold leading-none tracking-[-0.03em] text-ink md:text-[28px]">
                    <CountUp value={fra.store.n} />
                  </dd>
                  <dt className="mt-1.5 text-[13px] text-ink-3">en France métropolitaine</dt>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <dd className="num text-[24px] font-semibold leading-none tracking-[-0.03em] text-ink md:text-[28px]">
                    ×{fmt1(unit.raw_detections.factor_global)}
                  </dd>
                  <dt className="mt-1.5 text-[13px] text-ink-3">l'écart brut que l'harmonisation corrige</dt>
                </div>
              </dl>
              <ul aria-label="Satellites en orbite sur le globe" className="flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-ink-3">
                <li className="flex items-center gap-2">
                  <span aria-hidden className="h-[3px] w-5 rounded-full bg-accent shadow-[0_0_10px_#12bfd2]" />
                  <span><span className="font-medium text-ink-2">MODIS</span> · Terra, Aqua</span>
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden className="h-[3px] w-5 rounded-full bg-ember shadow-[0_0_10px_#f59e0b]" />
                  <span><span className="font-medium text-ink-2">VIIRS</span> · Suomi NPP, NOAA-20, NOAA-21</span>
                </li>
                <li className="flex items-center gap-2">
                  <span aria-hidden className="size-2 rounded-full bg-[#f6b547] shadow-[0_0_8px_#f59e0b]" />
                  <span>Cellules actives en {lastYear}</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Ou commencer : quatre portes d'entree, chacune illustree par les vraies donnees. */}
        <section id="commencer" className="mx-auto flex w-full max-w-[1320px] scroll-mt-8 flex-col gap-8 px-5 pb-20 pt-16 md:px-8 md:pt-24">
          <Reveal className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <h2 className="max-w-[16ch] text-balance text-[32px] font-semibold leading-[1.06] tracking-[-0.035em] text-ink md:text-[44px]">Choisissez votre angle.</h2>
            <p className="max-w-[46ch] text-[15.5px] leading-relaxed text-ink-2">
              Les mêmes observations, quatre manières de les lire. Votre territoire et votre période vous suivent d'un espace à l'autre.
            </p>
          </Reveal>

          <div className="grid gap-4 lg:grid-cols-12">
            {shortcuts.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.href} delay={i * 0.06} className={s.className}>
                  <Link
                    href={s.href}
                    className={`group relative flex h-full flex-col gap-6 overflow-hidden rounded-[22px] border border-line/50 p-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-accent/40 md:p-7 ${s.tone}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="flex items-center gap-2 text-[13px] font-medium text-accent">
                          <Icon size={18} />
                          {["Carte", "Calendrier", "Tendances"][i]}
                        </span>
                        <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.025em] text-ink md:text-[24px]">{s.title}</h3>
                        <p className="mt-1.5 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-2">{s.text}</p>
                      </div>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong/70 text-ink-3 transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-bg">
                        <ArrowRight size={16} weight="bold" className="transition-transform group-hover:-rotate-45" />
                      </span>
                    </div>
                    <div className="mt-auto">{s.visual}</div>
                  </Link>
                </Reveal>
              );
            })}

            <Reveal delay={0.18} className="lg:col-span-12">
              <Link
                href="/compare"
                className="group grid items-center gap-6 overflow-hidden rounded-[22px] border border-line/50 bg-[linear-gradient(120deg,#10213a,#142b48_60%,#1a2c3c)] p-6 transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-accent/40 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:p-7"
              >
                <div>
                  <span className="flex items-center gap-2 text-[13px] font-medium text-accent">
                    <GitDiff size={18} />
                    MODIS et VIIRS
                  </span>
                  <h3 className="mt-3 text-[22px] font-semibold tracking-[-0.025em] text-ink md:text-[24px]">Deux satellites, une seule mesure.</h3>
                  <p className="mt-1.5 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-2">
                    VIIRS voit {fmt1(unit.raw_detections.factor_global)} fois plus de points que MODIS. Voyez comment l'harmonisation rend les deux séries comparables, et ce qu'elle ne corrige pas.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-[14px] font-medium text-ink transition-colors group-hover:text-accent">
                    Comparer les capteurs
                    <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
                {/* Memes couleurs que les satellites du globe : MODIS cyan, VIIRS orange. */}
                <RawGapChart months={national.months} colors={{ modis: "#12bfd2", viirs: "#f59e0b" }} />
              </Link>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <AssistantInvite />
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-line/70">
        <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-5 px-5 py-8 text-[12.5px] text-ink-3 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex shrink-0 items-center gap-3 whitespace-nowrap">
            <BrandMark size={26} />
            <span className="text-[13.5px] text-ink-2">{BRAND.signature}</span>
          </div>
          <p className="max-w-[70ch] leading-relaxed md:text-right">
            Projet indépendant, NASA Space Apps Challenge 2026. Détections NASA FIRMS (LANCE, ESDIS), limites geoBoundaries et Natural Earth, fond OpenStreetMap.
            Ni produit officiel de la NASA, ni service d'alerte : une détection est un pixel chaud, pas un incendie confirmé.{" "}
            <Link href="/methodology" className="text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              Méthode et limites
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
