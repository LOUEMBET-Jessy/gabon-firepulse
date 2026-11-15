"""Prepare la composition : images des clips (JPEG, 30 i/s), tuiles satellite, enveloppes audio.

Usage : python film/tools/prepare.py <dossier captures> <dossier voix> <dossier composition>
- clips/<nom>/00001.jpg ... : chaque clip capture, image par image ;
- assets/s2-*.jpg : tuiles Sentinel-2 cloudless (EOX) du Haut-Ogooue, pour l'illustration des pixels ;
- envelopes.json : niveau sonore (30 valeurs par seconde) des repliques de la demonstration vocale,
  pour animer les ondes a l'image au rythme reel des voix.
"""

import json
import subprocess
import sys
import urllib.request
from pathlib import Path

import imageio_ffmpeg
import numpy as np

ff = imageio_ffmpeg.get_ffmpeg_exe()
captures, voice, comp = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])

# 1. Images des clips.
counts = {}
for clip in sorted(captures.glob("*.mp4")):
    out = comp / "clips" / clip.stem
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob("*.jpg"):
        old.unlink()
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", str(clip), "-q:v", "3", str(out / "%05d.jpg")], check=True)
    counts[clip.stem] = len(list(out.glob("*.jpg")))
(comp / "clips" / "counts.json").write_text(json.dumps(counts, indent=1), "utf-8")
print("clips", counts)

# 2. Tuiles Sentinel-2 cloudless 2023 (EOX), zoom 13 autour de Franceville (Haut-Ogooue), mosaique 2 x 2.
assets = comp / "assets"
assets.mkdir(exist_ok=True)
for dx in (0, 1):
    for dy in (0, 1):
        x, y = 4404 + dx, 4132 + dy
        target = assets / f"s2-{dx}{dy}.jpg"
        if not target.exists():
            url = f"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/GoogleMapsCompatible/13/{y}/{x}.jpg"
            req = urllib.request.Request(url, headers={"User-Agent": "hotspot-film/1.0"})
            target.write_bytes(urllib.request.urlopen(req, timeout=30).read())
print("tuiles ok")

# 3. Enveloppes des repliques (voix de la demonstration vocale).
timing = json.loads((voice / "timing.json").read_text("utf-8"))
env = {}
for scene in timing:
    for ln in scene["lines"]:
        if not ln.get("speaker"):
            continue
        pcm = subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-i", str(voice / ln["file"]), "-f", "s16le", "-ac", "1", "-ar", "24000", "-"], capture_output=True, check=True).stdout
        a = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768
        hop = 24000 // 30
        rms = [float(np.sqrt(np.mean(a[i : i + hop] ** 2))) for i in range(0, len(a) - hop, hop)]
        peak = max(rms) or 1
        env[ln["speaker"]] = {"at": ln["at"], "values": [round(v / peak, 3) for v in rms]}
(comp / "envelopes.json").write_text(json.dumps(env), "utf-8")
print("enveloppes", {k: len(v["values"]) for k, v in env.items()})
