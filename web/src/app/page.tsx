import { ArrowRight, CalendarDots, ChartLineUp, ChatCircleDots, Eye, Flask, GitDiff, Lightbulb, MapTrifold, Scales, ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { AssistantMark, BRAND, BrandMark, Wordmark } from "@/components/brand";
import { AssistantTeaser } from "@/components/landing/assistant-teaser";
import { Reveal } from "@/components/landing/reveal";
import { GabonGrid, HarmonizedYears, HeroOrbit, MiniCalendar, RawGapChart } from "@/components/landing/visuals";
import { buttonClass } from "@/lib/classes";
import { fmt1, fmtDate, fmtInt, fmtPct, MONTHS } from "@/lib/format";
import { calendar } from "@/lib/server/engine";
import { queryGrid, regions } from "@/lib/server/queries";
import { dayToIso, getStore, isoToDay } from "@/lib/server/store";

const PRIMARY = "Explorer la plateforme";

function Section({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto w-full max-w-[1240px] scroll-mt-24 px-5 md:px-8 ${className ?? ""}`}>
      {children}
    </section>
  );
}

function Heading({ title, children, center }: { title: string; children?: React.ReactNode; center?: boolean }) {
  return (
    <div className={center ? "mx-auto max-w-[720px] text-center" : "max-w-[700px]"}>
      <h2 className="text-balance text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink md:text-[40px]">{title}</h2>
      {children ? <p className="mt-4 text-[16.5px] leading-relaxed text-ink-2">{children}</p> : null}
    </div>
  );
}

export default function LandingPage() {
  const store = getStore();
  const national = calendar({ kind: "country" }, store);
  const lastIso = dayToIso(store, store.lastDay);
  const lastYear = Number(lastIso.slice(0, 4));
  const firstYear = Number(dayToIso(store, store.firstDay).slice(0, 4));
  const yearFirst = isoToDay(store, `${lastYear}-01-01`);
  const grid = queryGrid({ kind: "country" }, yearFirst, store.lastDay, store);
  const byProvince = [...regions(yearFirst, store.lastDay, store).regions].sort((a, b) => b.harmonized - a.harmonized);
  const ta = store.harmonization.calibration.TA!;
  const unit = store.harmonization.diagnostics.unit_comparison;
  const flagged = national.months.filter((m) => m.assessment.status === "strong_high" || m.assessment.status === "high");
  const assessed = national.months.filter((m) => !["incomplete", "insufficient"].includes(m.assessment.status)).length;
  const critical = national.criticalMonths.map((m) => MONTHS[m - 1]);
  const staticShare = 1 - store.meta.satellites.reduce((a, s) => a + (s.by_type["0"] ?? 0), 0) / store.n;

  const modules = [
    {
      href: "/map",
      icon: MapTrifold,
      title: "Carte interactive",
      text: "Chaque détection à sa place, capteur par capteur, ou la grille harmonisée de 5 km. Dessinez votre zone, ouvrez la fiche d'un point.",
      visual: <GabonGrid grid={grid} />,
      className: "md:col-span-3 md:row-span-2",
      tone: "bg-surface",
    },
    {
      href: "/calendar",
      icon: CalendarDots,
      title: "Calendrier historique",
      text: `Vingt-cinq ans, mois par mois.${critical.length ? ` La saison active va de ${critical[0]} à ${critical[critical.length - 1]}.` : ""}`,
      visual: <MiniCalendar months={national.months} years={6} />,
      className: "md:col-span-3",
      tone: "bg-[linear-gradient(160deg,#1c2a3a,#10213a_70%)]",
    },
    {
      href: "/trends",
      icon: ChartLineUp,
      title: "Analyses et tendances",
      text: "Totaux annuels, pente robuste et test de significativité, comparaison de deux années.",
      visual: <HarmonizedYears years={national.years} />,
      className: "md:col-span-3",
      tone: "bg-surface",
    },
    {
      href: "/compare",
      icon: GitDiff,
      title: "Comparaison MODIS / VIIRS",
      text: `Deux capteurs, deux échelles : VIIRS signale ${fmt1(unit.raw_detections.factor_global)} fois plus de détections. Voyez ce que l'harmonisation corrige.`,
      visual: <RawGapChart months={national.months} />,
      className: "md:col-span-4",
      tone: "bg-[linear-gradient(160deg,#142b48,#10213a_65%)]",
    },
    {
      href: "/methodology",
      icon: Flask,
      title: "Méthodologie et données",
      text: "Chaque chiffre a sa source, sa date et ses limites.",
      visual: (
        <dl className="grid grid-cols-2 gap-3">
          {(
            [
              [fmtPct(ta.validation.annual_mean_abs_pct_error, 1), "erreur annuelle du calage"],
              [fmtInt(store.meta.sources.length), "fichiers NASA tracés"],
              [fmtInt(store.metadata.rows.rejected), "ligne rejetée au contrôle"],
              [String(store.harmonization.gaps.length), "pannes de capteur relayées"],
            ] as const
          ).map(([v, l]) => (
            <div key={l} className="rounded-[12px] bg-bg/50 p-3">
              <dd className="num text-[20px] font-semibold text-ink">{v}</dd>
              <dt className="mt-0.5 text-[12px] leading-snug text-ink-3">{l}</dt>
            </div>
          ))}
        </dl>
      ),
      className: "md:col-span-2",
      tone: "bg-surface",
    },
  ];

  const steps = [
    {
      icon: Eye,
      verb: "Observer",
      lead: "Collecter les détections satellitaires",
      text: `${fmtInt(store.n)} détections lues dans ${store.meta.sources.length} fichiers NASA FIRMS, de ${firstYear} à ${lastYear}, par quatre satellites. Chaque ligne garde son capteur, sa date et sa source.`,
    },
    {
      icon: Scales,
      verb: "Harmoniser",
      lead: "Rendre les observations comparables",
      text: `Écarter les sources statiques (${fmtPct(staticShare)} des détections), compter les cellules de 5 km actives par jour, convertir MODIS dans l'unité de VIIRS, et n'utiliser qu'un capteur par jour. Aucune activité comptée deux fois.`,
    },
    {
      icon: Lightbulb,
      verb: "Comprendre",
      lead: "Lire les tendances et les écarts",
      text: `Un calendrier continu, des tendances testées, et ${fmtInt(assessed)} mois comparés à leur saison habituelle : ${flagged.length} sortent nettement au-dessus. Des signaux à vérifier, jamais des alertes.`,
    },
  ];

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-10 border-b border-line/60 bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-[68px] w-full max-w-[1240px] items-center justify-between gap-4 px-5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label={`${BRAND.name}, accueil`}>
            <BrandMark size={34} />
            <Wordmark className="text-[19px]" />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-[14px] text-ink-2 lg:flex">
            <a href="#decouvrir" className="hover:text-ink">Fonctionnalités</a>
            <a href="#methode" className="hover:text-ink">Comment ça marche</a>
            <a href="#assistant" className="hover:text-ink">Assistant IA</a>
            <a href="#gabon" className="hover:text-ink">Le Gabon</a>
            <Link href="/methodology" className="hover:text-ink">Méthode</Link>
          </nav>
          <Link href="/dashboard" className={`${buttonClass("primary", "md")} hidden sm:inline-flex`}>
            {PRIMARY}
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-28 pb-24 md:gap-36">
        {/* Hero */}
        <div className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-[radial-gradient(60%_60%_at_70%_20%,rgb(18_191_210/0.10),transparent_70%),radial-gradient(40%_40%_at_20%_80%,rgb(34_160_107/0.08),transparent_70%)]" />
          <Section className="relative grid items-center gap-10 pt-12 md:pt-16 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-6">
            <div className="animate-fade-up">
              <p className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-surface/60 px-3 py-1 text-[12.5px] font-medium text-ink-2">
                <span aria-hidden className="size-1.5 rounded-full bg-ember" />
                Données NASA MODIS et VIIRS, Gabon, {firstYear} à {lastYear}
              </p>
              <h1 className="mt-6 text-[56px] font-semibold leading-[0.98] tracking-[-0.045em] text-ink md:text-[78px]">
                Hot<span className="text-ember">-</span>Spot
              </h1>
              <p className="mt-4 text-[22px] font-medium tracking-[-0.015em] text-ink md:text-[26px]">
                Observer. <span className="text-accent">Comprendre.</span> <span className="text-leaf-ink">Préserver.</span>
              </p>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-ink-2">
                Vingt-cinq ans d'observations satellitaires des feux, rendues comparables et lisibles, avec un assistant pour vous guider.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link href="/dashboard" className={`${buttonClass("primary", "md")} h-12 px-6 text-[15px]`}>
                  {PRIMARY}
                  <ArrowRight size={17} weight="bold" />
                </Link>
                <a href="#decouvrir" className={`${buttonClass("secondary", "md")} h-12 px-6 text-[15px]`}>
                  Découvrir Hot-Spot
                </a>
              </div>
            </div>
            <div className="animate-fade-up [animation-delay:120ms]">
              <HeroOrbit grid={grid} year={lastYear} />
              <p className="-mt-2 text-center text-[12px] text-ink-3">Cellules de 5 km où une activité a été détectée en {lastYear}, calculées sur les fichiers chargés.</p>
            </div>
          </Section>
        </div>

        {/* Chiffres verifies */}
        <Section>
          <Reveal>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-8 lg:grid-cols-4">
              {(
                [
                  [fmtInt(store.n), "détections NASA lues", `${store.meta.sources.length} fichiers, 4 satellites`],
                  [`${lastYear - firstYear + 1} ans`, "de série continue", `jusqu'au ${fmtDate(lastIso)}`],
                  [fmtPct(ta.validation.annual_mean_abs_pct_error, 1), "d'erreur annuelle du calage", "MODIS vers VIIRS, hors échantillon"],
                  [fmtInt(assessed), "mois évalués", `${flagged.length} au-dessus de leur saison`],
                ] as const
              ).map(([value, label, detail]) => (
                <div key={label} className="border-l-2 border-ember/70 pl-4">
                  <dd className="num text-[30px] font-semibold leading-none tracking-[-0.03em] text-ink md:text-[38px]">{value}</dd>
                  <dt className="mt-2 text-[14.5px] text-ink">{label}</dt>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">{detail}</p>
                </div>
              ))}
            </dl>
          </Reveal>
        </Section>

        {/* Fonctionnalites */}
        <Section id="decouvrir" className="flex flex-col gap-10">
          <Reveal>
            <Heading title="Tout ce qu'il faut pour lire l'activité des feux">
              Cinq espaces qui partagent la même zone et la même période. Choisissez un territoire une fois, retrouvez-le partout.
            </Heading>
          </Reveal>
          <div className="grid gap-4 md:auto-rows-[minmax(250px,auto)] md:grid-cols-6">
            {modules.map((m, i) => {
              const Icon = m.icon;
              return (
                <Reveal key={m.href} delay={i * 0.05} className={m.className}>
                  <Link href={m.href} className={`group flex h-full flex-col gap-5 rounded-[22px] p-6 transition-transform duration-300 hover:-translate-y-1 ${m.tone}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="flex size-10 items-center justify-center rounded-[12px] bg-bg/60 text-accent">
                          <Icon size={21} />
                        </span>
                        <h3 className="mt-4 text-[19px] font-semibold tracking-[-0.015em] text-ink">{m.title}</h3>
                        <p className="mt-1.5 max-w-[48ch] text-[14px] leading-relaxed text-ink-2">{m.text}</p>
                      </div>
                      <ArrowRight size={18} className="mt-1 shrink-0 text-ink-3 transition-transform group-hover:translate-x-1 group-hover:text-accent" />
                    </div>
                    <div className="mt-auto">{m.visual}</div>
                  </Link>
                </Reveal>
              );
            })}
          </div>
        </Section>

        {/* Pedagogie */}
        <Section id="methode" className="flex flex-col gap-12">
          <Reveal>
            <Heading title="Des pixels satellitaires à une lecture fiable" center>
              Les satellites ne voient pas des incendies : ils signalent des pixels anormalement chauds. Hot-Spot transforme ces signaux en information exploitable, en trois temps.
            </Heading>
          </Reveal>
          <ol className="relative grid gap-5 md:grid-cols-3">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <Reveal key={s.verb} delay={i * 0.08}>
                  <li className="relative flex h-full flex-col items-start gap-4 rounded-[22px] bg-surface p-6">
                    <span className={`flex size-[60px] items-center justify-center rounded-full border-2 bg-bg ${["border-accent text-accent", "border-ember text-ember", "border-leaf text-leaf-ink"][i]}`}>
                      <Icon size={26} />
                    </span>
                    <div>
                      <h3 className="text-[24px] font-semibold tracking-[-0.02em] text-ink">{s.verb}</h3>
                      <p className="mt-1 text-[14.5px] font-medium text-ink">{s.lead}</p>
                    </div>
                    <p className="text-[14.5px] leading-relaxed text-ink-2">{s.text}</p>
                  </li>
                </Reveal>
              );
            })}
          </ol>
          <Reveal className="flex justify-center">
            <Link href="/methodology" className="group inline-flex items-center gap-1.5 text-[14.5px] font-medium text-accent hover:text-accent-strong">
              Voir tous les chiffres de validation
              <ArrowRight size={15} weight="bold" className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </Section>

        {/* Assistant */}
        <Section id="assistant">
          <Reveal className="grid gap-10 overflow-hidden rounded-[28px] bg-[linear-gradient(140deg,#163152,#10213a_55%,#0f2a2b)] p-7 md:p-12 lg:grid-cols-2 lg:gap-14">
            <div>
              <div className="flex items-center gap-3">
                <AssistantMark size={48} />
                <div>
                  <p className="text-[20px] font-semibold tracking-[-0.02em] text-ink">{BRAND.assistant}</p>
                  <p className="text-[13px] text-ink-3">Votre compagnon d'exploration</p>
                </div>
              </div>
              <h2 className="mt-7 text-balance text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] text-ink md:text-[38px]">Demandez. Il explique, et il agit.</h2>
              <p className="mt-4 max-w-[52ch] text-[16px] leading-relaxed text-ink-2">
                Pas besoin d'être spécialiste de la télédétection. Décrivez ce que vous cherchez : l'assistant règle la carte et la période à votre place, lit les vrais chiffres et vous dit ce qu'ils signifient, avec leurs limites.
              </p>
              <ul className="mt-7 grid gap-4 sm:grid-cols-3">
                {(
                  [
                    [ChatCircleDots, "Expliquer", "Les écrans, les notions, la méthode."],
                    [MapTrifold, "Agir", "Zone, période, carte, comparaison, export."],
                    [ShieldCheck, "Interpréter", "Observé, interprétation, limites."],
                  ] as const
                ).map(([Icon, title, text]) => (
                  <li key={title}>
                    <Icon size={22} className="text-accent" />
                    <p className="mt-2 text-[15px] font-medium text-ink">{title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-ink-3">{text}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-center gap-3">
              <p className="text-[13px] font-medium text-ink-3">Essayez par exemple</p>
              <AssistantTeaser />
              <p className="text-[12.5px] leading-relaxed text-ink-3">
                Les actions sensibles, comme un export, attendent toujours votre confirmation. L'assistant ne présente jamais une détection comme un incendie confirmé, ni un écart comme une prédiction.
              </p>
            </div>
          </Reveal>
        </Section>

        {/* Territoire */}
        <Section id="gabon" className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] lg:gap-16">
          <Reveal className="rounded-[22px] bg-surface p-5 md:p-7">
            <GabonGrid grid={grid} />
            <p className="mt-3 text-[12px] leading-relaxed text-ink-3">Cellules de 0,05° actives en {lastYear}. Plus clair : plus de jours actifs. Limites des provinces : geoBoundaries.</p>
          </Reveal>
          <Reveal delay={0.06}>
            <Heading title="Le Gabon, territoire pilote">
              En {lastYear}, {fmtInt(grid.cells.length)} cellules ont été actives au moins un jour. {byProvince[0].name} concentre à elle seule {fmtPct(byProvince[0].share)} de l'indice.
            </Heading>
            <ul className="mt-6 flex flex-col">
              {byProvince.slice(0, 4).map((r) => (
                <li key={r.index} className="flex items-center gap-4 border-t border-line py-3 text-[14.5px]">
                  <span className="w-[140px] shrink-0 text-ink">{r.name}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full">
                    <span className="block h-full rounded-full bg-ember" style={{ width: `${(r.share / byProvince[0].share) * 100}%` }} />
                  </span>
                  <span className="num w-[52px] text-right text-ink-2">{fmtPct(r.share)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[14px] leading-relaxed text-ink-3">
              Le choix du pays est un cas d'usage. Hot-Spot n'attribue aucune cause aux feux, et la même méthode s'applique à tout territoire couvert par FIRMS.
            </p>
          </Reveal>
        </Section>

        {/* Appel final */}
        <Section>
          <Reveal className="flex flex-col items-start justify-between gap-6 rounded-[28px] border border-line-strong p-8 md:flex-row md:items-center md:p-12">
            <div>
              <h2 className="text-[28px] font-semibold tracking-[-0.025em] text-ink md:text-[34px]">Prêt à explorer ?</h2>
              <p className="mt-2 max-w-[56ch] text-[15.5px] leading-relaxed text-ink-2">Commencez par l'année {lastYear} pour le pays entier. Une visite guidée vous attend à la première visite.</p>
            </div>
            <Link href="/dashboard" className={`${buttonClass("primary", "md")} h-12 shrink-0 px-6 text-[15px]`}>
              {PRIMARY}
              <ArrowRight size={17} weight="bold" />
            </Link>
          </Reveal>
        </Section>
      </main>

      <footer className="border-t border-line bg-bg-deep">
        <div className="mx-auto grid w-full max-w-[1240px] gap-10 px-5 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <BrandMark size={32} />
              <Wordmark className="text-[18px]" />
            </div>
            <p className="mt-3 text-[14px] text-ink-2">{BRAND.signature}</p>
            <p className="mt-3 max-w-[38ch] text-[12.5px] leading-relaxed text-ink-3">
              Projet étudiant indépendant, NASA Space Apps Challenge 2026, défi « Harmonization of MODIS and VIIRS Hot Spots ». Ni produit officiel de la NASA, ni service d'alerte incendie.
            </p>
          </div>
          {(
            [
              ["Explorer", [["Vue d'ensemble", "/dashboard"], ["Carte des détections", "/map"], ["Calendrier", "/calendar"], ["Périodes inhabituelles", "/anomalies"]]],
              ["Comprendre", [["Analyses et tendances", "/trends"], ["Comparaison MODIS / VIIRS", "/compare"], ["Méthode et données", "/methodology"], ["Rapports et exports", "/reports"]]],
            ] as const
          ).map(([title, links]) => (
            <nav key={title} aria-label={title}>
              <p className="text-[13px] font-medium text-ink">{title}</p>
              <ul className="mt-3 flex flex-col gap-2 text-[13.5px]">
                {links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="text-ink-3 hover:text-ink">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div>
            <p className="text-[13px] font-medium text-ink">Crédits</p>
            <ul className="mt-3 flex flex-col gap-2 text-[13px] leading-relaxed text-ink-3">
              <li>Détections : NASA FIRMS (LANCE, ESDIS)</li>
              <li>Limites : geoBoundaries, CC BY-SA 3.0</li>
              <li>Fond de carte facultatif : NASA GIBS</li>
              <li>Données consultées le {fmtDate(store.metadata.firms.accessed_last.slice(0, 10))}</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
