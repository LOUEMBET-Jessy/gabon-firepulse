"""Planche de revue : les images fixes du rendu, en grille, avec leur instant.

Usage : python film/tools/board.py <dossier stills> <sortie.jpg> [colonnes] [largeur vignette]
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

folder, out = Path(sys.argv[1]), sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
tw = int(sys.argv[4]) if len(sys.argv) > 4 else 600
files = sorted(folder.glob("still-*.jpg"), key=lambda p: float(p.stem[6:].replace("_", ".")))
th = tw * 9 // 16
rows = -(-len(files) // cols)
board = Image.new("RGB", (cols * tw, rows * th), "black")
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 26)
for i, f in enumerate(files):
    im = Image.open(f).resize((tw, th), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    label = f.stem[6:].replace("_", ".") + " s"
    d.rectangle([0, 0, 110, 36], fill="black")
    d.text((8, 4), label, fill="white", font=font)
    board.paste(im, ((i % cols) * tw, (i // cols) * th))
board.save(out, quality=88)
print(len(files), "images")
