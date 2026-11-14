import { ArrowRight, CalendarDots, ChartLineUp, FileText, Flask, MapTrifold, WarningDiamond } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { Reveal } from "@/components/landing/reveal";
import { GabonGrid, HarmonizedYears, HeroCalendar, RawGapChart, SeasonBars } from "@/components/landing/visuals";
import { Logo } from "@/components/shell/shell";
import { StatusBadge } from "@/components/ui";
import { buttonClass } from "@/lib/classes";
import { fmt1, fmtDate, fmtDateShort, fmtDelta, fmtInt, fmtPct, MONTHS, monthLabel } from "@/lib/format";
import { calendar } from "@/lib/server/engine";
import { queryGrid, regions } from "@/lib/server/queries";
import { dayToIso, getStore, isoToDay } from "@/lib/server/store";

const CTA = "Ouvrir le tableau de bord";

function Section({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1240px] scroll-mt-20 px-5 md:px-8 ${className ?? ""}`}>
      {children}
    </section>
  );
}

function Heading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="max-w-[720px]">
      <h2 className="text-balance text-[28px] font-semibold leading-[1.12] tracking-[-0.025em] text-ink md:text-[36px]">{title}</h2>
      {children ? <p className="mt-4 text-[16px] leading-relaxed text-ink-2">{children}</p> : null}
    </div>
  );
}

export default function LandingPage() {
  const store = getStore();
  const national = calendar({ kind: "country" }, store);
  const lastIso = dayToIso(store, store.lastDay);
  const lastYear = Number(lastIso.slice(0, 4));
  const yearFirst = isoToDay(store, `${lastYear}-01-01`);
  const grid = queryGrid({ kind: "country" }, yearFirst, store.lastDay, store);
  const byProvince = [...regions(yearFirst, store.lastDay, store).regions].sort((a, b) => b.harmonized - a.harmonized);
  const ta = store.harmonization.calibration.TA!;
  const unit = store.harmonization.diagnostics.unit_comparison;
  const firstYear = Number(dayToIso(store, store.firstDay).slice(0, 4));
  const flagged = national.months.filter((m) => m.assessment.status === "strong_high" || m.assessment.status === "high");
  const latestFlag = flagged[flagged.length - 1];
  const assessed = national.months.filter((m) => !["incomplete", "insufficient"].includes(m.assessment.status)).length;
  const completeYears = national.years.filter((y) => y.complete);
  const topYear = [...completeYears].sort((a, b) => b.harmonized - a.harmonized)[0];
  const critical = national.criticalMonths.map((m) => MONTHS[m - 1]);

  const figures: [string, string, string][] = [
    [fmtInt(store.n), "détections NASA FIRMS lues", `${store.meta.sources.length} fichiers annuels, 4 satellites`],
    [`${lastYear - firstYear + 1} ans`, "de série continue", `du ${fmtDateShort(dayToIso(store, store.firstDay))} au ${fmtDateShort(lastIso)}`],
    [fmtPct(ta.validation.annual_mean_abs_pct_error, 1), "d'erreur annuelle du calage", "MODIS vers VIIRS, mesurée hors échantillon"],
    [fmtInt(assessed), "mois évalués", `${flagged.length} au-dessus de leur référence saisonnière`],
  ];

  const steps: [string, string][] = [
    ["Filtrer", `Seules les détections classées « feu de végétation présumé » et de confiance non faible entrent dans l'indice. Les sources statiques, par exemple des torchères, soit ${fmtPct(1 - store.meta.satellites.reduce((a, s) => a + (s.by_type["0"] ?? 0), 0) / store.n)} des détections, sont écartées.`],
    ["Compter", "Une cellule de 0,05° compte une fois par jour où elle est active, quel que soit le nombre de pixels signalés. Un même feu ne pèse pas dix fois plus parce que le capteur est plus fin."],
    ["Caler", `Sur les années communes ${ta.overlap_first_year} à ${ta.overlap_last_year}, MODIS est converti en équivalent VIIRS, mois par mois, puis le facteur est ajusté à chaque zone. L'erreur est mesurée en retirant une année à la fois.`],
    ["Relayer", "Chaque jour est alimenté par un seul capteur : VIIRS dès qu'il observe, MODIS calé avant 2012. Aucun total MODIS plus VIIRS n'est calculé, donc aucune activité n'est comptée deux fois."],
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-4 px-5 md:px-8">
          <Logo />
          <nav aria-label="Sections" className="hidden items-center gap-6 text-[13.5px] text-ink-2 lg:flex">
            <a href="#probleme" className="hover:text-ink">Le problème</a>
            <a href="#methode" className="hover:text-ink">La méthode</a>
            <a href="#plateforme" className="hover:text-ink">La plateforme</a>
            <a href="#gabon" className="hover:text-ink">Le Gabon</a>
            <a href="#sources" className="hover:text-ink">Sources</a>
          </nav>
          <Link href="/dashboard" className={buttonClass("primary", "md")}>
            {CTA}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-24 pb-24 md:gap-32">
        {/* Hero */}
        <Section className="grid items-center gap-10 pt-12 md:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="animate-fade-up">
            <p className="text-[13px] font-medium text-accent">NASA Space Apps Challenge 2026 · Harmonisation MODIS et VIIRS</p>
            <h1 className="mt-4 text-balance text-[38px] font-semibold leading-[1.05] tracking-[-0.035em] text-ink md:text-[54px]">Vingt-cinq ans de feux détectés, une seule mesure.</h1>
            <p className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-ink-2">
              Gabon FirePulse harmonise les détections MODIS et VIIRS de la NASA en un calendrier continu, de {firstYear} à {lastYear}.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className={`${buttonClass("primary", "md")} h-11 px-5 text-[14.5px]`}>
                {CTA}
                <ArrowRight size={16} weight="bold" />
              </Link>
              <Link href="/methodology" className={`${buttonClass("secondary", "md")} h-11 px-5 text-[14.5px]`}>
                Lire la méthode
              </Link>
            </div>
          </div>
          <div className="animate-fade-up rounded-panel border border-line bg-surface p-4 [animation-delay:120ms] md:p-5">
            <HeroCalendar months={national.months} />
            <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
              Indice harmonisé mensuel pour le Gabon, calculé sur les fichiers chargés. Plus clair : plus d'activité détectée. Hachures : valeur estimée depuis MODIS, avant l'arrivée de VIIRS.
            </p>
          </div>
        </Section>

        {/* Chiffres verifies */}
        <Section>
          <Reveal>
            <dl className="grid grid-cols-2 gap-y-8 border-y border-line py-8 lg:grid-cols-4 lg:divide-x lg:divide-line">
              {figures.map(([value, label, detail]) => (
                <div key={label} className="px-1 lg:px-6 lg:first:pl-0">
                  <dd className="num text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink md:text-[36px]">{value}</dd>
                  <dt className="mt-2 text-[14px] text-ink">{label}</dt>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">{detail}</p>
                </div>
              ))}
            </dl>
          </Reveal>
        </Section>

        {/* Probleme */}
        <Section id="probleme" className="flex flex-col gap-10">
          <Reveal>
            <Heading title="Deux capteurs qui ne comptent pas la même chose">
              MODIS observe depuis 2000 avec des pixels de 1 km. VIIRS a pris le relais en 2012 avec des pixels de 375 m, plus sensibles. Au Gabon, VIIRS signale environ {fmt1(unit.raw_detections.factor_global)} fois plus de détections pour la même activité. Lire les deux séries bout à bout ferait croire à une explosion des feux en 2012.
            </Heading>
          </Reveal>
          <div className="grid gap-5 lg:grid-cols-2">
            <Reveal className="flex flex-col rounded-panel border border-line bg-surface p-5">
              <h3 className="text-[15px] font-medium text-ink">Détections retenues par an, sans harmonisation</h3>
              <p className="mt-1 text-[13px] text-ink-3">Carrés : MODIS. Disques : VIIRS Suomi-NPP. Mêmes années, même territoire.</p>
              <div className="mt-4 flex-1">
                <RawGapChart months={national.months} />
              </div>
            </Reveal>
            <Reveal delay={0.08} className="flex flex-col rounded-panel border border-line bg-surface p-5">
              <h3 className="text-[15px] font-medium text-ink">Indice harmonisé annuel</h3>
              <p className="mt-1 text-[13px] text-ink-3">Cellules-jour actives, en équivalent VIIRS. Barres hachurées : estimées depuis MODIS.</p>
              <div className="mt-4 flex flex-1 flex-col justify-end">
                <HarmonizedYears years={national.years} />
              </div>
              <p className="mt-3 border-t border-line pt-3 text-[13px] leading-relaxed text-ink-2">
                La série devient lisible d'un bout à l'autre{topYear ? ` : l'année complète la plus active est ${topYear.year}, avec ${fmtInt(topYear.harmonized)} cellules-jour` : ""}.
                {national.trends.full ? ` Sur ${national.trends.full.n} années, le test de Mann-Kendall donne une valeur p de ${national.trends.full.pValue.toFixed(2).replace(".", ",")}.` : ""}
              </p>
            </Reveal>
          </div>
        </Section>

        {/* Methode */}
        <Section id="methode" className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-16">
          <Reveal className="lg:sticky lg:top-28 lg:self-start">
            <Heading title="Une harmonisation que l'on peut vérifier">Quatre règles simples, appliquées de la même façon à tout le pays, à une province ou à une zone dessinée sur la carte.</Heading>
            <Link href="/methodology" className="group mt-6 inline-flex items-center gap-1.5 text-[14px] font-medium text-accent hover:text-accent-strong">
              Tous les chiffres de validation
              <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
          <ol className="flex flex-col">
            {steps.map(([verb, text], i) => (
              <Reveal key={verb} delay={i * 0.05}>
                <li className="grid grid-cols-[92px_minmax(0,1fr)] gap-4 border-t border-line py-6 first:border-t-0 first:pt-0 md:grid-cols-[130px_minmax(0,1fr)]">
                  <h3 className="text-[20px] font-semibold tracking-[-0.02em] text-ink md:text-[22px]">{verb}</h3>
                  <p className="text-[15px] leading-relaxed text-ink-2">{text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </Section>

        {/* Plateforme */}
        <Section id="plateforme" className="flex flex-col gap-10">
          <Reveal>
            <Heading title="De la détection brute à une lecture exploitable">Choisissez une zone et une période. Chaque écran répond à une question, cite ses sources et affiche ses limites.</Heading>
          </Reveal>
          <div className="grid gap-5 md:grid-cols-6">
            <Reveal className="md:col-span-4">
              <Link href="/calendar" className="group flex h-full flex-col justify-between gap-6 rounded-panel border border-line bg-surface p-6 transition-colors hover:border-line-strong">
                <div>
                  <CalendarDots size={22} className="text-accent" />
                  <h3 className="mt-3 text-[18px] font-medium text-ink">Calendrier d'activité</h3>
                  <p className="mt-1.5 max-w-[52ch] text-[14px] leading-relaxed text-ink-2">
                    Par jour, semaine, mois ou année. {critical.length ? `Au Gabon, ${critical.join(", ")} concentrent 80 % de l'activité médiane.` : ""}
                  </p>
                </div>
                <SeasonBars baselines={national.baselines} />
              </Link>
            </Reveal>
            <Reveal delay={0.05} className="md:col-span-2">
              <Link href="/anomalies" className="group flex h-full flex-col gap-4 rounded-panel border border-line bg-[linear-gradient(160deg,#1a1420,#0f1626_60%)] p-6 transition-colors hover:border-line-strong">
                <WarningDiamond size={22} className="text-warning" />
                <h3 className="text-[18px] font-medium text-ink">Périodes inhabituelles</h3>
                <p className="text-[14px] leading-relaxed text-ink-2">Un écart à la saison habituelle, avec sa référence, son score et sa fiabilité. Jamais une prédiction.</p>
                {latestFlag ? (
                  <div className="mt-auto rounded-control border border-line bg-bg/50 p-3">
                    <p className="text-[13px] font-medium capitalize text-ink">{monthLabel(latestFlag.month, latestFlag.year)}</p>
                    <p className="num mt-1 text-[12.5px] text-ink-2">
                      {fmtInt(latestFlag.harmonized)} pour une médiane de {fmtInt(latestFlag.assessment.median)} ({latestFlag.assessment.median ? fmtDelta(latestFlag.harmonized, latestFlag.assessment.median) : ""})
                    </p>
                    <div className="mt-2">
                      <StatusBadge status={latestFlag.assessment.status} />
                    </div>
                  </div>
                ) : null}
              </Link>
            </Reveal>
            <Reveal className="md:col-span-2">
              <Link href="/map" className="group flex h-full flex-col gap-3 rounded-panel border border-line bg-surface p-6 transition-colors hover:border-line-strong">
                <MapTrifold size={22} className="text-accent" />
                <h3 className="text-[18px] font-medium text-ink">Carte des détections</h3>
                <p className="text-[14px] leading-relaxed text-ink-2">Points natifs par capteur ou grille harmonisée. Dessinez une zone, ouvrez la fiche d'une détection, remontez jusqu'à sa ligne dans le fichier NASA.</p>
              </Link>
            </Reveal>
            <Reveal delay={0.05} className="md:col-span-2">
              <Link href="/trends" className="group flex h-full flex-col gap-3 rounded-panel border border-line bg-surface p-6 transition-colors hover:border-line-strong">
                <ChartLineUp size={22} className="text-accent" />
                <h3 className="text-[18px] font-medium text-ink">Tendances</h3>
                <p className="text-[14px] leading-relaxed text-ink-2">Série mensuelle depuis {firstYear}, pente robuste, comparaison de deux années, et la démonstration de ce que le calage corrige.</p>
              </Link>
            </Reveal>
            <Reveal delay={0.1} className="md:col-span-2">
              <div className="flex h-full flex-col gap-3 rounded-panel border border-line bg-surface p-6">
                <FileText size={22} className="text-accent" />
                <h3 className="text-[18px] font-medium text-ink">Rapports et méthode</h3>
                <p className="text-[14px] leading-relaxed text-ink-2">Synthèse en PDF, exports CSV et GeoJSON fidèles aux filtres, et une page qui expose chaque hypothèse.</p>
                <div className="mt-auto flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] font-medium">
                  <Link href="/reports" className="text-accent hover:text-accent-strong">
                    Rapports
                  </Link>
                  <Link href="/methodology" className="inline-flex items-center gap-1 text-accent hover:text-accent-strong">
                    <Flask size={15} />
                    Méthode
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </Section>

        {/* Territoire */}
        <Section id="gabon" className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
          <Reveal className="rounded-panel border border-line bg-surface p-4 md:p-6">
            <GabonGrid grid={grid} />
            <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-ink-3">
              Cellules de 0,05° où une activité a été détectée en {lastYear}. Plus clair : plus de jours actifs. Limites des provinces : geoBoundaries.
            </p>
          </Reveal>
          <Reveal delay={0.06}>
            <Heading title="Le Gabon comme terrain d'essai">
              L'activité détectée n'est pas répartie uniformément. En {lastYear}, {fmtInt(grid.cells.length)} cellules ont été actives au moins un jour, et {byProvince[0].name} porte à elle seule {fmtPct(byProvince[0].share)} de l'indice.
            </Heading>
            <ul className="mt-6 flex flex-col">
              {byProvince.slice(0, 4).map((r) => (
                <li key={r.index} className="flex items-baseline justify-between gap-4 border-t border-line py-2.5 text-[14px]">
                  <span className="text-ink">{r.name}</span>
                  <span className="num text-ink-2">
                    {fmtPct(r.share)} <span className="text-ink-3">de l'indice {lastYear}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[14px] leading-relaxed text-ink-3">
              Le choix du pays est un cas d'usage. La plateforme ne suppose pas que le feu cause la perte de forêt et n'attribue aucune cause. La même méthode s'applique à tout territoire couvert par FIRMS.
            </p>
          </Reveal>
        </Section>

        {/* Sources et limites */}
        <Section id="sources" className="grid gap-10 border-t border-line pt-14 lg:grid-cols-2 lg:gap-16">
          <Reveal>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Sources</h2>
            <div className="mt-4 flex flex-col gap-3 text-[14.5px] leading-relaxed text-ink-2">
              <p>
                Détections : NASA FIRMS, archives annuelles par pays, produits MODIS (Terra, Aqua) et VIIRS 375 m (Suomi-NPP, NOAA-20). Fichiers téléchargés le {fmtDate(store.metadata.firms.accessed_last.slice(0, 10))} et lus localement : l'application fonctionne sans connexion.
              </p>
              <p>Limites administratives : geoBoundaries. Fond de carte facultatif : NASA GIBS, Blue Marble.</p>
              <p>Chaque fichier garde son adresse, sa date d'accès et son empreinte. Chaque détection exportée renvoie à sa ligne d'origine.</p>
            </div>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Ce que ces données ne disent pas</h2>
            <div className="mt-4 flex flex-col gap-3 text-[14.5px] leading-relaxed text-ink-2">
              <p>Une détection est le centre d'un pixel signalé comme anomalie thermique. Ce n'est ni un incendie confirmé, ni une surface brûlée, ni une cause.</p>
              <p>Les nuages cachent des feux : une valeur nulle signifie « aucune détection », pas « aucun feu ». Les valeurs d'avant 2012 sont des estimations, avec une incertitude affichée.</p>
              <p>L'archive s'arrête au {fmtDate(lastIso)}. Ce n'est pas du temps réel, et ce n'est pas un système d'alerte.</p>
            </div>
          </Reveal>
        </Section>

        {/* Appel final */}
        <Section>
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-panel border border-line bg-[linear-gradient(120deg,#151e33,#0f1626)] p-8 md:flex-row md:items-center md:p-10">
            <div>
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-ink md:text-[28px]">Explorer les données</h2>
              <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-ink-2">Commencez par l'année {lastYear} pour le pays entier, puis resserrez sur une province ou une saison.</p>
            </div>
            <Link href="/dashboard" className={`${buttonClass("primary", "md")} h-11 shrink-0 px-5 text-[14.5px]`}>
              {CTA}
              <ArrowRight size={16} weight="bold" />
            </Link>
          </Reveal>
        </Section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-3 px-5 py-8 text-[12.5px] leading-relaxed text-ink-3 md:flex-row md:items-start md:justify-between md:px-8">
          <p className="max-w-[70ch]">
            Projet étudiant indépendant réalisé pour le NASA Space Apps Challenge 2026, défi « Harmonization of MODIS and VIIRS Hot Spots ». Gabon FirePulse n'est ni un produit officiel de la NASA ni un service opérationnel d'alerte incendie.
          </p>
          <p className="shrink-0">Données : NASA FIRMS. Limites : geoBoundaries.</p>
        </div>
      </footer>
    </div>
  );
}
