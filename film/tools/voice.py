"""Voix off du film : une piste par ligne (voix neuronales fr-FR), durees et minutage des mots.

Usage : python film/tools/voice.py film/voix-off.json <dossier de sortie>
Une ligne est un texte (voix du narrateur) ou un objet {text, voice, rate, pitch, speaker, gap} pour les
repliques de la demonstration vocale. Ecrit <scene>-<n>.mp3 et timing.json (texte, voix, mots et instants).
Seul le texte de la voix off (public) est envoye au service de synthese ; aucune donnee personnelle.
"""

import asyncio
import json
import sys
from pathlib import Path

import edge_tts


async def synth(text: str, voice: str, rate: str, pitch: str, out: Path) -> list:
    words = []
    audio = bytearray()
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary="WordBoundary")
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            # Instants en unites de 100 ns.
            words.append({"text": chunk["text"], "start": chunk["offset"] / 1e7, "end": (chunk["offset"] + chunk["duration"]) / 1e7})
    out.write_bytes(bytes(audio))
    return words


async def main():
    spec = json.loads(Path(sys.argv[1]).read_text("utf-8"))
    out = Path(sys.argv[2])
    out.mkdir(parents=True, exist_ok=True)
    result = []
    for scene in spec["scenes"]:
        lines = []
        for i, raw in enumerate(scene["lines"]):
            item = raw if isinstance(raw, dict) else {"text": raw}
            voice = item.get("voice", spec["voice"])
            name = f"{scene['id']}-{i}.mp3"
            words = await synth(item["text"], voice, item.get("rate", spec["rate"]), item.get("pitch", spec["pitch"]), out / name)
            lines.append({"file": name, "text": item["text"], "voice": voice, "speaker": item.get("speaker"), "gap": item.get("gap"), "words": words})
        result.append({"id": scene["id"], "start": scene["start"], "lines": lines})
    (out / "timing.json").write_text(json.dumps(result, ensure_ascii=False, indent=1), "utf-8")
    print("ok")


asyncio.run(main())
