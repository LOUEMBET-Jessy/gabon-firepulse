"""Assemblage final : images (30 i/s) + bande son + sous-titres -> MP4 H.264 1920 x 1080.

Usage : python film/tools/encode.py <dossier images> <son.wav> <sous-titres.srt> <sortie.mp4> [--burn]
Sans --burn : sous-titres en piste activable (mov_text, francais), ajoutes par remultiplexage sans reencodage.
Avec --burn : sous-titres incrustes dans l'image (lisibles partout, par exemple sur les reseaux sociaux).

Compatibilite large : H.264 High niveau 4.1, yuv420p, AAC-LC 48 kHz, index en tete (lecture immediate).
La duree est fixee explicitement (pas de -shortest, qui peut bloquer la fin de l'ecriture avec une piste de sous-titres).
"""

import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg

ff = imageio_ffmpeg.get_ffmpeg_exe()
frames, wav, srt, out = sys.argv[1:5]
burn = "--burn" in sys.argv
count = len(list(Path(frames).glob("*.jpg")))
duration = f"{count / 30:.3f}"
# Images JPEG en plage complete -> video standard (plage limitee, BT.709) : lecture correcte dans tous les lecteurs.
TO_VIDEO = "scale=in_range=pc:out_range=tv:out_color_matrix=bt709:flags=lanczos,format=yuv420p"
video = [
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-profile:v", "high", "-level:v", "4.1", "-pix_fmt", "yuv420p", "-r", "30",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
]
audio = ["-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2"]
meta = ["-metadata", "title=Hot-Spots — Observer. Comprendre. Préserver.", "-metadata", "comment=NASA Space Apps Challenge 2026 — données NASA FIRMS"]
inputs = ["-framerate", "30", "-i", str(Path(frames) / "%05d.jpg"), "-i", wav]


def run(args):
    r = subprocess.run([ff, "-y", "-hide_banner", "-loglevel", "error", "-nostdin", *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(r.stderr[-1500:])


if burn:
    # Chemin du fichier SRT echappe pour le filtre (deux-points du lecteur Windows).
    path = Path(srt).resolve().as_posix().replace(":", "\\:")
    style = "FontName=Arial,FontSize=21,PrimaryColour=&H00FFFFFF,OutlineColour=&H66000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=160"
    run([*inputs, "-map", "0:v", "-map", "1:a", "-vf", f"subtitles='{path}':force_style='{style}',{TO_VIDEO}", *video, *audio, "-t", duration, *meta, "-movflags", "+faststart", out])
else:
    tmp = str(Path(out).with_suffix(".tmp.mp4"))
    run([*inputs, "-map", "0:v", "-map", "1:a", "-vf", TO_VIDEO, *video, *audio, "-t", duration, *meta, tmp])
    run(["-i", tmp, "-i", srt, "-map", "0:v", "-map", "0:a", "-map", "1:s", "-c:v", "copy", "-c:a", "copy", "-c:s", "mov_text", "-metadata:s:s:0", "language=fre", "-metadata:s:s:0", "title=Français", *meta, "-movflags", "+faststart", out])
    Path(tmp).unlink()
print("ok", out, duration, "s")
