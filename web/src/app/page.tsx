import { ArrowRight, CalendarDots, ChartLineUp, GitDiff, MapTrifold } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { BRAND, BrandMark, Wordmark } from "@/components/brand";
import { AssistantInvite } from "@/components/landing/assistant-invite";
import { CountUp } from "@/components/landing/count-up";
import type { GlowCell } from "@/components/landing/globe-placeholder";
import { GlobeToForest } from "@/components/landing/globe-to-forest";
import { HeroGlobeLazy } from "@/components/landing/hero-globe-lazy";
import { Reveal } from "@/components/landing/reveal";
import { GabonGrid, HarmonizedYears, MiniCalendar, RawGapChart } from "@/components/landing/visuals";
import { SENTINEL_TILES } from "@/components/map/basemaps";
import { buttonClass } from "@/lib/classes";
import { fmt1, fmtDate } from "@/lib/format";
import { SATELLITE_HEX } from "@/lib/palette";
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

/** Tuile Sentinel-2 de l'estuaire du Gabon (Libreville), fond reel des vignettes. */
const ESTUARY = SENTINEL_TILES.replace("{z}", "9").replace("{x}", "269").replace("{y}", "255");

function SectionTitle({ kicker, title, children }: { kicker: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-[640px]">
      <p className="text-[13px] font-medium uppercase tracking-[0.12em] text-lagoon">{kicker}</p>
      <h2 className="mt-3 text-balance font-display text-[32px] leading-[1.08] tracking-[-0.01em] text-ink md:text-[44px]">{title}</h2>
      {children ? <p className="mt-4 text-pretty text-[16px] leading-relaxed text-ink-2">{children}</p> : null}
    </div>
  );
}

export default function LandingPage() {
  const gab = activeCells("GAB");
  const fra = activeCells("FRA");
  const store = gab.store;
  const lastIso = dayToIso(store, store.lastDay);
  const lastYear = Number(lastIso.slice(0, 4));
  const firstYear = Number(dayToIso(store, store.firstDay).slice(0, 4));
  const national = calendar({ kind: "country" }, store);
  const unit = store.harmonization.diagnostics.unit_comparison;
  const factor = fmt1(unit.raw_detections.factor_global);
  const cells = [...gab.cells, ...fra.cells];

  const shortcuts = [
    {
      href: "/map",
      icon: MapTrifold,
      kicker: "Carte",
      title: "Explorer la carte",
      text: "Du globe au quartier, sur l'imagerie satellite : chaque détection à sa place, archive ou 7 derniers jours.",
      visual: (
        <div className="relative overflow-hidden rounded-[12px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- tuile Sentinel-2 distante */}
          <img src={ESTUARY} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-90" />
          <div className="relative mx-auto w-full max-w-[380px] p-3">
            <GabonGrid grid={gab.grid} />
          </div>
        </div>
      ),
      className: "lg:col-span-6 lg:row-span-2",
    },
    {
      href: "/calendar",
      icon: CalendarDots,
      kicker: "Calendrier",
      title: "Lire les saisons",
      text: `Chaque mois depuis ${firstYear}, comparé à ce qui est habituel pour lui.`,
      visual: <MiniCalendar months={national.months} years={6} />,
      className: "lg:col-span-6",
    },
    {
      href: "/trends",
      icon: ChartLineUp,
      kicker: "Tendances",
      title: "Suivre les tendances",
      text: "Totaux annuels harmonisés, pente robuste et test de significativité.",
      visual: <HarmonizedYears years={national.years} />,
      className: "lg:col-span-3",
    },
    {
      href: "/compare",
      icon: GitDiff,
      kicker: "MODIS / VIIRS",
      title: "Comparer les capteurs",
      text: "Ce que l'harmonisation corrige, et ce qu'elle ne corrige pas.",
      visual: <RawGapChart months={national.months} colors={{ modis: SATELLITE_HEX.modis, viirs: SATELLITE_HEX.snpp }} />,
      className: "lg:col-span-3",
    },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-bg">
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex h-[72px] w-full max-w-[1320px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name}, accueil`}>
            <BrandMark size={32} />
            <Wordmark className="text-[18px] !text-space-ink" />
          </Link>
          <nav aria-label="Espaces" className="hidden items-center gap-1 rounded-full border border-space-ink/15 bg-space/40 p-1 text-[13.5px] text-space-ink-2 backdrop-blur-md md:flex">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-full px-3.5 py-1.5 transition-colors hover:bg-space-ink/10 hover:text-space-ink">
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/dashboard" className="inline-flex h-10 items-center rounded-full border border-space-ink/25 bg-space/40 px-4 text-[13.5px] font-medium text-space-ink backdrop-blur-md transition-colors hover:bg-space-ink/10">
            Ouvrir la plateforme
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        {/* 1. Hero : la seule zone sombre du site, l'espace. */}
        <section className="relative isolate flex min-h-[100dvh] flex-col overflow-hidden bg-space">
          <div aria-hidden className="starfield pointer-events-none absolute inset-0 -z-20 opacity-90" />
          <div className="absolute inset-x-[-22%] top-[64px] -z-10 h-[60vh] sm:inset-x-[-8%] lg:inset-y-0 lg:left-[30%] lg:right-[-12%] lg:h-auto">
            <HeroGlobeLazy cells={cells} />
          </div>
          {/* Voiles : le texte reste lisible quelle que soit la position du globe. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(180deg,transparent_46%,var(--color-space)_70%)] lg:bg-[linear-gradient(90deg,var(--color-space)_24%,color-mix(in_srgb,var(--color-space)_55%,transparent)_44%,transparent_62%),linear-gradient(180deg,transparent_80%,var(--color-space))]"
          />

          <div className="pointer-events-none mx-auto flex w-full max-w-[1320px] flex-1 flex-col px-5 pb-10 pt-[57vh] sm:pt-[56vh] md:px-8 lg:justify-center lg:pt-[104px]">
            <div className="pointer-events-auto max-w-[640px]">
              <p className="animate-fade-up inline-flex items-center gap-2.5 rounded-full border border-space-ink/15 bg-space/50 px-3 py-1.5 text-[12.5px] text-space-ink-2 backdrop-blur-md">
                <span aria-hidden className="live-dot size-1.5 rounded-full bg-savanna text-savanna" />
                Données NASA FIRMS jusqu'au {fmtDate(lastIso)}
              </p>
              <h1 className="mt-5 font-display text-[46px] leading-[1.02] tracking-[-0.02em] text-space-ink sm:text-[62px] lg:text-[80px]">
                <span className="hero-line">{lastYear - firstYear} ans de feux,</span>
                <span className="hero-line pb-1 text-savanna">vus de l'espace.</span>
              </h1>
              <p className="animate-fade-up mt-5 max-w-[44ch] text-pretty text-[16.5px] leading-relaxed text-space-ink-2 [animation-delay:260ms] md:text-[18px]">
                Hot-Spots rend comparables les détections des satellites NASA MODIS et VIIRS, pour lire l'activité des feux du pays jusqu'au quartier.
              </p>
              <div className="animate-fade-up mt-8 flex flex-wrap items-center gap-3 [animation-delay:380ms]">
                <Link href="/map" className={`${buttonClass("primary", "md")} group h-12 rounded-full px-6 text-[15px] active:scale-[0.98]`}>
                  Explorer la carte
                  <ArrowRight size={17} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
                </Link>
                <Link href="/dashboard" className="inline-flex h-12 items-center rounded-full border border-space-ink/25 px-5 text-[15px] font-medium text-space-ink transition-colors hover:bg-space-ink/10">
                  Vue d'ensemble
                </Link>
              </div>
            </div>
            <ul aria-label="Ce que montre le globe" className="animate-fade-up pointer-events-auto mt-12 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] text-space-ink-2 [animation-delay:520ms] lg:mt-auto lg:justify-end">
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-[3px] w-5 rounded-full" style={{ backgroundColor: SATELLITE_HEX.modis }} />
                <span>
                  <span className="font-medium text-space-ink">MODIS</span> · Terra, Aqua
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="h-[3px] w-5 rounded-full" style={{ backgroundColor: SATELLITE_HEX.snpp }} />
                <span>
                  <span className="font-medium text-space-ink">VIIRS</span> · Suomi NPP, NOAA-20, NOAA-21
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span aria-hidden className="size-2 rounded-full bg-savanna" />
                <span>Cellules actives en {lastYear}</span>
              </li>
            </ul>
          </div>
        </section>

        {/* 2. Chiffres cles, comptes a l'apparition. */}
        <section className="bg-surface-2">
          <dl className="mx-auto grid w-full max-w-[1320px] gap-8 px-5 py-12 sm:grid-cols-3 md:px-8 md:py-14">
            {(
              [
                [<CountUp key="g" value={gab.store.n} />, "détections au Gabon", `${firstYear} à ${lastYear}`],
                [<CountUp key="f" value={fra.store.n} />, "détections en France métropolitaine", `${firstYear} à ${lastYear}`],
                [`×${factor}`, "l'écart brut que l'harmonisation corrige", "VIIRS voit plus de points que MODIS"],
              ] as const
            ).map(([value, label, detail]) => (
              <Reveal key={label} className="border-l-2 border-leaf pl-5">
                <dd className="num text-[32px] font-semibold leading-none tracking-[-0.03em] text-ink md:text-[40px]">{value}</dd>
                <dt className="mt-2 text-[15px] text-ink">{label}</dt>
                <p className="mt-0.5 text-[13px] text-ink-3">{detail}</p>
              </Reveal>
            ))}
          </dl>
        </section>

        {/* 3. Du globe a la foret. */}
        <section className="mx-auto w-full max-w-[1320px] px-5 pt-20 md:px-8 md:pt-28">
          <Reveal>
            <SectionTitle kicker="Ce que voit un satellite" title="Du globe à la forêt">
              Trois échelles, trois manières de regarder les mêmes feux. Descendez pour vous rapprocher du sol.
            </SectionTitle>
          </Reveal>
          <div className="mt-10">
            <GlobeToForest />
          </div>
        </section>

        {/* 4. Choisissez votre angle. */}
        <section id="commencer" className="mx-auto flex w-full max-w-[1320px] scroll-mt-8 flex-col gap-10 px-5 pt-20 md:px-8 md:pt-28">
          <Reveal>
            <SectionTitle kicker="Où commencer" title="Choisissez votre angle.">
              Les mêmes observations, quatre manières de les lire. Votre territoire et votre période vous suivent d'un espace à l'autre.
            </SectionTitle>
          </Reveal>
          <div className="grid gap-4 lg:grid-cols-12">
            {shortcuts.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.href} delay={i * 0.06} className={s.className}>
                  <Link
                    href={s.href}
                    className="group flex h-full flex-col gap-5 rounded-panel border border-line bg-surface p-6 shadow-card transition-[transform,border-color] duration-300 hover:-translate-y-1 hover:border-accent/50 md:p-7"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="flex items-center gap-2 text-[13px] font-medium text-accent">
                          <Icon size={18} />
                          {s.kicker}
                        </span>
                        <h3 className="mt-3 text-[21px] font-semibold tracking-[-0.02em] text-ink md:text-[23px]">{s.title}</h3>
                        <p className="mt-1.5 max-w-[46ch] text-[14.5px] leading-relaxed text-ink-2">{s.text}</p>
                      </div>
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink-3 transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-accent-ink">
                        <ArrowRight size={16} weight="bold" className="transition-transform group-hover:-rotate-45" />
                      </span>
                    </div>
                    <div className="mt-auto">{s.visual}</div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </section>

        {/* 5. Deux satellites, une seule mesure. */}
        <section className="mx-auto w-full max-w-[1320px] px-5 pt-20 md:px-8 md:pt-28">
          <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <Reveal>
              <SectionTitle kicker="Harmonisation" title="Deux satellites, une seule mesure.">
                Un pixel MODIS couvre 1 km de côté ; un pixel VIIRS, 375 m. Pour un même feu, VIIRS signale {factor} fois plus de points. Hot-Spots compte les cellules de 5 km actives
                chaque jour et convertit MODIS dans l'unité de VIIRS : la série devient continue depuis {firstYear}.
              </SectionTitle>
              <Link href="/compare" className="mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-accent hover:text-accent-strong">
                Voir la comparaison complète
                <ArrowRight size={16} weight="bold" />
              </Link>
            </Reveal>
            <Reveal delay={0.08} className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr]">
              {/* Pixels a l'echelle, poses sur une vraie image Sentinel-2 du Gabon. */}
              <figure className="relative overflow-hidden rounded-panel shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element -- tuile Sentinel-2 distante */}
                <img src={ESTUARY} alt="" loading="lazy" className="aspect-square w-full object-cover" />
                <div aria-hidden className="absolute left-[18%] top-[18%] size-[64%] rounded-[3px] border-2" style={{ borderColor: SATELLITE_HEX.modis, backgroundColor: `${SATELLITE_HEX.modis}26` }}>
                  <div className="absolute left-0 top-0 size-[37.5%] rounded-[2px] border-2" style={{ borderColor: SATELLITE_HEX.snpp, backgroundColor: `${SATELLITE_HEX.snpp}40` }} />
                </div>
                <figcaption className="absolute inset-x-2 bottom-2 rounded-control bg-surface/90 px-2.5 py-1.5 text-[11.5px] leading-snug text-ink backdrop-blur">
                  <span style={{ color: SATELLITE_HEX.modis }}>■</span> MODIS 1 km · <span style={{ color: SATELLITE_HEX.snpp }}>■</span> VIIRS 375 m
                </figcaption>
              </figure>
              <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-4 shadow-card">
                <p className="text-[12.5px] font-medium text-ink-2">Avant : détections brutes par an</p>
                <RawGapChart months={national.months} colors={{ modis: SATELLITE_HEX.modis, viirs: SATELLITE_HEX.snpp }} />
                <p className="text-[12.5px] font-medium text-ink-2">Après : indice harmonisé par an</p>
                <HarmonizedYears years={national.years} />
              </div>
            </Reveal>
          </div>
        </section>

        {/* 6. Posez votre question. */}
        <section className="mx-auto w-full max-w-[1320px] px-5 py-20 md:px-8 md:py-28">
          <Reveal>
            <AssistantInvite />
          </Reveal>
        </section>
      </main>

      {/* 7. Pied de page vert foret : sources, equipe, statut du projet. */}
      <footer className="bg-forest text-forest-ink">
        <div className="mx-auto grid w-full max-w-[1320px] gap-10 px-5 py-12 md:grid-cols-[1.3fr_1fr_1fr] md:px-8">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark size={30} />
              <span className="text-[17px] font-semibold">{BRAND.name}</span>
            </div>
            <p className="mt-3 text-[14px] text-forest-ink-2">{BRAND.signature}</p>
            <p className="mt-4 max-w-[46ch] text-[13px] leading-relaxed text-forest-ink-2">
              Projet étudiant de l'équipe Hot-Spots, NASA Space Apps Challenge 2026, défi « Harmonization of MODIS and VIIRS Hot Spots ». Ni produit officiel de la NASA, ni service d'alerte :
              une détection est un pixel chaud, pas un incendie confirmé.
            </p>
          </div>
          <nav aria-label="Plateforme">
            <p className="text-[13px] font-medium">Plateforme</p>
            <ul className="mt-3 flex flex-col gap-2 text-[13.5px] text-forest-ink-2">
              {[
                ["Vue d'ensemble", "/dashboard"],
                ["Carte des détections", "/map"],
                ["Calendrier", "/calendar"],
                ["Méthode et limites", "/methodology"],
              ].map(([label, href]) => (
                <li key={href}>
                  <Link href={href} className="underline-offset-4 hover:text-forest-ink hover:underline">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="text-[13px] font-medium">Sources et attributions</p>
            <ul className="mt-3 flex flex-col gap-1.5 text-[12.5px] leading-relaxed text-forest-ink-2">
              <li>Détections : NASA FIRMS (LANCE, ESDIS), consultées le {fmtDate(store.metadata.firms.accessed_last.slice(0, 10))}</li>
              <li>Imagerie : NASA GIBS (Blue Marble, VIIRS, MODIS)</li>
              <li>Sentinel-2 cloudless – s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2023)</li>
              <li>Plan : OpenFreeMap, © contributeurs OpenStreetMap</li>
              <li>Limites : geoBoundaries, Natural Earth ; relief : Mapzen Terrain Tiles</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
