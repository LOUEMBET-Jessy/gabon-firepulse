"""Affiche le minutage de chaque ligne de voix off (debut, fin, voix, texte).

Usage : python film/tools/timeline.py <dossier voix>
"""

import json
import sys
from pathlib import Path

for scene in json.loads((Path(sys.argv[1]) / "timing.json").read_text("utf-8")):
    for ln in scene["lines"]:
        who = ln.get("speaker") or "Narrateur"
        print(f"{ln['at']:6.2f} {ln['at'] + ln['duration']:6.2f}  {scene['id']:<10} {who:<13} {ln['text']}")
