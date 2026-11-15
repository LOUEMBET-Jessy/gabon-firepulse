"""Verification d'un MP4 livre : duree, flux, et quelques images extraites du fichier final.

Usage : python film/tools/verify.py <film.mp4> <planche.jpg> [instants separes par des virgules]
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

ff = imageio_ffmpeg.get_ffmpeg_exe()
film, board = sys.argv[1], sys.argv[2]
times = [float(x) for x in (sys.argv[3] if len(sys.argv) > 3 else "2,9,15,27,40,48,57,62,66,70,75,84").split(",")]
info = subprocess.run([ff, "-hide_banner", "-i", film], capture_output=True, text=True).stderr
h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups()
duration = int(h) * 3600 + int(m) * 60 + float(s)
print(f"durée : {duration:.2f} s ({'OK' if duration <= 90 else 'TROP LONG'} ; limite 90 s)")
for line in info.splitlines():
    if "Stream #" in line:
        print(" ", line.strip())
tmp = Path(tempfile.mkdtemp())
tiles = []
for t in times:
    out = tmp / f"{t}.jpg"
    subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-ss", str(t), "-i", film, "-frames:v", "1", "-q:v", "3", str(out)], check=True)
    tiles.append((t, Image.open(out).resize((640, 360))))
cols = 4
img = Image.new("RGB", (cols * 640, -(-len(tiles) // cols) * 360))
font = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 24)
for i, (t, tile) in enumerate(tiles):
    d = ImageDraw.Draw(tile)
    d.rectangle([0, 0, 90, 34], fill="black")
    d.text((8, 4), f"{t:g} s", fill="white", font=font)
    img.paste(tile, ((i % cols) * 640, (i // cols) * 360))
img.save(board, quality=86)
print("planche :", board)
