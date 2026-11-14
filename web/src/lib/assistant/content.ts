/**
 * Contenu d'aide statique : suggestions par page, visite guidee, questions frequentes.
 * Ce contenu fonctionne sans fournisseur IA. Les reponses ci-dessous sont des textes d'aide
 * rediges a l'avance, presentes comme tels : ils ne pretendent pas etre generes.
 */

import type { AssistantAction, PageKey, TargetKey } from "./protocol";

/** Questions proposees selon la page ouverte. */
export const SUGGESTIONS: Record<PageKey, string[]> = {
  home: ["À quoi sert Hot-Spot ?", "Par où commencer ?", "Quelle est la différence entre MODIS et VIIRS ?"],
  dashboard: ["Résume l'activité de la période sélectionnée", "Cette période est-elle inhabituelle ?", "Que signifie l'indice harmonisé ?"],
  map: ["Affiche uniquement les détections VIIRS", "Passe en grille harmonisée", "Pourquoi certaines zones n'ont aucune détection ?"],
  calendar: ["Quels sont les mois habituellement les plus actifs ?", "Montre les écarts à la référence", "Comment lire ce calendrier ?"],
  trends: ["Y a-t-il une tendance significative depuis 2000 ?", "Compare 2024 et 2025", "Pourquoi une bande d'incertitude avant 2012 ?"],
  compare: ["Quelle est la différence entre MODIS et VIIRS ?", "Montre la comparaison après calage", "Pourquoi ne pas additionner les capteurs ?"],
  anomalies: ["Explique le mois sélectionné", "Montre les hausses les plus fortes", "Une période inhabituelle est-elle une alerte ?"],
  reports: ["Exporte les détections de la période en CSV", "Que contient le rapport PDF ?", "Comment citer ces données ?"],
  methodology: ["Comment le calage est-il validé ?", "Quelles sont les limites des données ?", "D'où viennent les données ?"],
};

export interface TourStep {
  page: PageKey;
  target: TargetKey | null;
  title: string;
  body: string;
  /** Action proposee a l'utilisateur pendant l'etape (appliquee seulement s'il clique). */
  offer?: { label: string; actions: AssistantAction[] };
}

/** Parcours de decouverte, dans l'ordre suggere par le cahier des charges. */
export const TOUR: TourStep[] = [
  {
    page: "dashboard",
    target: null,
    title: "Bienvenue dans Hot-Spot",
    body: "Hot-Spot rassemble 25 ans de détections de feux vues par les satellites de la NASA, et les rend comparables. Je vous montre l'essentiel en quelques étapes. Vous pouvez quitter à tout moment et reprendre plus tard.",
  },
  {
    page: "dashboard",
    target: "zone-picker",
    title: "1. Choisir le territoire",
    body: "Toute l'analyse porte sur une zone : le Gabon entier, une province, ou un rectangle que vous dessinez sur la carte. Commençons par le pays entier.",
    offer: { label: "Utiliser le Gabon", actions: [{ type: "set_zone", zone: { kind: "country" }, label: "Gabon" }] },
  },
  {
    page: "dashboard",
    target: "period-picker",
    title: "2. Choisir une période",
    body: "Les données couvrent novembre 2000 à décembre 2025. Prenons la grande saison sèche 2025, de juin à septembre, quand l'activité est la plus forte.",
    offer: { label: "Juin à septembre 2025", actions: [{ type: "set_period", from: "2025-06-01", to: "2025-09-30" }] },
  },
  {
    page: "dashboard",
    target: "kpi-index",
    title: "3. Lire l'indice harmonisé",
    body: "Ce chiffre compte les cellules de 5 km actives chaque jour, ramenées à l'unité du capteur VIIRS. Il est comparé aux mêmes dates des autres années : c'est ce qui dit si la période est habituelle.",
  },
  {
    page: "map",
    target: "map-legend",
    title: "4. Afficher la carte et identifier les capteurs",
    body: "Chaque symbole est une détection : carré orange pour MODIS (pixel de 1 km), disques pour VIIRS (375 m). La forme distingue les capteurs, pas seulement la couleur. Cliquez sur un point pour voir sa fiche et sa source NASA.",
  },
  {
    page: "map",
    target: "map-filters",
    title: "5. Filtrer les observations",
    body: "Gardez un seul satellite, écartez la confiance faible ou les sources statiques, passez en grille harmonisée. L'export reprend exactement ces filtres.",
  },
  {
    page: "calendar",
    target: "calendar-grid",
    title: "6. Consulter le calendrier",
    body: "Une ligne par année, une colonne par mois. Les colonnes claires de juin à septembre montrent la saison sèche ; les pastilles signalent les mois inhabituels. Cliquez une case pour son détail.",
  },
  {
    page: "trends",
    target: "trend-chart",
    title: "7. Comprendre les tendances",
    body: "Les totaux annuels depuis 2000, avec la pente et sa signification statistique. Les barres hachurées sont estimées depuis MODIS : leur barre d'erreur montre l'incertitude.",
  },
  {
    page: "anomalies",
    target: "anomaly-list",
    title: "8. Explorer les périodes inhabituelles",
    body: "Les mois qui s'écartent de leur saison habituelle, avec la valeur, la référence, le score et la fiabilité. Un écart est un signal à vérifier, jamais une alerte ni une prédiction.",
  },
  {
    page: "anomalies",
    target: "assistant-launcher",
    title: "Et maintenant, à vous",
    body: "Posez vos questions ou demandez une action à Hot-Spot AI : « Montre le Haut-Ogooué en 2024 », « Compare MODIS et VIIRS », « Exporte les résultats ». Bonne exploration.",
  },
];

export interface FaqEntry {
  question: string;
  answer: string;
  action?: { label: string; actions: AssistantAction[] };
}

/** Aide hors ligne : disponible meme sans fournisseur IA. */
export const FAQ: FaqEntry[] = [
  {
    question: "À quoi sert Hot-Spot ?",
    answer:
      "Hot-Spot rend comparables les détections de feux des satellites MODIS (depuis 2000) et VIIRS (depuis 2012) pour suivre l'activité des feux au Gabon : carte, calendrier historique, tendances et périodes inhabituelles, avec la méthode et les limites de chaque chiffre.",
    action: { label: "Lancer la visite guidée", actions: [{ type: "start_tour" }] },
  },
  {
    question: "Comment fonctionne la carte ?",
    answer:
      "Elle affiche les détections natives de la zone et de la période choisies : carrés orange pour MODIS, disques bleus et verts pour VIIRS. Le panneau de gauche filtre par satellite, confiance, type de source et moment du passage. Un clic sur un point ouvre sa fiche et sa ligne dans le fichier NASA. Le mode « grille harmonisée » montre les jours actifs par cellule de 5 km.",
    action: { label: "Ouvrir la carte", actions: [{ type: "navigate", page: "map" }] },
  },
  {
    question: "Quelle est la différence entre MODIS et VIIRS ?",
    answer:
      "MODIS (satellites Terra et Aqua) a des pixels de 1 km et observe depuis 2000. VIIRS (Suomi-NPP depuis 2012, NOAA-20 depuis 2018) a des pixels de 375 m, plus sensibles : il signale environ quatre fois plus de détections pour la même activité. On ne les additionne donc pas : Hot-Spot convertit MODIS dans l'unité de VIIRS.",
    action: { label: "Voir la comparaison", actions: [{ type: "navigate", page: "compare" }] },
  },
  {
    question: "Comment sélectionner une période ?",
    answer:
      "Utilisez le sélecteur de période en haut de l'écran : raccourcis (année, saison sèche) ou dates libres. La période s'applique à tous les écrans. Dans le calendrier, « Utiliser comme période » reprend le mois ou la semaine sélectionnés.",
    action: { label: "Montrer le sélecteur", actions: [{ type: "highlight", target: "period-picker", caption: "Choisissez ici la période d'analyse" }] },
  },
  {
    question: "Que signifie une période inhabituelle ?",
    answer:
      "Un mois dont l'activité détectée s'écarte nettement de celle du même mois les autres années (score robuste supérieur à 2 en valeur absolue). C'est un signal d'analyse : il peut refléter une activité réelle, des conditions d'observation ou un changement de capteur. Ce n'est ni un incendie confirmé ni une prédiction.",
    action: { label: "Voir les périodes inhabituelles", actions: [{ type: "open_unusual_periods" }] },
  },
  {
    question: "Pourquoi certaines zones ne présentent-elles aucune détection ?",
    answer:
      "Aucune détection ne veut pas dire aucun feu : les nuages et la fumée masquent les feux, et les satellites ne passent que deux fois par jour. Hot-Spot signale les jours où aucun capteur n'était en service.",
  },
  {
    question: "Comment exporter mes résultats ?",
    answer:
      "Sur la carte, les boutons CSV et GeoJSON exportent exactement les détections filtrées. La page Rapports propose aussi la série mensuelle, la liste des périodes inhabituelles et une synthèse imprimable en PDF. Chaque ligne exportée renvoie à sa ligne dans le fichier NASA d'origine.",
    action: { label: "Ouvrir les rapports", actions: [{ type: "navigate", page: "reports" }] },
  },
  {
    question: "Les données sont-elles en temps réel ?",
    answer:
      "Non. Hot-Spot lit une copie figée des archives NASA FIRMS, du 1er novembre 2000 au 31 décembre 2025, téléchargée le 13 novembre 2026. L'application fonctionne sans connexion et n'est pas un système d'alerte.",
    action: { label: "Voir les sources", actions: [{ type: "navigate", page: "methodology" }] },
  },
];
