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

# 2. Application
cd web
pnpm install                   # ou : npm install
pnpm dev                       # ou : npm run dev   ->  http://localhost:3210
```

Pour une version de production : `pnpm build` puis `pnpm start`.

L'application lit une copie locale des données : elle fonctionne sans connexion. Seuls le fond de carte « relief NASA Blue Marble » (désactivé par défaut) et l'assistant IA ont besoin du réseau.

## Activer l'assistant IA

Hot-Spot AI utilise l'API Claude d'Anthropic, appelée **uniquement côté serveur**. Sans clé, l'application reste entièrement utilisable : l'assistant l'indique clairement et propose la visite guidée, des questions fréquentes et des raccourcis, sans prétendre répondre.

1. Copiez `web/.env.example` en `web/.env.local`.
2. Renseignez `ANTHROPIC_API_KEY`.
3. Redémarrez le serveur.

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé de l'API Claude (ou `ANTHROPIC_AUTH_TOKEN`) | absente : assistant hors ligne |
| `HOTSPOT_AI_MODEL` | Modèle utilisé | `claude-opus-5-5` |
| `HOTSPOT_AI_EFFORT` | Profondeur de réflexion : `low`, `medium` ou `high` | `low` |
| `HOTSPOT_AI_RATE_LIMIT` | Requêtes par visiteur et par fenêtre de 10 minutes | 30 |
| `HOTSPOT_AI_DAILY_LIMIT` | Requêtes par jour pour tout le serveur (garde-fou de coût) | 1000 |
| `HOTSPOT_AI_DISABLED` | `1` pour couper l'assistant sans retirer la clé | non défini |

Les requêtes activent le repli serveur en cas de refus de sécurité (`server-side-fallback-2026-07-01`, mode `default`) : une demande refusée par les filtres du modèle principal est rejouée sur un modèle de repli choisi par l'API. Retirez `betas` et `fallbacks` dans `web/src/lib/ai/service.ts` pour le désactiver.

### Ce que l'assistant peut faire

- **Expliquer** : les écrans, les notions (détection, indice harmonisé, période inhabituelle), la méthode et ses limites, et montrer où se trouve une fonction en la mettant en évidence.
- **Agir**, avec les fonctions de l'application : changer la zone, la période, la vue de la carte ou du calendrier, ouvrir la comparaison des capteurs ou les périodes inhabituelles, lancer la visite guidée.
- **Préparer un export** : le téléchargement attend toujours la confirmation de l'utilisateur.
- **Interpréter** : il lit les vrais chiffres par des outils serveur (synthèse d'une période, historique, détail d'un mois, classement des provinces, faits de méthode) et structure sa réponse en « Observé, Interprétation, Limites ».

Il ne peut ni modifier les données ni changer un paramètre scientifique. Ses règles (pas d'incendie confirmé, pas de prédiction, pas de total MODIS plus VIIRS, aucun chiffre inventé) sont dans `web/src/lib/ai/prompt.ts`.

### Sécurité

- La clé reste dans l'environnement du serveur ; le navigateur n'appelle que `/api/assistant`.
- Chaque paramètre d'action proposé par le modèle est validé côté serveur (zone connue, dates dans la couverture, valeurs autorisées) ; un paramètre invalide ne produit aucune action.
- Le contexte envoyé par le navigateur est revalidé. Les messages utilisateur et les résultats d'outils sont traités comme des données, jamais comme des instructions.
- Limitation par visiteur (empreinte de l'adresse, l'adresse elle-même n'est pas conservée) et quota quotidien global. Le contenu des conversations n'est pas journalisé ; la conversation n'est gardée que dans l'onglet du navigateur.

## Organisation du dépôt

```
pipeline/            traitement scientifique en Python (acquisition, contrôle, harmonisation) et ses tests
data/raw/            fichiers sources NASA FIRMS et geoBoundaries, avec manifeste de provenance
web/data/            données traitées lues par l'application
web/src/lib/server/  moteur d'agrégation par zone, requêtes, API internes
web/src/lib/science/ statistiques robustes et évaluation des périodes inhabituelles
web/src/lib/ai/      service de l'assistant : configuration, instructions, outils, limitation
web/src/lib/assistant/ protocole navigateur-serveur, visite guidée, aide hors ligne
web/src/components/  interface : marque, graphiques, carte, assistant
web/src/app/         pages (accueil, vue d'ensemble, carte, calendrier, tendances, comparaison, périodes inhabituelles, rapports, méthode) et routes d'API
web/e2e/             parcours de test dans un vrai navigateur
```

## Tests

```bash
python -m unittest discover -s pipeline/tests   # 13 tests du pipeline
cd web
pnpm test                                       # 46 tests : statistiques, moteur, cohérence avec le pipeline, assistant
pnpm dev                                        # puis, dans un autre terminal :
node e2e/flows.mjs                              # 20 parcours d'acceptation (Chrome installé requis)
node e2e/assistant.mjs                          # 9 parcours de l'assistant
```

Les tests de l'assistant n'appellent jamais le fournisseur IA : un client simulé rejoue des réponses du modèle (tests unitaires) ou la réponse réseau de `/api/assistant` est remplacée (tests navigateur). Ils vérifient la boucle d'outils, la validation, l'exécution des actions et les confirmations, **pas la qualité des réponses du modèle**, qui demande une clé.

## Méthode en bref

Détections retenues : feu de végétation présumé, confiance non faible. Unité : cellules de 0,05° actives par jour, en équivalent VIIRS Suomi-NPP. MODIS est calé sur VIIRS par mois calendaire sur les années communes 2012 à 2025 (erreur annuelle moyenne de 9,9 % hors échantillon), puis ajusté à chaque zone. Un seul capteur alimente chaque jour. Une période est inhabituelle quand son score robuste dépasse 2 en valeur absolue par rapport au même mois des autres années. Le détail, les chiffres de validation et les limites sont sur la page « Méthode et données » de l'application.

Le document `PROJECT_AUDIT.md` est l'audit initial du 13 novembre 2026, rédigé sous l'ancien nom du projet ; il est conservé tel quel.
