"""Bande son du film : musique originale synthetisee (aucun morceau tiers), voix off et repliques, mixage.

Usage : python film/tools/audio.py <dossier voix> <sortie.wav>
- Musique : nappes additives (re mineur -> fa majeur), arpeges pinces et pulsation douce pendant les
  demonstrations, souffles et impacts aux transitions, reverberation par convolution.
- Voix : chaque ligne placee a son instant (timing.json), coupee apres son dernier mot.
- Mixage : la musique s'efface sous la voix (environ -10 dB), jamais l'inverse.
"""

import json
import subprocess
import sys
from pathlib import Path

import imageio_ffmpeg
import numpy as np

SR = 48000
DUR = 86.5
N = int(SR * DUR)
FF = imageio_ffmpeg.get_ffmpeg_exe()
rng = np.random.default_rng(2026)

NOTE = {"C": 0, "C#": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}


def hz(name: str) -> float:
    pitch, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[pitch] + 12 * (octave + 1) - 69) / 12)


def env(n: int, attack: float, release: float) -> np.ndarray:
    a = min(n, int(attack * SR))
    r = min(n - a, int(release * SR))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 2
    if r > 0:
        e[n - r :] *= np.linspace(1, 0, r) ** 1.5
    return e


def pad_note(f: float, dur: float, amp: float, bright: int = 5) -> np.ndarray:
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for detune in (-0.0025, 0.0025):
        for k in range(1, bright + 1):
            out += np.sin(2 * np.pi * f * k * (1 + detune) * t + rng.uniform(0, 6.28)) / k**1.7
    # Respiration lente de la nappe.
    out *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.18 * t + rng.uniform(0, 6.28))
    return out * env(n, 1.6, 1.8) * amp


def pluck(f: float, amp: float) -> np.ndarray:
    n = int(1.6 * SR)
    t = np.arange(n) / SR
    out = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (4.5 + 2.5 * k)) / k for k in range(1, 5))
    return out * amp * env(n, 0.004, 0.3)


def kick(amp: float) -> np.ndarray:
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 46 + 50 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9) * amp


def boom(amp: float) -> np.ndarray:
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    f = 34 + 70 * np.exp(-t * 5)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.6) * amp


def whoosh(dur: float, amp: float, rising: bool = True) -> np.ndarray:
    n = int(dur * SR)
    noise = rng.standard_normal(n)
    # Filtre passe-bas a coefficient variable : le souffle s'ouvre puis se referme.
    k = np.linspace(0.02, 0.35, n) if rising else np.linspace(0.35, 0.02, n)
    out = np.empty(n)
    y = 0.0
    for i in range(n):
        y += k[i] * (noise[i] - y)
        out[i] = y
    shape = np.sin(np.linspace(0, np.pi, n)) ** (1.5 if rising else 3)
    if rising:
        shape *= np.linspace(0.2, 1, n)
    return out * shape * amp


def place(track: np.ndarray, sig: np.ndarray, at: float):
    i = int(at * SR)
    if i >= len(track):
        return
    j = min(len(track), i + len(sig))
    track[i:j] += sig[: j - i]


music = np.zeros(N)

# Nappes : (debut, duree, accord)
CHORDS = [
    (0.0, 6.5, ["D2", "A2", "D3", "F3", "A3", "E4"], 0.05, 3),
    (6.0, 6.8, ["Bb1", "F2", "D3", "F3", "A3", "D4"], 0.055, 3),
    (12.2, 6.8, ["F2", "C3", "F3", "A3", "C4", "G4"], 0.06, 5),
    (18.6, 6.6, ["C2", "G2", "E3", "G3", "C4", "D4"], 0.06, 5),
    (24.8, 5.4, ["Bb1", "F2", "D3", "F3", "Bb3"], 0.045, 4),
    (30.1, 5.4, ["F2", "C3", "F3", "A3", "C4"], 0.045, 4),
    (35.4, 5.4, ["C2", "G2", "E3", "G3", "C4"], 0.045, 4),
    (40.7, 5.6, ["D2", "A2", "D3", "F3", "A3"], 0.045, 4),
    (46.0, 5.6, ["F2", "C3", "F3", "A3", "C4"], 0.04, 4),
    (51.5, 5.6, ["A1", "E2", "C3", "E3", "A3"], 0.04, 4),
    (57.0, 5.6, ["Bb1", "F2", "D3", "F3", "Bb3"], 0.04, 4),
    (62.5, 6.0, ["C2", "G2", "E3", "G3", "C4"], 0.045, 4),
    (68.2, 4.8, ["Bb1", "F2", "D3", "F3", "Bb3", "F4"], 0.055, 5),
    (72.8, 4.9, ["C2", "G2", "E3", "G3", "C4", "G4"], 0.06, 5),
    (77.4, 9.1, ["F1", "F2", "C3", "F3", "A3", "C4", "E4", "A4"], 0.07, 6),
]
for start, dur, notes, amp, bright in CHORDS:
    for nm in notes:
        place(music, pad_note(hz(nm), dur + 1.4, amp, bright), start)

# Arpeges pinces (92 battements/min, croches) pendant les demonstrations.
BEAT = 60 / 92
ARP = {
    24.8: ["Bb3", "D4", "F4", "Bb4"], 30.1: ["A3", "C4", "F4", "A4"], 35.4: ["G3", "C4", "E4", "G4"], 40.7: ["A3", "D4", "F4", "A4"],
    49.7: ["A3", "C4", "F4", "C5"], 51.5: ["A3", "C4", "E4", "A4"], 57.0: ["Bb3", "D4", "F4", "D5"], 62.5: ["G3", "C4", "E4", "G4"],
    68.2: ["Bb3", "D4", "F4", "Bb4"], 72.8: ["G3", "C4", "E4", "G4"],
}
starts = sorted(ARP)
for idx, s0 in enumerate(starts):
    s1 = starts[idx + 1] if idx + 1 < len(starts) else 77.2
    notes = ARP[s0]
    t = s0
    k = 0
    while t < s1 - 0.05:
        # Pas d'arpege pendant l'affirmation (46 - 49,7 s) : la phrase respire seule.
        if not (46.0 <= t < 49.7):
            place(music, pluck(hz(notes[k % 4]), 0.05 + 0.02 * (k % 4 == 0)), t)
        t += BEAT / 2
        k += 1

# Pulsation tres douce (noires) pendant les demonstrations.
t = 25.0
while t < 77.2:
    if not (46.0 <= t < 49.7):
        place(music, kick(0.16), t)
    t += BEAT

# Scintillement de donnees (scene 1) : petits signaux aigus, comme des lignes qui arrivent.
for i in range(46):
    at = 0.4 + i * 0.105 + rng.uniform(0, 0.05)
    f = rng.choice([1568, 1760, 2093, 2349, 2637])
    n = int(0.09 * SR)
    tt = np.arange(n) / SR
    place(music, np.sin(2 * np.pi * f * tt) * np.exp(-tt * 45) * 0.025, at)

# Transitions : souffles et impacts.
for at, dur, amp in [(10.9, 1.6, 0.18), (23.6, 1.4, 0.16), (44.9, 1.2, 0.13), (66.9, 1.4, 0.15), (72.0, 1.4, 0.15), (76.0, 1.5, 0.17)]:
    place(music, whoosh(dur, amp), at)
for at, amp in [(12.4, 0.55), (77.4, 0.6)]:
    place(music, boom(amp), at)

# Reverberation : convolution par une reponse impulsionnelle stereo decroissante (2,8 s).
ir_n = int(2.8 * SR)
decay = np.exp(-np.arange(ir_n) / SR * 2.4)


def convolve(x: np.ndarray, ir: np.ndarray) -> np.ndarray:
    size = 1 << int(np.ceil(np.log2(len(x) + len(ir))))
    return np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x)]


left = music + 0.35 * convolve(music, rng.standard_normal(ir_n) * decay * 0.02)
right = music + 0.35 * convolve(music, rng.standard_normal(ir_n) * decay * 0.02)
music_st = np.stack([left, right], axis=1)

# Voix.
folder = Path(sys.argv[1])
timing = json.loads((folder / "timing.json").read_text("utf-8"))
voice = np.zeros(N)
active = np.zeros(N)
for scene in timing:
    for ln in scene["lines"]:
        pcm = subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-i", str(folder / ln["file"]), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"], capture_output=True, check=True).stdout
        a = np.frombuffer(pcm, dtype=np.int16).astype(np.float64) / 32768
        a = a[: int(ln["duration"] * SR)]
        fade = min(len(a), int(0.06 * SR))
        a[-fade:] *= np.linspace(1, 0, fade)
        gain = 1.0 if not ln.get("speaker") else 0.92
        place(voice, a * gain, ln["at"])
        i, j = int(ln["at"] * SR), int((ln["at"] + ln["duration"]) * SR)
        active[i : min(N, j)] = 1

# Effacement de la musique sous la voix : gain lisse (attaque 0,15 s, relachement 0,6 s).
target = 1 - 0.68 * active
duck = np.empty(N)
g = 1.0
up, down = 1 / (0.6 * SR), 1 / (0.15 * SR)
for i in range(0, N, 64):
    tg = target[i]
    g += (tg - g) * (down if tg < g else up) * 64
    duck[i : i + 64] = g

peak_v = np.max(np.abs(voice)) or 1
voice = voice / peak_v * 0.82
mus = music_st * duck[:, None]
mus = mus / (np.max(np.abs(mus)) or 1) * 0.42
mix = mus + voice[:, None]
# Fondus d'ouverture et de fin.
mix[: int(0.6 * SR)] *= np.linspace(0, 1, int(0.6 * SR))[:, None]
tail = int(0.9 * SR)
mix[-tail:] *= np.linspace(1, 0, tail)[:, None]
mix /= max(1.0, np.max(np.abs(mix)) / 0.97)
pcm = (mix * 32767).astype(np.int16).tobytes()
raw = Path(sys.argv[2]).with_suffix(".raw")
raw.write_bytes(pcm)
subprocess.run([FF, "-y", "-hide_banner", "-loglevel", "error", "-f", "s16le", "-ar", str(SR), "-ac", "2", "-i", str(raw), "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", str(SR), sys.argv[2]], check=True)
raw.unlink()
print("ok", sys.argv[2])
