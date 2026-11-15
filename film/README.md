# Film promotionnel Hot-Spots

| Fichier | Contenu |
|---|---|
| `hotspot-film.mp4` | Film final, 1920 × 1080, 30 i/s, H.264 + AAC, sous-titres français en piste activable |
| `hotspot-film-sous-titres.mp4` | Même film, sous-titres incrustés dans l'image (réseaux sociaux, projection sans lecteur) |
| `hotspot-film.srt` | Sous-titres synchronisés sur les mots réellement prononcés |
| `STORYBOARD.md` | Storyboard chronométré, script de la voix off, direction artistique, limites respectées |
| `voix-off.json` | Texte de la voix off, voix, débit, début de chaque scène |
| `composition/` | Le film lui-même : page HTML dessinée image par image (`film.js`), données réelles (`data.json`) |
| `tools/` | Chaîne de production complète, reproductible |

## Refaire le film

Prérequis : l'application en production (`pnpm build && pnpm start`, ici sur le port 3220), Chrome,
Node, Python avec `edge-tts`, `imageio-ffmpeg`, `numpy` et `Pillow`. `$W` désigne un dossier de travail.

```bash
# 1. Données réelles (serveur Hot-Spots + fichiers NASA FIRMS)
node film/tools/data.mjs film/composition/data.json
# 2. Voix off (voix neuronales fr-FR), minutage et vérification de la durée de chaque scène
python film/tools/voice.py film/voix-off.json $W/voix
python film/tools/durations.py film/voix-off.json $W/voix
# 3. Captures réelles de l'application (Chrome piloté, 1920 x 1080)
QUESTION_WAV=$W/question.wav node film/tools/capture.mjs $W/captures
# 4. Images des clips, tuiles Sentinel-2, enveloppes des voix ; copie du minutage
python film/tools/prepare.py $W/captures $W/voix $W/composition && cp $W/voix/timing.json $W/composition/
# 5. Rendu image par image (2 595 images), puis bande son et sous-titres
node film/tools/render.mjs $W/composition $W/images
python film/tools/audio.py $W/voix $W/son.wav
python film/tools/subtitles.py $W/voix film/hotspot-film.srt
# 6. Assemblage
python film/tools/encode.py $W/images $W/son.wav film/hotspot-film.srt film/hotspot-film.mp4
python film/tools/encode.py $W/images $W/son.wav film/hotspot-film.srt film/hotspot-film-sous-titres.mp4 --burn
```

Outils de contrôle : `render.mjs ... --stills 3.2,14,30` (images fixes), `board.py` (planche de revue),
`sheet.py` (planche horodatée d'un clip), `levels.py` (intensité sonore), `timeline.py` (minutage de la voix).

## Choix et honnêteté

- Toutes les images d'application sont des captures de la version réelle ; les accélérations et l'attente
  raccourcie de la démonstration vocale sont signalées à l'image.
- La conversation vocale a été réellement jouée : la question (voix de synthèse) est entrée par le micro simulé
  de Chrome, transcrite par le serveur, et l'assistant a répondu avec les vrais chiffres (3 978 cellules-jour,
  médiane 4 129). Dans le film, sa réponse est dite par une voix de synthèse choisie pour le montage.
- La voix off utilise des voix neuronales Microsoft (service en ligne de synthèse) : seul le texte public de la
  voix off leur est envoyé. La musique est originale, synthétisée par `audio.py` (aucun morceau tiers).
- Imagerie : NASA GIBS (Blue Marble), Sentinel-2 cloudless 2023 par EOX (Copernicus), fond de plan
  OpenStreetMap — crédités à la fin du film.
