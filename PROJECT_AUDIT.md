# Gabon FirePulse — Audit de projet (Phase 1)

Date de l'audit : 13 novembre 2026 · Défi : 08 — Harmonization of MODIS and VIIRS Hot Spots
Nature du document : préparation (lecture du défi, des règles et des ressources). Aucun code, aucune donnée et aucune maquette n'ont été produits.

---

## LANCER L'APPLICATION
--- 
1- Le backend:
python pipeline\acquire.py
python pipeline\build.py

2- Le Frontend:
npm install
npm run dev
---

## 0. Constat bloquant : le développement ne peut pas commencer avant le 14 novembre

| Élément | Ce que dit la source officielle | Source consultée le 13/11/2026 |
|---|---|---|
| Dates du hackathon | « The 2026 NASA Space Apps Challenge will take place November 14-15, 2026. » | spaceappschallenge.org/resources/participant-faqs/ |
| Démarrage du travail | « Teams are not allowed to begin working on the challenges prior to the hackathon. » | même page, question « What are the challenges? » |
| Dépôt du projet | Ouverture samedi 14 novembre à 9 h 00, clôture dimanche 15 novembre à 23 h 59, heure locale | spaceappschallenge.org/2026/ |
| Usage de l'IA (« SI ») | Autorisé ; « Each team's project submission must include a description of how SI tools were used during the development of their project. » | FAQ participants |
| Taille d'équipe | 6 personnes au maximum ; une équipe d'événement local peut compter une seule personne | FAQ participants |

Conséquence : le cahier des charges prévoit lui-même ce cas (§11, « Règle de préparation » : ne pas commencer à développer avant l'heure autorisée). L'audit s'arrête donc à la préparation permise — étudier le défi, lire les ressources, organiser l'équipe. Les phases 2 à 7 (conception détaillée, pipeline, application, tests) sont à lancer à l'ouverture du hackathon.

Deux guides officiels étaient annoncés pour le 13 novembre (Project Submission Guide, Judging and Awards Guide). Ils n'apparaissaient pas encore sur la page Resources au moment de la consultation : à relire avant de commencer, car ils fixent le contenu exigé de la soumission et les critères de jugement.

---

## 1. État des lieux

| Sujet | Constat |
|---|---|
| Dossier `project/` | Vide. Pas de code, pas de données, pas de dépôt git. |
| Documents fournis | `Cahier_des_charges_Gabon_FirePulse.pdf` (13 pages, v1.0 du 12/11/2026) et `NASA_Space_Apps_2026_Guide_preselection.pdf` (15 pages). Lus intégralement. |
| Maquettes, captures, données téléchargées | Aucune. |
| Clé API FIRMS (MAP_KEY) | Aucune variable d'environnement trouvée. |
| Outils installés | Node 25.2.1, npm 11.6.2, pnpm 11.5.3, Python 3.14.7, pip 26.2.1, git 2.55, Docker 29.5.3. |
| Outils absents | PostgreSQL (psql), uv. Aucune bibliothèque Python scientifique installée (pandas, numpy, geopandas, fastapi…). |
| Navigateur automatisé | Playwright disponible et fonctionnel. |

Particularité de la machine : le certificat de `spaceappschallenge.org` est refusé par curl et par l'outil de récupération web (racine non approuvée). Le site a été lu via le navigateur Playwright, sans désactiver la vérification TLS.

---

## 2. Ce que demande réellement la NASA

L'énoncé officiel a été lu sur la page du défi (`/2026/challenges/modis-and-viirs-Hot-Spotss/`). Le guide de présélection de l'équipe en est un résumé fidèle mais incomplet. Points de l'énoncé qui pèsent sur la conception :

1. **Une série unique et cohérente.** « …so that by the end of that phase the sensor of origin no longer matters and the patterns, trends, and anomalies become the focus. » L'objectif est « a consistent time series of hotspot activity » qui combine la longue série MODIS et la continuité de VIIRS.
2. **Un calendrier du début des années 2000 à aujourd'hui.** Il doit montrer quels mois et quelles années ont été les plus actifs.
3. **La comparaison à la médiane historique.** Exemple donné : comparer l'activité du mois courant à la médiane historique de la zone choisie.
4. **Deux parties suggérées.** D'abord l'harmonisation, ensuite une application web qui prend le jeu harmonisé en entrée.
5. **Sélection d'une région et d'une plage de dates, puis téléchargement** des analyses et visualisations. Un CSV des points chauds trouvés est cité comme sortie utile.
6. **Considérations facultatives.** Dessiner la zone d'intérêt sur la carte ou saisir latitude et longitude ; rampes de couleurs accessibles ; quelques indices clés plutôt qu'une profusion de graphiques.
7. **Public visé.** Alerte précoce et secours, scientifiques, gestionnaires de terres, pompiers.
8. **Ressource officielle unique.** L'onglet Resources ne liste que FIRMS (`earthdata.nasa.gov/data/tools/firms`).

---

## 3. Écarts entre l'énoncé officiel, le cahier des charges et le prompt de mission

| # | Sujet | Cahier des charges v1.0 | Énoncé officiel / prompt | Recommandation |
|---|---|---|---|---|
| E1 | Série harmonisée | §6.3 : garder les résultats par capteur, ne jamais présenter le total. Aucun indice unique n'est défini. | La NASA veut que le capteur d'origine « ne compte plus ». | Produire un indice harmonisé unique (voir §5) **et** garder les séries par capteur consultables. Sans cet indice, le cœur du défi n'est pas traité. |
| E2 | Profondeur historique | §12.2 : démonstration sur « une période couverte par les deux capteurs ». | Calendrier « from the early 2000s to the present ». | Calendrier 2000–2025 complet ; la période commune sert au calage, pas de limite d'affichage. |
| E3 | Export CSV | F-12 en priorité P1. | Cité explicitement par la NASA. | Passer en P0 : coût faible, attendu par le jury. |
| E4 | Zone d'intérêt | F-01 : zone dessinée « si la donnée le permet ». | Dessin de zone ou saisie lat/lon suggérés. | Provinces du Gabon + rectangle dessiné ou coordonnées saisies, en P0. Polygone libre en P1. |
| E5 | Thème visuel | §9.1 : « fond clair pour l'analyse ». | Prompt : interface sombre. | Les deux se contredisent. À arbitrer par l'équipe ; par défaut, suivre la consigne la plus récente (sombre) en tenant les contrastes de NFR-05. |
| E6 | Ampleur | Périmètre MVP sur 48 h, P0 limités. | Prompt : 8 modules, 11 documents, tests complets. | Ordre de construction strict (§8) : harmonisation et calendrier d'abord, landing page et rapport PDF en dernier. |
| E7 | Vocabulaire « critique » | Microcopies prudentes, pas d'alerte. | La NASA parle d'« early warning » et de « critical periods ». | Garder la prudence du cahier, mais nommer clairement les « périodes critiques » comme mois habituellement les plus actifs (saisonnalité), distinctes des anomalies. |
| E8 | Déclaration d'usage de l'IA | Non mentionnée. | Obligatoire dans la soumission. | Tenir un journal d'usage dès la première heure. |

---

## 4. Données : ce qui a été vérifié, et ce qui ne l'a pas été

### 4.1 Vérifié le 13/11/2026

Les archives annuelles par pays de FIRMS répondent sans clé ni compte, à l'adresse
`https://firms.modaps.eosdis.nasa.gov/data/country/{jeu}/{année}/{jeu}_{année}_Gabon.csv`.

| Jeu (nom dans l'URL) | Satellite (champ `satellite`) | Années disponibles pour le Gabon | Version lue (fichier 2023) | Lignes en 2023 |
|---|---|---|---|---|
| `modis` | Terra, Aqua | 2000 → 2025 (2026 : absent) | 61.03 | 2 011 |
| `viirs-snpp` | `N` (Suomi-NPP) | 2012 → 2025 (2011 : absent) | 2 | 9 764 |
| `viirs-jpss1` | `N20` (NOAA-20) | 2018 → 2025 (2017 : absent) | 2 | 9 616 |

Colonnes lues dans les fichiers 2023 :

- MODIS : `latitude, longitude, brightness, scan, track, acq_date, acq_time, satellite, instrument, confidence, version, bright_t31, frp, daynight, type`
- VIIRS : `latitude, longitude, bright_ti4, scan, track, acq_date, acq_time, satellite, instrument, confidence, version, bright_ti5, frp, daynight, type`

Observations directes sur ces fichiers :

- La confiance est un entier chez MODIS (valeurs lues : 0, 65) et une lettre chez VIIRS (valeur lue : `n`). Les deux échelles ne sont pas convertibles l'une dans l'autre.
- Le champ `type` existe dans les trois jeux, et des lignes VIIRS portent `type = 2`.
- Le volume est faible : de l'ordre de 2 000 lignes MODIS et 10 000 lignes VIIRS par satellite pour une année. L'ensemble 2000–2025 tient en mémoire et ne justifie pas une base de données.

### 4.2 Non vérifié — à confirmer dans la documentation FIRMS avant de l'écrire dans l'application

Ces points viennent de connaissances générales, pas d'une lecture faite pendant cet audit :

- Résolution au nadir (≈ 1 km MODIS, ≈ 375 m VIIRS) et heures de passage (Terra en matinée, Aqua et les satellites VIIRS en début d'après-midi et de nuit).
- Signification exacte des codes `type` (0 feu de végétation présumé, 1 volcan, 2 autre source statique terrestre, 3 en mer) et des classes de confiance VIIRS (`l`, `n`, `h`).
- Interruptions de service et dérive d'orbite de Terra et Aqua en fin de vie, qui modifient l'heure d'observation et donc le nombre de détections.
- Conditions de réutilisation et formule de citation des données FIRMS.

### 4.3 Limites des données déjà identifiées

- **« Jusqu'à aujourd'hui » s'arrête à fin 2025** dans l'archive par pays. L'année 2026 demande l'API FIRMS (clé MAP_KEY gratuite, à demander par un membre de l'équipe) ou l'outil de téléchargement d'archive.
- **NOAA-21** : aucun fichier trouvé sous le nom `viirs-jpss2` ; le nom du jeu n'a pas été cherché plus loin.
- Rien n'a été téléchargé ni analysé : seuls l'existence des fichiers, leurs en-têtes, deux lignes et le nombre de lignes de 2023 ont été lus.

---

## 5. Remise en question du concept

| Question | Diagnostic | Amélioration proposée |
|---|---|---|
| Le produit répond-il au défi ? | En partie. La carte, le calendrier et les anomalies y sont. L'indice harmonisé unique manque (E1). | Faire de l'indice harmonisé le premier livrable scientifique. |
| L'harmonisation est-elle démontrable ? | Oui, grâce à 14 années communes MODIS/VIIRS (2012–2025). | Caler MODIS sur VIIRS sur la période commune, puis **tester** le calage : l'estimer sur une partie des années et mesurer l'erreur sur les autres. Afficher cette erreur. |
| Compte-t-on deux fois la même activité ? | Risque réel : VIIRS détecte plusieurs pixels là où MODIS en voit un, et deux satellites VIIRS voient le même feu. | Unité commune : la **cellule-jour active** (une cellule de grille compte une fois par jour, quel que soit le nombre de détections et de capteurs). Les détections d'origine restent rattachées à la cellule. |
| Les deux capteurs observent-ils au même moment ? | Non. Le feu varie fortement dans la journée. | Caler de préférence Aqua contre Suomi-NPP, dont les heures de passage sont proches (à confirmer, §4.2). |
| Les anomalies sont-elles justifiées ? | La méthode du cahier (médiane et dispersion robuste par mois calendaire) correspond à l'exemple de la NASA. | Médiane + écart absolu médian par mois calendaire ; statut « données insuffisantes » sous un nombre minimal d'années ; cas de dispersion nulle traité à part (mois humides sans détection). |
| Détection ou événement ? | Le cahier est déjà rigoureux. | Ajouter le cas des **sources statiques** : le champ `type` signale des points chauds industriels. Le Gabon a une activité pétrolière ; ces points doivent pouvoir être exclus du calendrier « brûlage ». Leur poids réel est à mesurer sur les données. |
| Un mois vide signifie-t-il « pas de feu » ? | Non : nuages et absence de passage masquent des feux. | Reprendre NFR-02 : jamais de « zéro feu », seulement « aucune détection ». |
| Valeur ajoutée face à FIRMS et Worldview ? | Ces outils montrent les points, capteur par capteur. Ils ne donnent ni série continue 2000–2025 ni comparaison à une médiane locale. | C'est exactement le positionnement à tenir dans le pitch : calendrier harmonisé + anomalie expliquée + méthode vérifiable. |
| Le Gabon est-il un bon terrain ? | Volume faible (≈ 2 000 détections MODIS par an) : les statistiques par province et par mois seront fragiles. | Prévoir l'agrégation au niveau national par défaut, l'affichage du nombre d'observations derrière chaque indicateur, et l'extension au bassin du Congo comme option. |

---

## 6. Diagnostic demandé (synthèse)

**Objectifs fonctionnels.** Choisir une zone et une période ; voir les détections sur une carte ; lire un calendrier mois × année harmonisé de 2000 à 2025 ; comparer une période à sa médiane historique ; repérer les périodes inhabituelles et les mois habituellement critiques ; exporter le résultat en CSV.

**Utilisateurs.** Analyste ou chercheur ; gestionnaire forestier ou de conservation ; décideur ; public averti (cahier §4). La NASA ajoute les services d'alerte et de secours.

**Parcours prioritaire.** Zone → période → carte → calendrier → anomalie expliquée → export (cahier §4.1).

**Fonctionnalités prioritaires.** F-01 à F-09, F-13, F-14 du cahier, plus l'indice harmonisé (E1), l'export CSV (E3) et la zone dessinée (E4).

**Exigences scientifiques.** Provenance par ligne ; rejet journalisé des lignes invalides ; grille et pas de temps documentés ; aucun total brut MODIS + VIIRS ; calage testé hors échantillon ; anomalies avec référence, score, seuil et taille d'échantillon visibles ; vocabulaire prudent.

**Exigences techniques.** Traitement scientifique séparé de l'interface et testable seul ; fonctionnement sans réseau pendant la démonstration ; aucune clé dans le navigateur ; vue principale en moins de 5 secondes ; utilisable sur tablette.

**Dépendances.** Archives FIRMS (vérifiées) ; clé MAP_KEY pour 2026 (absente) ; limites des provinces du Gabon (source et licence à choisir) ; fond de carte (dépend d'Internet, prévoir un repli local) ; hébergement public pour le jury ; guides de soumission et de jugement (non encore lus).

**Critères de validation.** Les tests T-01 à T-12 du cahier, complétés par : erreur du calage mesurée et affichée ; égalité entre les chiffres affichés et les chiffres calculés par le pipeline ; export CSV identique aux filtres actifs.

---

## 7. Risques

| Risque | Niveau | Parade |
|---|---|---|
| Commencer avant l'heure autorisée | Critique | Ne rien développer avant le 14 novembre ; faire confirmer par le responsable local ce qui est permis. |
| Indice harmonisé scientifiquement fragile | Élevé | Méthode simple, testée hors échantillon, incertitude affichée, séries d'origine consultables. |
| Périmètre trop large pour 48 h | Élevé | Ordre de construction du §8 ; tout ce qui vient après l'étape 5 est sacrifiable. |
| Statistiques instables sur de petits effectifs | Élevé | Seuil minimal d'années, statut « données insuffisantes », agrégation nationale par défaut. |
| Sources statiques comptées comme brûlage | Moyen | Filtre sur `type`, activé par défaut et visible. |
| Compatibilité des versions installées | Moyen | Python 3.14 et Node 25 sont très récents : vérifier à l'installation que les bibliothèques retenues les prennent en charge, sinon passer par Docker. |
| Panne réseau pendant la démonstration | Moyen | Données préchargées, limites administratives locales, repli sans fond de carte. |
| Soumission non conforme | Moyen | Lire les deux guides du 13 novembre ; rédiger la déclaration d'usage de l'IA au fil de l'eau. |

---

## 8. Plan de réalisation proposé (à partir du 14 novembre, 9 h 00)

| Ordre | Étape | Résultat vérifiable |
|---|---|---|
| 1 | Acquisition et contrôle qualité | Fichiers FIRMS 2000–2025 téléchargés, manifeste des sources, journal des rejets. |
| 2 | Normalisation et grille commune | Table de détections au schéma du cahier §7.2 ; cellules-jour actives par capteur. |
| 3 | Calage et indice harmonisé | Série mensuelle 2000–2025 unique, erreur de calage mesurée sur années mises de côté. |
| 4 | Anomalies et mois critiques | Table des évaluations (valeur, médiane, écart, seuil, statut de validité). |
| 5 | API et calendrier | Calendrier mois × année relié aux données ; détail d'une case. |
| 6 | Carte et filtres | Détections filtrées par zone, date, capteur, confiance ; fiche de détection. |
| 7 | Export CSV, page Méthode | Export conforme aux filtres ; méthode et limites lisibles dans l'application. |
| 8 | Tableau de bord, tendances | Indicateurs calculés depuis les données chargées. |
| 9 | Tests d'acceptation T-01 à T-12 | Rapport de tests distinguant réussis, échoués, non exécutés. |
| 10 | Landing page, rapport PDF, finitions | Seulement si les étapes 1 à 9 sont terminées. |
| 11 | Documentation, démonstration, soumission | README, guide de démonstration, déclaration d'usage de l'IA, dépôt avant dimanche 23 h 59. |

Choix techniques pressentis, à confirmer au démarrage : pipeline Python produisant des fichiers prétraités (pas de PostgreSQL, vu le volume) ; API FastAPI ; interface Next.js avec MapLibre GL JS.

---

## 9. Décisions attendues de l'équipe

1. **Démarrage** : attendre l'ouverture du hackathon, ou disposer d'une autorisation écrite du responsable local pour autre chose que de la préparation.
2. **Thème visuel** : sombre (prompt) ou clair (cahier §9.1).
3. **Clé FIRMS MAP_KEY** : un membre de l'équipe la demande-t-il pour couvrir 2026 ?
4. **Périmètre géographique** : Gabon seul, ou Gabon + un second territoire pour prouver la réplicabilité.
