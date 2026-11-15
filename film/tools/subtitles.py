"""Sous-titres synchronises (SRT) d'apres le minutage reel des mots de la voix off.

Usage : python film/tools/subtitles.py <dossier voix> <sortie.srt>
Chaque ligne de voix off devient un ou plusieurs sous-titres de deux lignes au plus (42 caracteres par ligne),
coupes sur les mots, affiches pendant que les mots correspondants sont prononces.
Les repliques de la demonstration vocale sont precedees du nom de la personne qui parle.
"""

import json
import sys
from pathlib import Path

MAX = 46


def stamp(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def wrap(words: list) -> list:
    """Groupe de mots -> lignes de 42 caracteres au plus."""
    lines, cur = [], ""
    for w in words:
        if cur and len(cur) + 1 + len(w) > MAX:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    if cur:
        lines.append(cur)
    # Deux lignes : coupure la plus equilibree possible (pas de mot seul sur la seconde ligne).
    if len(lines) == 2:
        best = None
        for i in range(1, len(words)):
            a, b = " ".join(words[:i]), " ".join(words[i:])
            if len(a) <= MAX and len(b) <= MAX and (best is None or abs(len(a) - len(b)) < best[0]):
                best = (abs(len(a) - len(b)), [a, b])
        if best:
            lines = best[1]
    return lines


timing = json.loads((Path(sys.argv[1]) / "timing.json").read_text("utf-8"))
cues = []
for scene in timing:
    for ln in scene["lines"]:
        text = ln["text"]
        prefix = f"{ln['speaker']} : " if ln.get("speaker") else ""
        tokens = (prefix + text).split()
        # Decoupe en blocs de deux lignes au plus, de longueurs voisines (pas de mot isole dans un dernier bloc).
        n_blocks = 1
        while True:
            target = len(" ".join(tokens)) / n_blocks
            blocks, cur = [], []
            for tok in tokens:
                if cur and len(" ".join(cur + [tok])) > target + 6 and len(blocks) < n_blocks - 1:
                    blocks.append(cur)
                    cur = [tok]
                else:
                    cur.append(tok)
            blocks.append(cur)
            if n_blocks == 2:
                # Deux blocs : coupure de preference apres une ponctuation, sinon au plus pres du milieu.
                best = None
                for i in range(1, len(tokens)):
                    a, b = tokens[:i], tokens[i:]
                    if len(wrap(a)) > 2 or len(wrap(b)) > 2:
                        continue
                    cost = abs(len(" ".join(a)) - len(" ".join(b))) + (0 if a[-1][-1] in ",.:;…?!" else 30)
                    if best is None or cost < best[0]:
                        best = (cost, [a, b])
                if best:
                    blocks = best[1]
            if all(len(wrap(b)) <= 2 for b in blocks):
                break
            n_blocks += 1
        # Instants : proportionnels a la position dans le texte, cales sur les mots reellement prononces.
        words = ln["words"]
        total = len(tokens)
        start = ln["at"]
        idx = 0
        for b, block in enumerate(blocks):
            end_idx = idx + len(block)
            frac0, frac1 = idx / total, end_idx / total
            w0 = words[min(int(frac0 * len(words)), len(words) - 1)] if words else None
            t0 = ln["at"] + (w0["start"] if w0 and b else 0)
            t1 = ln["at"] + (words[min(int(frac1 * len(words)) - 1, len(words) - 1)]["end"] + 0.25 if words and b < len(blocks) - 1 else ln["duration"] + 0.15)
            cues.append((max(start, t0), t1, "\n".join(wrap(block))))
            start = t1
            idx = end_idx
out = []
for i, (a, b, text) in enumerate(cues, 1):
    out.append(f"{i}\n{stamp(a)} --> {stamp(b)}\n{text}\n")
Path(sys.argv[2]).write_text("\n".join(out), "utf-8")
print(len(cues), "sous-titres")
