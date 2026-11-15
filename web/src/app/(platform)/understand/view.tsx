"use client";

import { ArrowRight, CheckCircle, Cloud, Clock, Fire, Flask, MapPin, Question, GlobeHemisphereEast as Satellite, Thermometer, XCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

import { PageHeader, Panel, PanelHeader, StatusBadge, buttonClass, cx } from "@/components/ui";
import { useMetadata } from "@/lib/api";
import { fmtInt } from "@/lib/format";
import { DEFINITIONS, SATELLITES } from "@/lib/labels";

/**
 * Ecran pedagogique (exigence F-13, profil "etudiant / grand public averti" du cahier des charges) :
 * ce que mesurent les satellites, ce qu'ils ne prouvent pas, et comment lire les indicateurs.
 */
export function UnderstandView() {
  const { data: meta } = useMetadata();
  const count = (keys: string[]) => (meta ? meta.satellites.filter((s) => keys.includes(s.key)).reduce((a, s) => a + s.detections, 0) : null);
  const modis = count(["terra", "aqua"]);
  const viirs = count(["snpp", "noaa20"]);

  return (
    <>
      <PageHeader
        title="Comprendre les données"
        lead="Ce qu'un satellite voit, ce qu'il ne prouve pas, et comment lire les indicateurs de l'application. Deux minutes de lecture avant d'interpréter un chiffre."
      />

      <Steps />
      <Ladder />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Deux capteurs, deux tailles de pixel" subtitle="Pourquoi on ne peut pas comparer directement les nombres de détections." />
          <div className="grid grid-cols-1 items-center gap-6 px-5 pb-5 pt-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <PixelFigure />
            <div className="flex flex-col gap-3 text-[13.5px] leading-relaxed text-ink-2">
              <p>
                Un pixel <span className="font-medium text-ink">MODIS</span> couvre 1 km de côté. Un pixel <span className="font-medium text-ink">VIIRS</span> fait 375 m : environ sept
                pixels VIIRS tiennent dans un pixel MODIS.
              </p>
              <p>
                Un même feu peut donc produire une détection MODIS et plusieurs détections VIIRS. Au Gabon, l&apos;archive compte{" "}
                <span className="num text-ink">{modis === null ? "…" : fmtInt(modis)}</span> détections MODIS et <span className="num text-ink">{viirs === null ? "…" : fmtInt(viirs)}</span>{" "}
                détections VIIRS, sans que les feux soient plus nombreux.
              </p>
              <p className="rounded-control bg-accent/[0.07] px-3 py-2.5 text-ink">
                L&apos;application compte plutôt des <span className="font-medium">cellules-jour</span> : une case de 5,5 km est « active » un jour donné si au moins un pixel y a été signalé,
                quel que soit le capteur et le nombre de pixels.
              </p>
            </div>
          </div>
        </Panel>

        <Panel>
          <PanelHeader title="Lire une période inhabituelle" subtitle="Chaque mois est comparé au même mois des autres années, dans la même zone." />
          <div className="px-5 pb-2 pt-4">
            <AnomalyFigure />
          </div>
          <ul className="flex flex-col gap-2.5 px-5 pb-5 pt-2 text-[13px] leading-relaxed text-ink-2">
            <li className="flex items-start gap-3">
              <span className="w-[120px] shrink-0">
                <StatusBadge status="normal" />
              </span>
              La valeur tombe dans la plage habituelle des autres années.
            </li>
            <li className="flex items-start gap-3">
              <span className="w-[120px] shrink-0">
                <StatusBadge status="high" />
              </span>
              Nettement au-dessus de l&apos;habitude. Un signal à vérifier : activité réelle, conditions d&apos;observation, changement de capteur.
            </li>
            <li className="flex items-start gap-3">
              <span className="w-[120px] shrink-0">
                <StatusBadge status="insufficient" />
              </span>
              Moins de dix années de référence : aucun diagnostic n&apos;est donné, plutôt qu&apos;un diagnostic fragile.
            </li>
          </ul>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Une absence de détection n'est pas une absence de feu" subtitle="Trois raisons pour lesquelles un feu peut ne pas apparaître." />
        <div className="grid grid-cols-1 gap-3 px-5 pb-5 pt-4 md:grid-cols-3">
          {[
            { icon: Cloud, title: "Les nuages et la fumée", text: "Le capteur thermique ne voit pas à travers une couverture nuageuse dense, fréquente en saison des pluies au Gabon." },
            { icon: Clock, title: "L'heure de passage", text: "Chaque satellite passe environ deux fois par jour. Un feu bref, allumé et éteint entre deux passages, n'est pas vu." },
            { icon: Fire, title: "La taille et l'intensité", text: "Un petit feu ou un feu de sous-bois peu chaud peut rester sous le seuil de détection, surtout pour MODIS." },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-control border border-line bg-surface-2 p-4">
              <Icon size={22} weight="duotone" className="text-accent" />
              <p className="mt-2 text-[14px] font-medium text-ink">{title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{text}</p>
            </div>
          ))}
        </div>
      </Panel>

      <Glossary />

      <Panel className="flex flex-col items-start justify-between gap-4 px-5 py-5 md:flex-row md:items-center">
        <div>
          <p className="text-[15px] font-medium text-ink">Prêt à explorer ?</p>
          <p className="mt-1 text-[13px] text-ink-3">Le détail des calculs, la validation du calage et toutes les sources sont dans l&apos;écran Méthode.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/methodology" className={buttonClass("secondary")}>
            <Flask size={16} /> Méthode détaillée
          </Link>
          <Link href="/dashboard" className={buttonClass("primary")}>
            Ouvrir le tableau de bord <ArrowRight size={15} weight="bold" />
          </Link>
        </div>
      </Panel>
    </>
  );
}

/* ------------------------------------------------------------------ De la chaleur a la detection */

function Steps() {
  const steps = [
    { icon: Satellite, title: "Le satellite passe", text: `MODIS (${SATELLITES.terra.name}, ${SATELLITES.aqua.name}) depuis 2000, VIIRS (Suomi-NPP, NOAA-20) depuis 2012. Chacun survole le Gabon environ deux fois par jour.` },
    { icon: Thermometer, title: "Un pixel est anormalement chaud", text: "L'algorithme compare chaque pixel à ses voisins dans l'infrarouge. Un écart marqué devient une anomalie thermique." },
    { icon: MapPin, title: "Une détection est enregistrée", text: "Le point publié est le centre du pixel, avec une date, une heure, une confiance et une puissance radiative (FRP)." },
    { icon: Question, title: "Ce qui reste inconnu", text: "La cause, la surface brûlée, la position exacte du feu, ou même s'il s'agit d'un feu de végétation plutôt que d'une torchère." },
  ];
  return (
    <Panel>
      <PanelHeader title="De la chaleur à la détection" subtitle="Ce que contient réellement un point sur la carte." />
      <ol className="grid grid-cols-1 gap-3 px-5 pb-5 pt-4 sm:grid-cols-2 xl:grid-cols-4">
        {steps.map(({ icon: Icon, title, text }, i) => (
          <li key={title} className={cx("relative rounded-control border p-4", i === 3 ? "border-dashed border-line-strong" : "border-line bg-surface-2")}>
            <div className="flex items-center gap-2.5">
              <span className="num flex size-7 items-center justify-center rounded-full bg-accent text-[12px] font-semibold text-accent-ink">{i + 1}</span>
              <Icon size={20} weight="duotone" className={i === 3 ? "text-ink-3" : "text-accent"} />
            </div>
            <p className="mt-3 text-[14px] font-medium text-ink">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{text}</p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Echelle de certitude (F-13) */

function Ladder() {
  const levels = [
    {
      title: "Détection satellite",
      text: DEFINITIONS.detection,
      app: true,
      note: "Montrée sur la carte, avec sa fiche et sa source.",
    },
    {
      title: "Activité de feu",
      text: "Plusieurs détections regroupées dans l'espace et dans le temps. L'application la mesure en cellules-jour, sans prétendre compter des feux uniques.",
      app: true,
      note: "Calendrier, tendances et périodes inhabituelles.",
    },
    {
      title: "Incendie confirmé",
      text: "Un feu vérifié sur le terrain ou par une source indépendante, avec sa cause et sa surface. Les satellites seuls ne le permettent pas.",
      app: false,
      note: "Hors du périmètre de l'application.",
    },
  ];
  return (
    <Panel>
      <PanelHeader title="Détection, activité, incendie : trois niveaux de certitude" subtitle="L'application s'arrête aux deux premiers. Elle ne confirme aucun incendie." />
      <ol className="grid grid-cols-1 gap-0 px-5 pb-5 pt-4 md:grid-cols-3">
        {levels.map((level, i) => (
          <li key={level.title} className="relative flex flex-col md:pr-6">
            <div className="flex items-center gap-3">
              <span
                className={cx(
                  "flex size-9 shrink-0 items-center justify-center rounded-full border-2",
                  level.app ? "border-accent bg-accent/10 text-accent" : "border-dashed border-line-strong text-ink-3",
                )}
              >
                <span className="num text-[13px] font-semibold">{i + 1}</span>
              </span>
              {i < levels.length - 1 ? <span aria-hidden className="hidden h-0.5 flex-1 bg-[linear-gradient(90deg,var(--color-accent),var(--color-line-strong))] md:block" /> : null}
            </div>
            <p className="mt-3 text-[15px] font-medium text-ink">{level.title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{level.text}</p>
            <p className={cx("mt-3 flex items-center gap-1.5 pb-5 text-[12.5px] font-medium md:pb-0", level.app ? "text-good" : "text-ink-3")}>
              {level.app ? <CheckCircle size={15} weight="fill" /> : <XCircle size={15} weight="fill" />}
              {level.note}
            </p>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

/* ------------------------------------------------------------------ Figures */

/** Un pixel MODIS de 1 km et la grille VIIRS de 375 m a la meme echelle. */
function PixelFigure() {
  const S = 160; // 1 km
  const v = (S * 375) / 1000;
  const cells = [];
  for (let y = 0; y * v < S; y++) for (let x = 0; x * v < S; x++) cells.push([x, y]);
  return (
    <figure className="flex flex-col items-center gap-2">
      <svg viewBox={`-4 -4 ${S + 8} ${S + 8}`} width={S + 8} height={S + 8} role="img" aria-label="Un pixel MODIS de 1 km contient environ sept pixels VIIRS de 375 m">
        <defs>
          <clipPath id="px-clip">
            <rect x="0" y="0" width={S} height={S} />
          </clipPath>
        </defs>
        <rect x="0" y="0" width={S} height={S} fill="color-mix(in srgb, var(--color-modis, #d95926) 10%, transparent)" stroke="#d95926" strokeWidth="2.5" />
        <g clipPath="url(#px-clip)">
          {cells.map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x * v + 1.5} y={y * v + 1.5} width={v - 3} height={v - 3} rx="2" fill="#3987e5" fillOpacity={x === 1 && y === 1 ? 0.85 : 0.18} stroke="#3987e5" strokeOpacity="0.5" />
          ))}
        </g>
      </svg>
      <figcaption className="flex flex-col items-center gap-1 text-[11.5px] text-ink-3">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[2px] border-2 border-[#d95926]" /> MODIS, 1 km
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-[2px] bg-[#3987e5]" /> VIIRS, 375 m
        </span>
      </figcaption>
    </figure>
  );
}

/** Une serie mensuelle schematique : la plage habituelle, la mediane et un mois au-dessus. */
function AnomalyFigure() {
  const W = 520;
  const H = 150;
  const months = 12;
  const x = (i: number) => 24 + (i * (W - 48)) / (months - 1);
  const med = [20, 34, 38, 28, 24, 40, 70, 96, 64, 22, 12, 14];
  const lo = med.map((m) => m * 0.75);
  const hi = med.map((m) => m * 1.25);
  const obs = [18, 36, 35, 30, 22, 44, 74, 92, 62, 52, 13, 15];
  const y = (v: number) => H - 20 - v * 1.15;
  const band = [...hi.map((v, i) => `${x(i)},${y(v)}`), ...lo.map((v, i) => `${x(i)},${y(v)}`).reverse()].join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Exemple : en octobre, la valeur observée sort nettement de la plage habituelle">
      <polygon points={band} fill="var(--color-accent)" fillOpacity="0.12" />
      <polyline points={med.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--color-ink-3)" strokeWidth="1.5" strokeDasharray="4 3" />
      <polyline points={obs.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="var(--color-ink)" strokeWidth="2" />
      {obs.map((v, i) => (
        <circle key={i} cx={x(i)} cy={y(v)} r={i === 9 ? 6 : 3} fill={i === 9 ? "var(--color-surface)" : "var(--color-ink)"} stroke={i === 9 ? "var(--color-critical)" : "none"} strokeWidth="2.5" />
      ))}
      <text x={x(9) + 10} y={y(52) - 8} fontSize="11.5" fill="var(--color-critical)" fontWeight="600">
        Supérieure
      </text>
      <text x={x(7) - 6} y={y(hi[7]) - 8} fontSize="11" fill="var(--color-ink-3)" textAnchor="middle">
        plage habituelle
      </text>
      {["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map((m, i) => (
        <text key={i} x={x(i)} y={H - 4} fontSize="10.5" fill="var(--color-ink-3)" textAnchor="middle" fontFamily="var(--font-mono)">
          {m}
        </text>
      ))}
    </svg>
  );
}

/* ------------------------------------------------------------------ Glossaire */

function Glossary() {
  const terms: [string, string][] = [
    ["Détection", DEFINITIONS.detection],
    ["Anomalie thermique", "Pixel nettement plus chaud que son environnement dans l'infrarouge. C'est ce que l'algorithme de détection repère."],
    ["Confiance", "Degré de certitude donné par le produit : un pourcentage pour MODIS, trois classes (faible, nominale, élevée) pour VIIRS. Les deux échelles ne sont pas converties l'une dans l'autre."],
    ["FRP", "Fire Radiative Power, puissance rayonnée par le pixel, en mégawatts. Elle renseigne sur l'intensité, pas sur la surface brûlée."],
    ["Détection retenue", DEFINITIONS.eligible],
    ["Cellule-jour", "Une case de 0,05° (environ 5,5 km) un jour donné. Elle est active si au moins une détection retenue y tombe ce jour-là."],
    ["Indice harmonisé", DEFINITIONS.index],
    ["Calage", "Conversion des valeurs MODIS en équivalent VIIRS, apprise sur les années où les deux capteurs observent ensemble (2012 à 2025)."],
    ["Période inhabituelle", DEFINITIONS.anomaly],
    ["Mois critiques", DEFINITIONS.critical],
  ];
  return (
    <Panel>
      <PanelHeader title="Glossaire" subtitle="Les termes utilisés dans toute l'application." />
      <dl className="grid grid-cols-1 gap-x-8 px-5 pb-4 pt-2 lg:grid-cols-2">
        {terms.map(([term, def]) => (
          <div key={term} className="border-b border-line py-3">
            <dt className="text-[13.5px] font-medium text-ink">{term}</dt>
            <dd className="mt-1 text-[13px] leading-relaxed text-ink-3">{def}</dd>
          </div>
        ))}
      </dl>
    </Panel>
  );
}
