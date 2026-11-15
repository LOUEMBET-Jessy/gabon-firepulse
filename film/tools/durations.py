"""Duree de chaque ligne de voix off et place dans le minutage du film (verifie que chaque scene tient).

Usage : python film/tools/durations.py film/voix-off.json <dossier voix>
Les debuts de scene viennent de voix-off.json ; chaque ligne suit la precedente apres une pause.
"""

import json
import re
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
# Fin de chaque scene (secondes) : la voix doit s'arreter avant, avec une respiration.
SCENE_END = {"probleme": 12.4, "solution": 24.8, "fonctions": 46.0, "assistant": 68.2, "impact": 86.0}
GAP = 0.45  # pause par defaut entre deux lignes


def duration(path: Path) -> float:
    out = subprocess.run([FFMPEG, "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out).groups()
    return int(h) * 3600 + int(m) * 60 + float(s)


spec = json.loads(Path(sys.argv[1]).read_text("utf-8"))
folder = Path(sys.argv[2])
starts = {s["id"]: s["start"] for s in spec["scenes"]}
timing = json.loads((folder / "timing.json").read_text("utf-8"))
ok_all = True
for scene in timing:
    scene["start"] = starts[scene["id"]]
    t = scene["start"]
    for ln in scene["lines"]:
        # Duree utile : jusqu'a la fin du dernier mot (+ 0,2 s) ; la synthese ajoute ~0,9 s de silence final.
        full = duration(folder / ln["file"])
        last = ln["words"][-1]["end"] + 0.2 if ln["words"] else full
        ln["duration"] = round(min(full, last), 3)
        ln["at"] = round(t, 3)
        t += ln["duration"] + (ln.get("gap") or GAP)
    end = scene["lines"][-1]["at"] + scene["lines"][-1]["duration"]
    ok = end <= SCENE_END[scene["id"]]
    ok_all &= ok
    print(f"{scene['id']:<10} {scene['start']:5.1f} -> {end:5.2f} s (limite {SCENE_END[scene['id']]}) {'ok' if ok else 'TROP LONG'}")
(folder / "timing.json").write_text(json.dumps(timing, ensure_ascii=False, indent=1), "utf-8")
sys.exit(0 if ok_all else 1)
