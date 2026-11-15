"""Planche horodatee d'un clip : une vignette toutes les `pas` secondes, avec l'instant inscrit.

Usage : python film/tools/sheet.py <clip.mp4> <sortie.jpg> <pas en s> [colonnes]
"""

import subprocess
import sys

import imageio_ffmpeg

ff = imageio_ffmpeg.get_ffmpeg_exe()
clip, out, step = sys.argv[1], sys.argv[2], float(sys.argv[3])
cols = int(sys.argv[4]) if len(sys.argv) > 4 else 5
font = "C\\:/Windows/Fonts/arialbd.ttf"
vf = (
    f"fps=1/{step},scale=480:-1,"
    f"drawtext=fontfile='{font}':text='%{{pts\\:hms}}':x=8:y=8:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.7,"
    f"tile={cols}x6"
)
subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", clip, "-vf", vf, "-frames:v", "1", out], check=True)
print("ok")
