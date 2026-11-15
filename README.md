# Hot-Spot

**Observer. Comprendre. Préserver.**

Hot-Spot rend lisibles 25 ans de détections de feux actifs observées par les satellites MODIS et VIIRS de la NASA (archives NASA FIRMS), avec le Gabon pour territoire pilote. La plateforme harmonise les deux familles de capteurs en une série continue de novembre 2000 à décembre 2025, puis propose une carte, un calendrier historique, des tendances, une comparaison des capteurs, la détection des périodes inhabituelles et un assistant IA, Hot-Spot AI.

Projet étudiant indépendant réalisé pour le NASA Space Apps Challenge 2026, défi « Harmonization of MODIS and VIIRS Hot Spots ». Ce n'est ni un produit officiel de la NASA ni un service d'alerte incendie.

## Lancer l'application

Prérequis : Python 3.11 ou plus récent avec `numpy` et `pandas`, Node.js 20 ou plus récent, pnpm (ou npm).

```bash
# 1. Données (déjà présentes dans le dépôt ; à relancer seulement pour les régénérer)
python pipeline/acquire.py     # télécharge les archives FIRMS et les limites administratives dans data/raw/
python pipeline/build.py       # contrôle, harmonise et écrit web/data/ et web/public/geo/
python pipeline/geography.py   # pays du monde, départements et localités du Gabon (après build.py)
HOTSPOT_COUNTRY=FRA python pipeline/acquire.py     # même chaîne pour la France métropolitaine
HOTSPOT_COUNTRY=FRA python pipeline/build.py       # -> web/data/fra/ et web/public/geo/fra/
HOTSPOT_COUNTRY=FRA python pipeline/geography.py

# 2. Application
cd web
pnpm install                   # ou : npm install
pnpm dev                       # ou : npm run dev   ->  http://localhost:3210
```

Pour une version de production : `pnpm build` puis `pnpm start`.

L'application lit une copie locale des données : elle fonctionne sans connexion. Seuls le fond de carte « relief NASA Blue Marble » (désactivé par défaut) et l'assistant IA ont besoin du réseau.

## Deux pays : Gabon et France métropolitaine

Le sélecteur « Gabon | France » de la barre du haut fait basculer tous les écrans (vue d'ensemble, carte, calendrier, tendances, comparaison des capteurs, périodes inhabituelles, rapports, assistant) sur l'archive du pays choisi. Chaque pays a sa chaîne complète : archives FIRMS annuelles 2000-2025, contrôle, calage MODIS vers VIIRS mesuré et validé sur ses propres années communes, références saisonnières. En France : 13 régions, 96 départements, villes de plus de 5 000 habitants (GeoNames). La sélection (pays, zone, période) est gardée dans un cookie de session : le serveur rend directement le bon écran.

## Précision de la carte

- **Fond détaillé « Rues et quartiers »** (OpenStreetMap, en ligne, désactivé par défaut) : rues, quartiers et lieux-dits jusqu'au zoom 18.
- **Emprise réelle des pixels** : à partir du zoom 10, chaque détection est entourée du rectangle de son pixel au sol (`scan` × `track` publiés par la NASA, environ 0,4 km pour VIIRS et 1 km ou plus pour MODIS). Le feu est quelque part dans ce rectangle : en dessous de cette taille, aucune donnée satellitaire ne permet de dire dans quel quartier il se trouvait. Les quartiers sont donc des repères de lecture, pas des zones d'analyse.

## Explorer depuis le globe

La carte s'ouvre sur un globe 3D (MapLibre, projection globe, atmosphère). À la première visite, elle part de l'espace et rejoint le Gabon.

- **Navigation** : un fil d'Ariane (Terre, continent, pays, province, département, localité) et une recherche de lieux. Un clic sur un pays fait voyager le globe ; au Gabon, un clic sur une province, un département ou un village ouvre sa fiche sans déplacer la carte.
- **Niveaux de détail** : continents en vue Terre, provinces à l'échelle du pays, départements et villes en se rapprochant, villages au plus près. Les détections sont regroupées en anneaux (part de chaque capteur MODIS, Suomi-NPP, NOAA-20) en vue lointaine, puis affichées une à une.
- **Fiche du territoire** : indice de la période et statut saisonnier, détections par capteur, totaux annuels depuis 2000 et tendance, derniers mois inhabituels, classement des sous-territoires. « Analyser ce territoire » en fait la zone de tous les écrans.
- **Nouvelles zones d'analyse** : les 49 départements (`department:<indice>`) et les localités (`place:<identifiant GeoNames>`, disque de 15 km). Calendrier, tendances, périodes inhabituelles, exports et assistant s'y appliquent.

Sources : Natural Earth (pays, domaine public), geoBoundaries ADM2 (départements, CC BY 3.0, état 2018), GeoNames (localités, CC BY 4.0), copies dans `data/raw/world`, `data/raw/boundaries`, `data/raw/places`. **Seul le Gabon a des détections chargées** : les autres pays servent de repères et leur fiche le dit. Les indicateurs locaux aident à prioriser des vérifications de terrain ; ils ne prédisent rien.

## Observatoire temps réel (NASA FIRMS)

Sur la carte, « Observations » bascule entre l'**archive 2000-2025** (harmonisée, base de tous les calculs) et le **temps réel** : les dernières détections MODIS (Terra, Aqua) et VIIRS (Suomi-NPP, NOAA-20, NOAA-21) publiées par la NASA pour le **Gabon** et la **France métropolitaine**.

- **Sources** : sans clé, les fichiers officiels « active fire » de FIRMS (7 derniers jours, régions « Northern and Central Africa » et « Europe »). Avec une clé `FIRMS_MAP_KEY` (gratuite, à demander sur firms.modaps.eosdis.nasa.gov) dans `web/.env.local`, le serveur passe à l'API « area » de FIRMS, limitée à l'emprise de chaque pays, jusqu'à 10 jours.
- **Actualisation maîtrisée** : chaque flux (capteur × pays) est vérifié au plus toutes les 10 minutes, à l'ouverture ou au rafraîchissement de la page, par requête conditionnelle : rien n'est retéléchargé si la NASA n'a rien publié. Le bouton « Actualiser » force une vérification (au plus toutes les 2 minutes). Les copies sont gardées en mémoire et dans `web/.cache/live/` : si FIRMS est injoignable, la dernière copie est servie et marquée « ancienne ».
- **Affichage** : carrés pour MODIS, disques pour VIIRS, halo pour les détections de moins de 24 h. La fiche donne l'acquisition (UTC), le satellite, le capteur, la confiance native, la puissance radiative, la région ou province, le département, le produit et la date de synchronisation.
- **Filtres** : pays, période (24 h, 48 h, 7 jours), satellite. La fiche d'un pays classe ses régions (France) ou provinces (Gabon), puis leurs départements.
- **Limites** : produits NRT, non harmonisés et révisables par la NASA ; ils ne rejoignent jamais l'archive ni ses calculs. Les produits temps réel ne distinguent pas toujours les sources industrielles des feux. Une détection n'est jamais un incendie confirmé. La latence réelle (souvent plusieurs heures) et l'absence d'un satellite (Suomi-NPP n'a rien publié depuis le 12 novembre 2026) sont affichées telles quelles.

Limites de la France : geoBoundaries (régions et départements, Licence Ouverte Etalab 2.0, état 2022), simplifiées par `pipeline/geography.py`.

## Activer l'assistant IA

Hot-Spot AI fonctionne avec **Google Gemini** ou **Anthropic Claude**, appelés **uniquement côté serveur**. Sans clé, l'application reste entièrement utilisable : l'assistant l'indique clairement et propose la visite guidée, des questions fréquentes et des raccourcis, sans prétendre répondre.

1. Copiez `web/.env.example` en `web/.env.local`.
2. Renseignez `GEMINI_API_KEY` (ou `ANTHROPIC_API_KEY`).
3. Reconstruisez si besoin et redémarrez le serveur (`pnpm build` puis `pnpm start`, ou `pnpm dev`).

| Variable | Rôle | Défaut |
|---|---|---|
| `GEMINI_API_KEY` | Clé de l'API Gemini (Google AI Studio) | absente |
| `GEMINI_MODEL` | Modèle Gemini principal | `gemini-3.8-flash` |
| `GEMINI_FALLBACK_MODELS` | Modèles de secours, séparés par des virgules | `gemini-3.5-flash,gemini-3.1-flash-lite` |
| `ANTHROPIC_API_KEY` | Clé de l'API Claude (ou `ANTHROPIC_AUTH_TOKEN`) | absente |
| `HOTSPOT_AI_MODEL` | Modèle Claude | `claude-opus-5-5` |
| `HOTSPOT_AI_PROVIDER` | `gemini` ou `anthropic` pour forcer le choix | Gemini si sa clé est présente |
| `HOTSPOT_AI_EFFORT` | Profondeur de réflexion : `low`, `medium` ou `high` | `low` |
| `HOTSPOT_AI_TIMEOUT_MS` | Délai maximal d'un appel au fournisseur | 25 000 |
| `HOTSPOT_AI_RATE_LIMIT` | Requêtes par visiteur et par fenêtre de 10 minutes | 30 |
| `HOTSPOT_AI_DAILY_LIMIT` | Requêtes par jour pour tout le serveur (garde-fou de coût) | 1000 |
| `HOTSPOT_AI_DISABLED` | `1` pour couper l'assistant sans retirer la clé | non défini |

**Gemini et la surcharge.** Les modèles Gemini récents sont parfois saturés (erreurs 503 ou 504). Chaque appel est limité à 25 secondes, sans nouvel essai sur le même modèle. Si le modèle principal échoue à n'importe quelle étape, le tour entier est rejoué avec le premier modèle de secours disponible, puis le suivant. Un modèle qui vient d'échouer est mis de côté 5 minutes. L'assistant indique sous sa réponse quand un modèle de secours a répondu.

**Claude.** Les requêtes activent le repli serveur en cas de refus de sécurité (`server-side-fallback-2026-07-01`, mode `default`). Retirez `betas` et `fallbacks` dans `web/src/lib/ai/service.ts` pour le désactiver.

### Ce que l'assistant peut faire

- **Expliquer** : les écrans, les notions (détection, indice harmonisé, période inhabituelle), la méthode et ses limites, et montrer où se trouve une fonction en la mettant en évidence.
- **Agir**, avec les fonctions de l'application : changer la zone, la période, la vue de la carte ou du calendrier, ouvrir la comparaison des capteurs ou les périodes inhabituelles, lancer la visite guidée.
- **Préparer un export** : le téléchargement attend toujours la confirmation de l'utilisateur.
- **Interpréter** : il lit les vrais chiffres par des outils serveur (synthèse d'une période, historique, détail d'un mois, classement des provinces, faits de méthode) et structure sa réponse en « Observé, Interprétation, Limites ».

- **Converser à voix haute** : le bouton micro du panneau ouvre une conversation vocale. Vous parlez, l'assistant applique les actions demandées, répond en 1 à 3 phrases lues à voix haute, puis vous écoute de nouveau. Chaque échange reste écrit dans la conversation, et chaque réponse écrite a aussi un bouton « Écouter ».

Il ne peut ni modifier les données ni changer un paramètre scientifique. Ses règles (pas d'incendie confirmé, pas de prédiction, pas de total MODIS plus VIIRS, aucun chiffre inventé) sont dans `web/src/lib/ai/prompt.ts`.

### Conversation vocale

- **Reconnaissance de la parole.** Dans Chrome et Edge, la dictée intégrée du navigateur transcrit en direct (`fr-FR`). Si elle manque ou échoue (Firefox, Safari, service de dictée injoignable), le navigateur enregistre la question, détecte la fin de la parole (1,3 s de silence), puis l'envoie à `/api/assistant/transcribe`, qui la fait transcrire par Gemini. Ce repli n'existe qu'avec le fournisseur Gemini. Pour le forcer, exécutez `localStorage.setItem("hotspot.voice.engine", "server")` dans la console du navigateur.
- **Réponse parlée.** Elle passe par la synthèse vocale du navigateur, avec une voix française si le système en a une. En mode vocal, l'assistant reçoit une consigne de réponse courte, sans mise en forme.
- **Contrôles.** « J'ai fini » pour envoyer sans attendre le silence, « Couper la parole », « Pause », « Reprendre », « Terminer » (ou la touche Échap). Après deux silences de suite, la conversation se met en pause.
- **Confidentialité.** Le micro n'est ouvert que pendant l'écoute. L'audio n'est ni conservé ni journalisé. Une transcription compte dans les mêmes limites de requêtes que les questions. Les envois sont limités à 2 Mo, au format webm, ogg, mp4, mpeg, aac ou wav.
- **Prérequis.** Le micro exige une page sécurisée : HTTPS, ou `localhost` en développement.

### Sécurité

- Les clés restent dans l'environnement du serveur (`web/.env.local`, ignoré par git) ; le navigateur n'appelle que `/api/assistant`.
- Chaque paramètre d'action proposé par le modèle est validé côté serveur (zone connue, dates dans la couverture, valeurs autorisées) ; un paramètre invalide ne produit aucune action.
- Le contexte envoyé par le navigateur est revalidé. Les messages utilisateur et les résultats d'outils sont traités comme des données, jamais comme des instructions.
- Limitation par visiteur (empreinte de l'adresse, l'adresse elle-même n'est pas conservée) et quota quotidien global. Le contenu des conversations n'est pas journalisé ; la conversation n'est gardée que dans l'onglet du navigateur.

## Organisation du dépôt

```
pipeline/            traitement scientifique en Python (acquisition, contrôle, harmonisation) et ses tests
data/raw/            fichiers sources NASA FIRMS, geoBoundaries, Natural Earth et GeoNames, avec manifeste de provenance
web/data/            données traitées lues par l'application
web/src/lib/server/  moteur d'agrégation par zone, requêtes, API internes
web/src/lib/science/ statistiques robustes et évaluation des périodes inhabituelles
web/src/lib/ai/      service de l'assistant : configuration, instructions, outils, fournisseurs Claude et Gemini, limitation
web/src/lib/assistant/ protocole navigateur-serveur, visite guidée, aide hors ligne
web/src/components/  interface : marque, graphiques, carte, assistant
web/src/app/         pages (accueil, vue d'ensemble, carte, calendrier, tendances, comparaison, périodes inhabituelles, rapports, méthode) et routes d'API
web/e2e/             parcours de test dans un vrai navigateur
```

## Tests

```bash
python -m unittest discover -s pipeline/tests   # 13 tests du pipeline
cd web
pnpm test                                       # 75 tests : statistiques, moteur, cohérence avec le pipeline, géographie, France, temps réel, assistant (Claude, Gemini, voix)
pnpm dev                                        # puis, dans un autre terminal :
node e2e/flows.mjs                              # 20 parcours d'acceptation (Chrome installé requis)
node e2e/assistant.mjs                          # 9 parcours de l'assistant
node e2e/assistant-live.mjs                     # 8 essais avec le vrai fournisseur IA (clé requise, requêtes facturées)
node e2e/voice-live.mjs question.wav            # conversation vocale complète : un fichier WAV sert de micro (clé requise)
node e2e/globe.mjs                              # 4 parcours du globe : anneaux par capteur, département, localité, arrivée depuis l'espace
node e2e/france.mjs                             # 3 parcours de l'archive France : bascule, chiffres, région
node e2e/live.mjs                               # 3 parcours de l'observatoire temps réel (réseau requis : données NASA FIRMS réelles)
```

Les tests unitaires et navigateur de l'assistant n'appellent pas le fournisseur IA : un client simulé rejoue des réponses du modèle, ou la réponse réseau de `/api/assistant` est remplacée. Ils vérifient la boucle d'outils, la validation, l'exécution des actions et les confirmations. Le comportement du vrai modèle (refus d'une suppression, résistance à une injection, export non annoncé comme téléchargé, données 2026 absentes) est vérifié par `e2e/assistant-live.mjs`.

## Méthode en bref

Détections retenues : feu de végétation présumé, confiance non faible. Unité : cellules de 0,05° actives par jour, en équivalent VIIRS Suomi-NPP. MODIS est calé sur VIIRS par mois calendaire sur les années communes 2012 à 2025 (erreur annuelle moyenne de 9,9 % hors échantillon), puis ajusté à chaque zone. Un seul capteur alimente chaque jour. Une période est inhabituelle quand son score robuste dépasse 2 en valeur absolue par rapport au même mois des autres années. Le détail, les chiffres de validation et les limites sont sur la page « Méthode et données » de l'application.

Le document `PROJECT_AUDIT.md` est l'audit initial du 13 novembre 2026, rédigé sous l'ancien nom du projet ; il est conservé tel quel.
