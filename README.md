# Gabon FirePulse

Calendrier harmonisé de l'activité des feux détectée par satellite au Gabon, de novembre 2000 à décembre 2025, à partir des détections **MODIS** (Terra, Aqua) et **VIIRS** (Suomi-NPP, NOAA-20) de NASA FIRMS.

Projet réalisé pour le **NASA Space Apps Challenge 2026**, défi 08 « Harmonization of MODIS and VIIRS Hot Spots ».

> Projet étudiant indépendant. Gabon FirePulse n'est ni un produit officiel de la NASA, ni un service d'alerte incendie. Une détection est une anomalie thermique observée par satellite, pas un incendie confirmé.

---

## Démarrage rapide

Prérequis : **Node.js 22 ou plus récent**. Python n'est nécessaire que pour reconstruire les données.

```bash
cd web
npm install        # première fois seulement
npm run dev
```

Ouvrir ensuite **http://localhost:3210** dans le navigateur.

Les données traitées sont déjà présentes dans `web/data/`. L'application fonctionne donc **sans connexion internet** (mode démo) : aucune clé d'API et aucune variable d'environnement ne sont nécessaires.

Version de production :

```bash
cd web
npm run build
npm run start      # http://localhost:3210
```

## Écrans

| Écran | Rôle | Exigences couvertes |
|---|---|---|
| Accueil `/` | Présentation du problème, de la méthode et des limites | F-13 |
| Tableau de bord `/dashboard` | Indicateurs clés, guide « Par où commencer », saison, provinces | 4.2 Vue d'ensemble |
| Carte `/map` | Points natifs par satellite ou grille harmonisée, filtres, fiche de détection, dessin d'une zone | F-01, F-05, F-10 |
| Calendrier `/calendar` | Carte de chaleur année × mois, ou par semaine, jour ou année | F-06, T-07 |
| Tendances `/trends` | Série continue depuis 2000, tendance robuste, ce que l'harmonisation corrige | F-07, F-08 |
| Périodes inhabituelles `/anomalies` | Écart à la référence saisonnière, score, fiabilité, méthode | F-09, T-08 |
| Comparer deux zones `/compare` | Deux territoires côte à côte, en densité (pour 1 000 km²) | 3.3 « comparaison de deux zones » |
| Statistiques détaillées `/statistics` | Indicateurs par capteur, variations annuelles, qualité des données | F-07, F-14 |
| Rapports et exports `/reports` | Rapport PDF imprimable, CSV et GeoJSON | F-12 |
| Comprendre les données `/understand` | Pédagogie : détection, activité, incendie confirmé ; tailles de pixel ; lecture d'une anomalie ; glossaire | F-13, profil « grand public averti » |
| Données et sources `/data` | État de l'import : fichiers par année, couverture par satellite, contrôles et journal de qualité | F-03, F-04, NFR-03, T-01 à T-03 |
| Méthode détaillée `/methodology` | Sources, chaîne de traitement, calage, validation, limites | F-13, F-14, L-03 |

Zone et période se choisissent en haut de chaque écran et s'appliquent partout. Le bouton **Guide** rappelle le parcours d'analyse. Le sélecteur de **thème** (clair, sombre ou système) est mémorisé dans le navigateur.

## Architecture

```
data/raw/                 Fichiers bruts téléchargés (FIRMS, geoBoundaries) + manifest.json
pipeline/                 Traitement scientifique, en Python
  acquire.py              A. Acquisition : téléchargement et empreintes SHA-256
  build.py                B à F. Contrôle qualité, normalisation, grille, calage, sorties
  firepulse/              Modules : config, ingest, geo, harmonize
  tests/                  Tests unitaires (T-01 à T-03 et règles d'harmonisation)
web/                      Application Next.js (interface + API)
  data/                   Données traitées lues par le serveur (format colonne)
  public/geo/             Limites administratives affichées sur la carte
  src/app/api/            API : metadata, detections, aggregates, calendar, anomalies, export...
  src/lib/server/         Moteur de requêtes et d'agrégation côté serveur
  src/lib/science/        Statistiques et détection d'anomalies (testées)
  src/app/(platform)/     Écrans de l'application
  e2e/                    Parcours d'acceptation dans un vrai navigateur
```

Données brutes, données traitées et données affichées sont séparées (cahier des charges, 8.3). Il n'y a pas de base de données : le pipeline produit des fichiers pré-calculés que l'API lit en mémoire.

### API

| Endpoint | Contenu |
|---|---|
| `GET /api/metadata` | Sources, couverture, provenance, bilan qualité, paramètres de la méthode |
| `GET /api/detections?zone=&from=&to=&sats=&conf=&types=&dn=` | Détections natives filtrées |
| `GET /api/detections/{id}` | Fiche complète d'une détection et renvoi à sa ligne dans le fichier FIRMS |
| `GET /api/aggregates?zone=&from=&to=` | Grille harmonisée de 0,05° |
| `GET /api/calendar?zone=` | Série mensuelle, référence saisonnière, tendances |
| `GET /api/daily?zone=` | Série journalière harmonisée |
| `GET /api/overview?zone=&from=&to=` | Indicateurs d'une période |
| `GET /api/regions?from=&to=` | Indicateurs par province |
| `GET /api/anomalies?zone=` | Mois signalés et détail du calcul |
| `GET /api/export?kind=&format=` | Exports CSV et GeoJSON |

`zone` vaut `country`, `province:<index>` ou `bbox:<ouest>,<sud>,<est>,<nord>`.

## Méthode, en bref

1. **Filtrer** : seules les détections « feu de végétation présumé » et de confiance non faible entrent dans l'indice.
2. **Compter** : une cellule de 0,05° (environ 5,5 km) compte une fois par jour où elle est active, quel que soit le nombre de pixels.
3. **Caler** : sur les années communes (2012 à 2025), MODIS est converti en équivalent VIIRS Suomi-NPP, mois par mois. Le facteur est ajusté à chaque zone.
4. **Relayer** : chaque jour est alimenté par un seul capteur (VIIRS dès qu'il observe). MODIS et VIIRS ne sont jamais additionnés.
5. **Signaler** : un mois est inhabituel si son score robuste, `(valeur − médiane) / (1,4826 × MAD)` calculé sur le même mois des autres années, dépasse 2 (3,5 pour « très supérieur »). Il faut au moins 10 années de référence, sinon le mois est classé « données insuffisantes ».

Le détail, les chiffres de validation et les limites se trouvent sur l'écran **Méthode et données**.

## Reconstruire les données (facultatif)

```bash
pip install -r pipeline/requirements.txt
python pipeline/acquire.py     # télécharge les archives FIRMS par pays et les limites geoBoundaries
python pipeline/build.py       # régénère web/data/ et web/public/geo/
```

`acquire.py` ne retélécharge pas un fichier déjà présent (option `--force` pour forcer). Les archives annuelles FIRMS par pays sont publiques et ne demandent pas de clé.

## Tests

```bash
# Pipeline Python (T-01 à T-03, harmonisation)
python -m unittest discover -s pipeline/tests -v

# Application : calculs scientifiques et moteur de requêtes
cd web
npm test
npm run typecheck
npm run lint

# Parcours d'acceptation dans Chrome (le serveur doit tourner sur le port 3210)
node e2e/flows.mjs
node e2e/shots.mjs e2e/output             # captures de tous les écrans
THEME=light node e2e/shots.mjs e2e/output # captures en thème clair
```

## Sources et crédits

- **Détections** : NASA FIRMS, archives annuelles par pays (Gabon). MODIS (Terra, Aqua), pixels de 1 km, version indiquée par le champ `version` de chaque fichier. VIIRS 375 m (Suomi-NPP, NOAA-20). Fichiers téléchargés le 13 novembre 2026.
  Nous remercions le Fire Information for Resource Management System (FIRMS) de la NASA pour l'usage de ses données.
- **Limites administratives** : geoBoundaries (gbOpen, GAB ADM0 et ADM1), licence CC BY-SA 3.0.
- **Fond de carte facultatif** : NASA GIBS, Blue Marble.

L'archive s'arrête au 31 décembre 2025 : l'année 2026 n'était pas publiée dans l'archive par pays à la date de téléchargement. L'application affiche des données historiques, pas du temps réel.
