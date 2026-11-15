"""Niveaux de la bande son : intensite globale et niveau efficace de quelques passages.

Usage : python film/tools/levels.py <son.wav>
"""

import re
import subprocess
import sys

import imageio_ffmpeg
import numpy as np

ff = imageio_ffmpeg.get_ffmpeg_exe()
wav = sys.argv[1]
info = subprocess.run([ff, "-hide_banner", "-i", wav, "-af", "ebur128=peak=true", "-f", "null", "-"], capture_output=True, text=True).stderr
summary = info[info.rfind("Summary:") :]
print("Intensité intégrée :", re.search(r"I:\s+(-?[\d.]+) LUFS", summary).group(1), "LUFS ; crête :", re.search(r"Peak:\s+(-?[\d.]+) dBFS", summary).group(1), "dBFS")
pcm = subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-i", wav, "-f", "s16le", "-ac", "1", "-ar", "48000", "-"], capture_output=True).stdout
a = np.frombuffer(pcm, dtype=np.int16).astype(np.float64) / 32768
print(f"durée : {len(a) / 48000:.2f} s")
for label, t0, t1 in [("voix + musique (scène 3)", 26.0, 29.0), ("musique seule (pause 42,5 s)", 42.6, 45.6), ("musique seule (fin)", 84.0, 85.6), ("réplique utilisatrice", 56.1, 58.6)]:
    seg = a[int(t0 * 48000) : int(t1 * 48000)]
    print(f"{label:<32} {20 * np.log10(np.sqrt(np.mean(seg ** 2)) + 1e-9):6.1f} dBFS")
