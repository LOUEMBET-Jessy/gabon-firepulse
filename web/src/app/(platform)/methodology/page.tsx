import type { Metadata } from "next";

import { Flask } from "@phosphor-icons/react/dist/ssr";

import { MethodToc } from "@/components/method-toc";
import { Notice, PageHeader, Panel, SensorMark } from "@/components/ui";
import { fmt1, fmt2, fmtDate, fmtDateTimeUtc, fmtInt, fmtPct, MONTHS_SHORT } from "@/lib/format";
import { CONFIG_LABEL, SATELLITES } from "@/lib/labels";
import { ANOMALY_SETTINGS } from "@/lib/science/anomaly";
import { calendar, MAX_UNOBSERVED_SHARE, WEAK_CALIBRATION_ERROR, ZONE_PRIOR_WEIGHT } from "@/lib/server/engine";
import { POINT_CAP } from "@/lib/server/queries";
import { dayToIso, getStore } from "@/lib/server/store";
import type { ConfigKey } from "@/lib/types";

export const metadata: Metadata = { title: "Méthode et données" };

const SECTIONS = [
  ["resume", "En bref"],
  ["capteurs", "MODIS et VIIRS"],
  ["pipeline", "Traitement"],
  ["harmonisation", "Harmonisation"],
  ["validation", "Validation du calage"],
  ["zones", "Calage par zone"],
  ["anomalies", "Périodes inhabituelles"],
  ["limites", "Limites"],
  ["geographie", "Géographie"],
  ["temps-reel", "Temps réel"],
  ["sources", "Sources"],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <Panel id={id} className="scroll-mt-24 px-5 py-5 md:px-7 md:py-6">
      <h2 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3.5 text-[14px] leading-relaxed text-ink-2 [&_strong]:font-medium [&_strong]:text-ink [&>p]:max-w-[78ch]">{children}</div>
    </Panel>
  );
}

/** Tableau long replie par defaut : le texte se lit d'un trait, le detail reste a un clic (et a l'impression). */
function Fold({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-control border border-line bg-bg/30 open:bg-transparent">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[13.5px] font-medium text-ink transition-colors hover:text-accent-strong [&::-webkit-details-marker]:hidden">
        {label}
        <span aria-hidden className="text-[18px] leading-none text-ink-3 transition-transform duration-200 group-open:rotate-45">+</span>
      </summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

function Table({ head, rows, numeric = [] }: { head: string[]; rows: React.ReactNode[][]; numeric?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-[13px]">
        <thead>
          <tr className="text-[12px] text-ink-3">
            {head.map((h, i) => (
              <th key={h} className={`pb-2 pr-4 font-normal ${numeric.includes(i) ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r} className="border-t border-line align-top">
              {row.map((cell, i) => (
                <td key={i} className={`py-2 pr-4 ${numeric.includes(i) ? "num text-right text-ink" : i === 0 ? "text-ink" : "text-ink-2"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const MODEL_LABEL: Record<string, string> = { global: "un facteur unique", season: "deux facteurs (juin à sept., reste de l'année)", month: "un facteur par mois" };

export default function MethodologyPage() {
  const store = getStore();
  const h = store.harmonization;
  const meta = store.metadata;
  const sats = store.meta.satellites;
  const cal = h.calibration;
  const ta = cal.TA!;
  const unit = h.diagnostics.unit_comparison;
  const provinces = store.meta.provinces.map((p) => {
    const entry = calendar({ kind: "province", index: p.index }, store).calibration.configs.TA!;
    const before = h.diagnostics.province_transfer.find((d) => d.province === p.name);
    return { name: p.name, entry, before };
  });
  const relay = h.relay_segments;
  const configs: ConfigKey[] = ["TA", "A", "T", "N"];
  const totalStatic = sats.reduce((a, s) => a + s.detections - (s.by_type["0"] ?? 0), 0);

  return (
    <>
      <PageHeader
        icon={<Flask size={20} weight="duotone" />}
        title="Méthode et données"
        lead="Comment les chiffres sont obtenus, ce qui a été vérifié, et ce qu'ils ne permettent pas de dire. Toutes les valeurs de cette page sont lues dans les fichiers produits par le traitement."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[200px_minmax(0,1fr)] xl:gap-10">
        <MethodToc sections={SECTIONS} />
        <div className="flex min-w-0 flex-col gap-6">

      <Section id="resume" title="En bref">
        <p>
          MODIS observe les feux actifs depuis 2000, VIIRS depuis 2012. Les deux capteurs ne comptent pas la même chose : au Gabon, VIIRS signale environ <strong>{fmt1(unit.raw_detections.factor_global)} fois plus</strong> de détections que MODIS pour la même activité. Mettre leurs séries bout à bout produirait une fausse hausse en 2012.
        </p>
        <p>
          Hot-Spot ramène les deux capteurs à une même unité, la <strong>cellule-jour active en équivalent VIIRS Suomi-NPP</strong>, et n'utilise jamais qu'un seul capteur par jour. Le résultat est une série continue du {fmtDate(dayToIso(store, store.firstDay))} au {fmtDate(dayToIso(store, store.lastDay))}, sur laquelle reposent le calendrier, les tendances et les périodes inhabituelles.
        </p>
        <Notice title="Ce que la plateforme n'affirme pas">
          Une détection n'est pas un incendie confirmé. Un indice élevé n'est pas une surface brûlée. Une période inhabituelle n'est pas une prédiction. La plateforme ne désigne aucune cause et ne remplace aucun système d'alerte.
        </Notice>
      </Section>

      <Section id="capteurs" title="Ce que mesurent MODIS et VIIRS">
        <p>
          Chaque ligne des fichiers FIRMS est le <strong>centre d'un pixel</strong> que l'algorithme a signalé comme contenant un ou plusieurs feux ou une autre anomalie thermique. La documentation FIRMS précise que ce point n'est pas nécessairement la position du feu, et que ni sa taille ni son emplacement exact ne peuvent être déterminés.
        </p>
        <Table
          head={["Caractéristique", "MODIS", "VIIRS 375 m"]}
          rows={[
            ["Satellites dans ce projet", "Terra, Aqua", "Suomi-NPP, NOAA-20"],
            ["Taille du pixel au nadir", "1 km × 1 km", "environ 375 m × 375 m"],
            ["Passage à l'équateur (heure locale moyenne)", "Terra : vers 10 h 30 et 22 h 30. Aqua : vers 13 h 30 et 1 h 30", "Suomi-NPP : vers 13 h 30 et 1 h 30. NOAA-20 : environ 50 minutes d'écart"],
            ["Confiance", "pourcentage de 0 à 100", "trois classes : faible, nominale, élevée"],
            ["Puissance radiative (FRP)", "mégawatts, par pixel", "mégawatts, par pixel"],
            ["Sensibilité", "référence historique", "meilleure réponse sur les feux de petite taille, meilleures performances de nuit"],
            ["Début des données pour le Gabon", `${fmtDate(sats[0].first_date)} (Terra), ${fmtDate(sats[1].first_date)} (Aqua)`, `${fmtDate(sats[2].first_date)} (Suomi-NPP), ${fmtDate(sats[3].first_date)} (NOAA-20)`],
          ]}
        />
        <p className="text-[13px] text-ink-3">
          Source des caractéristiques : pages FIRMS de NASA Earthdata (FAQ, attributs des données de feux actifs, produit VIIRS I-Band 375 m), consultées le 13 novembre 2026. Les deux pages consultées ne s'accordent pas sur l'ordre de passage de NOAA-20 par rapport à Suomi-NPP : seul l'écart d'environ 50 minutes est repris ici.
        </p>
        <p>Ce que contiennent les fichiers chargés :</p>
        <Table
          head={["Satellite", "Détections", "Retenues dans l'indice", "Sources statiques", "Confiance faible", "De nuit"]}
          numeric={[1, 2, 3, 4, 5]}
          rows={sats.map((s) => [
            <span key={s.key} className="flex items-center gap-2">
              <SensorMark color={SATELLITES[s.key].color} shape={SATELLITES[s.key].shape} />
              {s.sensor} {s.name}
            </span>,
            fmtInt(s.detections),
            `${fmtInt(s.eligible)} (${fmtPct(s.eligible / s.detections)})`,
            fmtPct((s.detections - (s.by_type["0"] ?? 0)) / s.detections),
            fmtPct(s.by_confidence_class.low / s.detections),
            fmtPct(s.night / s.detections),
          ])}
        />
        <p>
          <strong>Sources statiques.</strong> Le champ <span className="num">type</span> du produit distingue les feux de végétation présumés (0) des volcans (1), des autres sources statiques terrestres (2) et des sources en mer (3). Au Gabon, {fmtInt(totalStatic)} détections, soit {fmtPct(totalStatic / store.n)} du total, sont des sources statiques, pour l'essentiel repérées par VIIRS. Elles sont écartées de l'indice et restent visibles sur la carte.
        </p>
      </Section>

      <Section id="pipeline" title="Chaîne de traitement">
        <Table
          head={["Étape", "Ce qui est fait", "Résultat sur ce jeu"]}
          rows={[
            ["A. Acquisition", "Téléchargement des archives annuelles FIRMS par pays, avec URL, taille, empreinte SHA-256 et date d'accès de chaque fichier.", `${store.meta.sources.length} fichiers, ${fmtInt(meta.rows.read)} lignes. Années absentes côté NASA : ${meta.firms.missing_years.map((m) => `${m.dataset} ${m.year}`).join(", ")}.`],
            ["B. Contrôle qualité", "Coordonnées, date, heure, satellite, instrument, confiance, jour ou nuit, doublons techniques. Une ligne invalide est rejetée et journalisée, jamais corrigée.", `${fmtInt(meta.rows.rejected)} ligne rejetée, ${store.quality.warnings.length} avertissement. ${fmtInt(meta.rows.kept)} lignes conservées.`],
            ["C. Normalisation", "Champs communs renommés, date et heure UTC conservées, valeurs natives gardées (confiance, version, températures de brillance, taille de pixel).", "Une ligne par enregistrement source, avec le numéro de ligne d'origine."],
            ["D. Espace commun", `Grille régulière de ${String(h.grid.step_deg).replace(".", ",")}° (environ 5,5 km), ${h.grid.ncols} × ${h.grid.nrows} cellules. Rattachement aux provinces par test point dans polygone.`, `${fmtInt(meta.rows.outside_provinces)} détections hors des polygones de provinces (limites FIRMS et geoBoundaries différentes), gardées dans le total national.`],
            ["E. Temps commun", "Agrégats par jour, puis par semaine, mois et année. Détection des interruptions de chaque satellite.", `${h.gaps.length} interruptions repérées, ${relay.filter((r) => r.config === null).length} période sans aucun capteur.`],
            ["F. Analyse", "Calage de chaque configuration MODIS sur VIIRS, relais jour par jour, référence saisonnière et score d'écart.", "Voir les sections suivantes."],
            ["G. Restitution", "API interne, puis interface. Chaque graphique cite sa source, sa période et sa date d'accès.", "Exports CSV et GeoJSON avec renvoi à la ligne source."],
          ]}
        />
        <p className="text-[13px] text-ink-3">
          Le traitement scientifique est écrit en Python (dossier <span className="num">pipeline/</span>) et testé indépendamment de l'interface. Un test vérifie que le moteur de l'application reproduit, mois par mois, la table nationale calculée par le pipeline.
        </p>
      </Section>

      <Section id="harmonisation" title="Méthode d'harmonisation">
        <p>
          <strong>1. Ne retenir que le brûlage de végétation.</strong> Une détection entre dans l'indice si le produit la classe « feu de végétation présumé » et si sa confiance n'est pas faible : au moins {h.eligibility.modis_min_confidence_pct} % pour MODIS, classes nominale ou élevée pour VIIRS. Les deux échelles de confiance ne sont pas converties l'une dans l'autre.
        </p>
        <p>
          <strong>2. Compter des cellules-jour, pas des pixels.</strong> Une cellule de la grille compte une fois par jour dès qu'une détection retenue y tombe. Un feu que VIIRS voit en dix pixels et MODIS en un seul pèse ainsi le même poids. En détections brutes, le rapport VIIRS sur MODIS est de {fmt2(unit.raw_detections.factor_global)} ; en cellules-jour, il descend à {fmt2(unit.cell_days.factor_global)}.
        </p>
        <p>
          <strong>3. Caler MODIS sur VIIRS.</strong> Le capteur de référence est VIIRS Suomi-NPP. Sur les jours où les deux observent ({ta.overlap_first_year} à {ta.overlap_last_year}, {fmtInt(ta.overlap_days)} jours), le facteur est le rapport des sommes mensuelles, par mois calendaire. MODIS Terra + Aqua est multiplié par un facteur compris entre {fmt2(Math.min(...ta.factors_by_month))} (
          {MONTHS_SHORT[ta.factors_by_month.indexOf(Math.min(...ta.factors_by_month))]}) et {fmt2(Math.max(...ta.factors_by_month))} ({MONTHS_SHORT[ta.factors_by_month.indexOf(Math.max(...ta.factors_by_month))]}).
        </p>
        <p>
          <strong>4. Un seul capteur par jour.</strong> Chaque jour est alimenté par la première configuration en service dans cet ordre : {h.relay_priority.map((c) => CONFIG_LABEL[c]).join(", ")}. Aucun total MODIS plus VIIRS n'est donc jamais calculé, et la même activité ne peut pas être comptée deux fois.
        </p>
        <Fold label={`Chronologie réelle du relais (${relay.length} périodes)`}>
          <Table
          head={["Du", "Au", "Source de l'indice"]}
          rows={relay.map((r) => [fmtDate(r.start), fmtDate(r.end), r.config ? CONFIG_LABEL[r.config] : <span key="n" className="text-warning">Aucun capteur en service : pas de valeur</span>])}
        />
        </Fold>
        <p>
          <strong>Interruptions.</strong> Une série de jours consécutifs sans aucune détection d'un satellite est traitée comme une interruption si elle dure assez longtemps et si le nombre de détections attendu sur ces jours est élevé. Pour VIIRS, l'autre satellite sert de témoin : s'il n'a presque rien vu non plus, le silence est attribué aux nuages et n'est pas signalé.
        </p>
        <Fold label={`Interruptions détectées (${h.gaps.length})`}>
          <Table
          head={["Satellite", "Du", "Au", "Jours", "Détections attendues", "Vues par le témoin"]}
          numeric={[3, 4, 5]}
          rows={h.gaps.map((g) => [SATELLITES[g.satellite].name, fmtDate(g.start), fmtDate(g.end), g.days, fmtInt(g.expected_detections), g.witness_detections === null ? "sans témoin" : fmtInt(g.witness_detections)])}
        />
        </Fold>
        <p className="text-[13px] text-ink-3">Ces interruptions sont déduites des données, pas d'un journal officiel d'exploitation des satellites. Sans témoin, une longue période très nuageuse pourrait être prise pour une panne.</p>
      </Section>

      <Section id="validation" title="Validation du calage">
        <p>
          Chaque facteur est testé <strong>hors échantillon</strong> : il est estimé sans une année, puis sert à prédire cette année-là, et l'opération est répétée pour chaque année commune. Trois formes de facteur sont comparées ; la plus simple est retenue sauf si une forme plus détaillée réduit l'erreur mensuelle médiane de plus de {fmtPct(h.calibration_settings.parsimony_tolerance)}.
        </p>
        <Table
          head={["Configuration", "Forme retenue", "Erreur mensuelle médiane", "Erreur annuelle moyenne", "Erreur annuelle maximale", "Corrélation mensuelle", "Rapport 10 % à 90 %"]}
          numeric={[2, 3, 4, 5, 6]}
          rows={configs.map((c) => {
            const v = cal[c]!.validation;
            return [
              CONFIG_LABEL[c],
              MODEL_LABEL[cal[c]!.model],
              fmtPct(v.monthly_median_abs_pct_error, 1),
              fmtPct(v.annual_mean_abs_pct_error, 1),
              fmtPct(v.annual_max_abs_pct_error, 1),
              fmt2(v.monthly_correlation),
              `${fmt2(v.monthly_ratio_q10)} à ${fmt2(v.monthly_ratio_q90)}`,
            ];
          })}
        />
        <p>
          Lecture : pour un mois donné, la valeur MODIS calée s'écarte typiquement de {fmtPct(ta.validation.monthly_median_abs_pct_error)} de ce que VIIRS a mesuré ; pour une année entière, d'environ {fmtPct(ta.validation.annual_mean_abs_pct_error)}. Terra seul (2000 à mi-2002) est nettement moins fiable. Les bandes d'incertitude des graphiques reprennent la colonne « Rapport 10 % à 90 % ».
        </p>
        <p>
          <strong>Cellules-jour ou détections brutes ?</strong> Le gain de précision est modeste et doit être dit : l'erreur mensuelle médiane passe de {fmtPct(unit.raw_detections.monthly_median_abs_pct_error, 1)} à {fmtPct(unit.cell_days.monthly_median_abs_pct_error, 1)}, et l'erreur annuelle ne s'améliore pas ({fmtPct(unit.raw_detections.annual_mean_abs_pct_error, 1)} contre{" "}
          {fmtPct(unit.cell_days.annual_mean_abs_pct_error, 1)}). La cellule-jour est retenue pour une autre raison : elle empêche qu'une même activité soit comptée plusieurs fois, par plusieurs pixels ou par plusieurs satellites.
        </p>
        <p>
          <strong>Le rapport entre capteurs n'est pas stable dans le temps.</strong> Rapport annuel entre VIIRS Suomi-NPP et chaque configuration, sur les jours communs :
        </p>
        <Fold label={`Rapport annuel par configuration (${h.diagnostics.yearly_ratio.length} années)`}>
          <Table
          head={["Année", "Terra + Aqua", "Aqua seul", "Terra seul", "NOAA-20"]}
          numeric={[1, 2, 3, 4]}
          rows={h.diagnostics.yearly_ratio.map((r) => [r.year, r.TA === null ? "" : fmt2(r.TA), r.A === null ? "" : fmt2(r.A), r.T === null ? "" : fmt2(r.T), r.N === null ? "" : fmt2(r.N)])}
        />
        </Fold>
        <p>
          Le rapport Terra + Aqua varie de {fmt2(Math.min(...h.diagnostics.yearly_ratio.map((r) => r.TA ?? Infinity)))} à {fmt2(Math.max(...h.diagnostics.yearly_ratio.map((r) => r.TA ?? -Infinity)))} selon les années, et il est plus bas en fin de période. Les données chargées ne permettent pas d'en établir la cause. Deux explications sont plausibles et non vérifiées ici : la dérive des orbites de Terra et d'Aqua, qui déplace leur heure de passage, et les interruptions de Suomi-NPP en 2024. Conséquence : les valeurs d'avant 2012 reposent sur un facteur moyen, et leur incertitude réelle peut dépasser la bande affichée.
        </p>
      </Section>

      <Section id="zones" title="Calage ajusté à chaque zone">
        <p>
          Le facteur national se transpose mal d'une province à l'autre : appliqué tel quel, il sous-estime VIIRS de près de moitié dans certaines provinces et le surestime dans d'autres (colonne « avant » du tableau). Le type de végétation et la taille des feux pourraient l'expliquer, mais aucune donnée d'occupation du sol n'est chargée ici pour l'établir.
        </p>
        <p>
          Chaque zone reçoit donc une correction <span className="num">k = (R + {ZONE_PRIOR_WEIGHT}) / (P + {ZONE_PRIOR_WEIGHT})</span>, où R est le total VIIRS Suomi-NPP de la zone sur les jours communs et P la prédiction par les facteurs nationaux. Le poids de {ZONE_PRIOR_WEIGHT} cellules-jour maintient une zone peu active près du facteur national. L'erreur est mesurée en recalculant k sans l'année testée.
        </p>
        <Table
          head={["Province", "Rapport VIIRS / MODIS calé, avant", "Correction k", "Erreur annuelle avant", "Erreur annuelle après", "Mois mesurables", "Vérifié"]}
          numeric={[1, 2, 3, 4, 5]}
          rows={provinces.map(({ name, entry, before }) => [
            name,
            before?.ratio_reference_over_predicted == null ? "n. d." : fmt2(before.ratio_reference_over_predicted),
            fmt2(entry.k),
            before?.annual_median_abs_pct_error == null ? "n. d." : fmtPct(before.annual_median_abs_pct_error),
            entry.annualErrorLoyo === null ? "n. d." : fmtPct(entry.annualErrorLoyo),
            entry.monthsScored,
            entry.verified ? "oui" : "non",
          ])}
        />
        <p>
          Le calage local réduit l'erreur dans la plupart des provinces, mais elle reste élevée là où MODIS signale trop peu de détections pour servir d'estimateur précis. Quand une zone a moins de 24 mois mesurables, ou plus de {fmtPct(WEAK_CALIBRATION_ERROR)} d'erreur annuelle, la fiabilité de ses valeurs estimées est classée « faible » et l'interface le signale. Pour une tendance dans ces zones, la série VIIRS seule (depuis 2012) est préférable.
        </p>
        <p className="text-[13px] text-ink-3">Pour le pays entier, les facteurs nationaux s'appliquent sans correction. Une zone dessinée à la main est calée de la même façon qu'une province, à la volée.</p>
      </Section>

      <Section id="anomalies" title="Périodes inhabituelles et périodes critiques">
        <p>
          <strong>Période inhabituelle.</strong> Pour un mois, la valeur est comparée au même mois calendaire des autres années, l'année évaluée étant exclue. Le score est <span className="num">(valeur − médiane) / (1,4826 × écart absolu médian)</span>. Il est signalé à partir de {String(ANOMALY_SETTINGS.thresholdNotable).replace(".", ",")} en valeur absolue, et qualifié de « très supérieur » à partir de {String(ANOMALY_SETTINGS.thresholdStrong).replace(".", ",")}.
        </p>
        <p>
          La médiane et l'écart absolu médian ont été préférés à la moyenne et à l'écart-type parce qu'une ou deux années extrêmes suffisent à gonfler un écart-type et à masquer les écarts suivants. Le score classique reste affiché à côté, pour comparaison. Les ruptures de série n'ont pas été testées : la seule rupture attendue est le changement de capteur de 2012, que l'harmonisation traite déjà.
        </p>
        <p>
          <strong>Garde-fous.</strong> Il faut au moins {ANOMALY_SETTINGS.minReferenceYears} années de référence, sinon le statut est « données insuffisantes ». Un mois dont plus de {fmtPct(MAX_UNOBSERVED_SHARE)} des jours n'ont aucun capteur en service n'est pas évalué. Sous {ANOMALY_SETTINGS.minActivity} cellules-jour, l'activité est jugée trop faible pour être qualifiée. Si la dispersion de référence est nulle, aucun score n'est calculé.
        </p>
        <p>
          <strong>Période critique.</strong> Les mois calendaires qui concentrent ensemble 80 % de l'activité médiane annuelle d'une zone. C'est une description de la saisonnalité passée, utile pour savoir quand surveiller ; ce n'est pas une prévision.
        </p>
        <p className="text-[13px] text-ink-3">Seuils, grille, poids et durées sont des choix de conception de l'équipe, pas des prescriptions de la NASA. Le seuil de 3,5 est celui proposé par Iglewicz et Hoaglin (1993) pour ce score.</p>
      </Section>

      <Section id="limites" title="Limites connues">
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>
            <strong>Nuages et fumée.</strong> Le Gabon est très nuageux. Un satellite ne voit pas un feu sous un nuage épais : une valeur nulle signifie « aucune détection », jamais « aucun feu ». Une baisse d'activité détectée peut venir d'une saison plus couverte.
          </li>
          <li>
            <strong>Heure de passage.</strong> Les satellites passent deux fois par jour. Un feu allumé et éteint entre deux passages n'est pas détecté. L'indice mesure l'activité visible aux heures de passage.
          </li>
          <li>
            <strong>Avant 2012, des estimations.</strong> Les valeurs sont dérivées de MODIS avec l'erreur indiquée plus haut. Le calage suppose que le rapport entre capteurs mesuré de 2012 à 2025 valait aussi de 2000 à 2011, ce que rien ne permet de vérifier.
          </li>
          <li>
            <strong>Petites zones.</strong> Sous quelques dizaines de cellules-jour par mois, les écarts relatifs deviennent instables. L'interface abaisse alors la fiabilité ou refuse de qualifier.
          </li>
          <li>
            <strong>Grille.</strong> L'agrégation à 0,05° sert à comparer, elle n'améliore pas la résolution native. Deux feux distincts dans la même cellule le même jour comptent pour un.
          </li>
          <li>
            <strong>Limites administratives.</strong> Polygones geoBoundaries simplifiés, état représenté : 2005. Les détections proches d'une limite peuvent être rattachées à la province voisine.
          </li>
          <li>
            <strong>Archive figée.</strong> Les données s'arrêtent au {fmtDate(dayToIso(store, store.lastDay))}. L'application n'affiche pas de temps réel. D'après la FAQ FIRMS, Suomi-NPP a cessé de produire de nouvelles données le 2 novembre 2026 : une mise à jour devra prendre NOAA-20 comme référence.
          </li>
          <li>
            <strong>Affichage.</strong> Au-delà de {fmtInt(POINT_CAP)} détections, la carte n'affiche pas les points plutôt que d'en montrer un échantillon ; la grille harmonisée et l'export restent complets.
          </li>
        </ul>
      </Section>

      <Section id="geographie" title="Géographie d'exploration : globe, départements, localités">
        <p>
          La carte s'ouvre sur un globe pour situer le Gabon dans le monde. <strong>Seul le Gabon dispose de détections chargées</strong> : les autres pays sont des repères de navigation (Natural Earth, 1:110 000 000, domaine public) et leur fiche le dit, sans aucun chiffre.
        </p>
        <p>
          Au Gabon, l'analyse descend sous la province. Les <strong>{store.geography.departments.length} départements</strong> viennent de geoBoundaries ({String(store.geography.sources.departments.license)}, état représenté : {String(store.geography.sources.departments.year)}). Chaque détection est rattachée à son département par un test point dans polygone ; {fmtInt(store.geography.outside_departments)} détections tombent hors des polygones et ne comptent que dans les totaux nationaux. Les départements (2018) et les provinces (2005) ne s'emboîtent pas exactement : chaque département est rattaché à la province qui couvre la plus grande part de sa surface, et la somme des départements d'une province peut différer de quelques pour cent du total de la province.
        </p>
        <p>
          Les <strong>localités</strong> viennent de GeoNames (CC BY 4.0) : {fmtInt(store.geography.places.length)} lieux habités, dont {store.geography.towns.length} villes avec population connue ou fonction administrative. Un point n'a pas de surface : l'analyse d'une localité porte sur un <strong>disque de {store.geography.place_radius_km} km</strong> autour d'elle, annoncé comme tel partout. Ce disque peut chevaucher plusieurs départements.
        </p>
        <Notice title="Ce que la granularité ne change pas">
          Une zone plus petite contient moins de détections : la référence saisonnière y est plus fragile, le calage MODIS vers VIIRS aussi, et un écart peut tenir à quelques pixels. Les indicateurs par département ou par localité servent à repérer où regarder et à prioriser des vérifications de terrain. Ce ne sont ni des incendies confirmés, ni des prédictions.
        </Notice>
        <p>
          À l'écran, les détections sont regroupées en vue continentale ou mondiale (anneaux dont la couleur donne la part de chaque capteur), puis affichées une à une dès l'échelle du pays. Le regroupement est un choix d'affichage : il ne modifie aucun calcul.
        </p>
      </Section>

      <Section id="temps-reel" title="Observatoire en temps quasi réel">
        <p>
          En plus de l'archive, la carte peut afficher les <strong>dernières détections publiées par NASA FIRMS</strong> (produits NRT, « Near Real-Time ») pour le Gabon et la France métropolitaine : MODIS sur Terra et Aqua, VIIRS sur Suomi-NPP, NOAA-20 et NOAA-21. Le serveur lit les fichiers officiels des 7 derniers jours, ou l'API de FIRMS si une clé est configurée, et ne garde que les points situés dans les deux pays.
        </p>
        <p>
          Chaque flux est vérifié au plus toutes les 10 minutes, par requête conditionnelle : rien n'est retéléchargé si la NASA n'a rien publié. En cas de panne, la dernière copie est servie et signalée comme ancienne. Les dates de publication, de vérification et de dernière acquisition sont affichées pour chaque capteur et chaque pays.
        </p>
        <Notice title="Ce que le temps réel n'est pas">
          Ces détections ne sont ni harmonisées ni définitives : la NASA peut les corriger, et elles ne rejoignent ni l'archive ni ses calculs (indice, tendances, périodes inhabituelles). Les produits NRT ne distinguent pas toujours les sources industrielles des feux de végétation. Une détection est le centre d'un pixel signalé comme anomalie thermique, jamais un incendie confirmé.
        </Notice>
      </Section>

      <Section id="sources" title="Sources, versions et vérifications">
        <p>
          <strong>Détections.</strong> NASA FIRMS, archives annuelles par pays, Gabon. Fichiers téléchargés entre le {fmtDateTimeUtc(meta.firms.accessed_first)} et le {fmtDateTimeUtc(meta.firms.accessed_last)}, depuis <span className="num break-all">{meta.firms.base_url}</span>. D'après la documentation consultée, les données FIRMS sont partagées ouvertement, sans restriction, selon les règles d'usage et de citation de l'EOSDIS.
        </p>
        <p>
          <strong>Produits.</strong> MODIS : valeurs du champ <span className="num">version</span> présentes dans les fichiers : {store.meta.versions.filter((v) => v !== "2").join(", ")}. VIIRS : valeur 2. La présence du champ <span className="num">type</span>, que la documentation réserve aux produits standard, indique des produits de qualité scientifique (MCD14ML pour MODIS, VNP14IMGML et VJ114IMGML pour VIIRS).
        </p>
        <Notice title="Ce qui n'a pas pu être vérifié">
          Les pages consultées ne décrivent pas les codes de version 6.03, 6.2 et 61.03 : ils sont affichés tels quels. Les seuils de confiance MODIS de 30 % et 80 % viennent du guide utilisateur MODIS et n'ont pas été relus en ligne pendant ce projet. Les noms de produits ci-dessus sont déduits, pas lus dans les fichiers.
        </Notice>
        <p>
          <strong>Limites administratives.</strong> {meta.boundaries.map((b) => `${b.level} : ${b.source}, licence ${b.license}, état représenté ${b.year_represented}`).join(". ")}. Fond de carte facultatif : NASA GIBS, Blue Marble.
        </p>
        <p>
          <strong>Références des algorithmes</strong>, citées sur la page FIRMS : Giglio, Schroeder et Justice (2016), algorithme MODIS Collection 6, doi 10.1016/j.rse.2016.02.054 ; Schroeder, Oliva, Giglio et Csiszar (2014), produit VIIRS 375 m, doi 10.1016/j.rse.2013.12.008.
        </p>
        <p>
          <strong>Remerciement demandé par FIRMS.</strong> « We acknowledge the use of data and/or imagery from NASA's Fire Information for Resource Management System (FIRMS) », système rattaché à LANCE et à l'ESDIS.
        </p>
        <details className="rounded-control border border-line bg-surface-2">
          <summary className="cursor-pointer px-4 py-2.5 text-[13.5px] font-medium text-ink">Les {store.meta.sources.length} fichiers sources, avec empreinte et date d'accès</summary>
          <div className="border-t border-line px-4 py-3">
            <Table
              head={["Fichier", "Lignes lues", "Conservées", "Rejetées", "Consulté le (UTC)", "SHA-256"]}
              numeric={[1, 2, 3]}
              rows={store.meta.sources.map((s) => [
                <a key={s.file} href={s.url} target="_blank" rel="noreferrer" className="num text-accent hover:text-accent-strong">
                  {s.file}
                </a>,
                fmtInt(s.rows_read),
                fmtInt(s.rows_kept),
                fmtInt(s.rows_rejected),
                <span key="d" className="num">
                  {fmtDateTimeUtc(s.accessed_at)}
                </span>,
                <span key="h" className="num text-ink-3">
                  {s.sha256.slice(0, 12)}…
                </span>,
              ])}
            />
          </div>
        </details>
        <p className="text-[13px] text-ink-3">
          Données traitées le {fmtDateTimeUtc(meta.built_at)}. Projet étudiant indépendant réalisé pour le NASA Space Apps Challenge 2026, défi « Harmonization of MODIS and VIIRS Hot Spots ». Hot-Spot n'est ni un produit officiel de la NASA ni un service opérationnel d'alerte incendie.
        </p>
      </Section>
        </div>
      </div>
    </>
  );
}
