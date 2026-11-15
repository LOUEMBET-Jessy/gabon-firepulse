"""Planche contact d'un clip : N images reparties sur sa duree, pour verifier le contenu sans le lire.

Usage : python film/tools/contact.py <clip.mp4> <sortie.jpg> [images]
"""

import re
import subprocess
import sys

import imageio_ffmpeg

ff = imageio_ffmpeg.get_ffmpeg_exe()
clip, out = sys.argv[1], sys.argv[2]
n = int(sys.argv[3]) if len(sys.argv) > 3 else 6
info = subprocess.run([ff, "-hide_banner", "-i", clip], capture_output=True, text=True).stderr
h, m, s = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info).groups()
dur = int(h) * 3600 + int(m) * 60 + float(s)
fps = n / dur
subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-i", clip, "-vf", f"fps={fps:.5f},scale=640:-1,tile={min(n, 3)}x{-(-n // 3)}", "-frames:v", "1", out], check=True)
print(f"{dur:.1f} s")
