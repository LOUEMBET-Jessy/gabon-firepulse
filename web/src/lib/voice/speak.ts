"use client";

/**
 * Lecture a voix haute des reponses, avec la synthese vocale du navigateur (aucun service externe, aucun cout).
 * Le texte est decoupe en phrases : certains navigateurs coupent les enonces trop longs.
 */

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;
let generation = 0;

export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";
}

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (!canSpeak()) return Promise.resolve([]);
  voicesReady ??= new Promise((resolve) => {
    const now = window.speechSynthesis.getVoices();
    if (now.length) return resolve(now);
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, 1500);
  });
  return voicesReady;
}

/** Voix francaise, de preference une voix « naturelle » ou en ligne, plus agreable. */
export async function frenchVoice(): Promise<SpeechSynthesisVoice | null> {
  const voices = (await loadVoices()).filter((v) => v.lang?.toLowerCase().startsWith("fr"));
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase() === "fr-fr" ? 4 : 0) + (/natural|neural|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  return voices.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/** Texte prononcable : sans mise en forme ni symboles qui se lisent mal. */
export function toSpeech(text: string): string {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^\s*[-•*]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/km²/g, " kilomètres carrés")
    .replace(/(\d)\s?%/g, "$1 pour cent")
    .replace(/[*_#>]/g, "")
    .replace(/\s*\n+\s*/g, ". ")
    .replace(/\.{2,}/g, ".")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sentences(text: string): string[] {
  const out: string[] = [];
  for (const piece of text.split(/(?<=[.!?…])\s+/)) {
    if (!piece.trim()) continue;
    // Une phrase tres longue est encore coupee aux virgules.
    if (piece.length <= 220) out.push(piece);
    else out.push(...piece.split(/(?<=[,;:])\s+/));
  }
  return out;
}

export interface SpeechHandle {
  /** Resolue quand la lecture est terminee ou interrompue. */
  done: Promise<void>;
  stop: () => void;
}

export function stopSpeaking() {
  generation++;
  if (canSpeak()) window.speechSynthesis.cancel();
}

/**
 * Lit le texte. Resout toujours : si la synthese ne demarre pas (navigateur sans voix, page masquee),
 * un delai de securite base sur la longueur du texte termine la lecture.
 */
export function speak(text: string, options: { rate?: number } = {}): SpeechHandle {
  stopSpeaking();
  const id = generation;
  const spoken = toSpeech(text);
  if (!canSpeak() || !spoken) return { done: Promise.resolve(), stop: () => {} };

  const done = (async () => {
    const voice = await frenchVoice();
    for (const part of sentences(spoken)) {
      if (id !== generation) return;
      await new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(part);
        utterance.lang = voice?.lang ?? "fr-FR";
        if (voice) utterance.voice = voice;
        utterance.rate = options.rate ?? 1.05;
        const safety = window.setTimeout(resolve, 2500 + part.length * 90);
        const finish = () => {
          window.clearTimeout(safety);
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        window.speechSynthesis.speak(utterance);
      });
    }
  })();
  return { done, stop: stopSpeaking };
}
