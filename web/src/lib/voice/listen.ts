"use client";

/**
 * Ecoute de la parole, avec deux moteurs :
 * - « browser » : la dictee integree au navigateur (Chrome, Edge), transcription en direct ;
 * - « server » : enregistrement local avec detection de fin de parole, puis transcription par le serveur
 *   (Gemini). Sert de repli quand la dictee integree manque ou echoue.
 */

export type VoiceEngine = "browser" | "server";

export interface ListenEvents {
  /** Texte provisoire pendant que la personne parle (moteur « browser » seulement). */
  onInterim?: (text: string) => void;
  /** Texte final reconnu. */
  onFinal: (text: string) => void;
  /** Rien d'intelligible n'a ete entendu. */
  onSilence: () => void;
  onError: (message: string) => void;
  /** Le moteur « server » a fini d'enregistrer et attend la transcription. */
  onTranscribing?: () => void;
  /** Niveau sonore entre 0 et 1, pour l'animation. */
  onLevel?: (level: number) => void;
}

export interface Listener {
  engine: VoiceEngine;
  /** Arrete l'ecoute et traite ce qui a deja ete dit. */
  stop: () => void;
  /** Abandonne l'ecoute sans rien transmettre. */
  abort: () => void;
}

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function recognitionClass(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function canRecord(): boolean {
  return typeof window !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia) && typeof MediaRecorder !== "undefined";
}

/** Moteur a utiliser. Une preference stockee (« hotspot.voice.engine ») permet de forcer le repli serveur. */
export function chooseEngine(serverTranscription: boolean): VoiceEngine | null {
  let forced: string | null = null;
  try {
    forced = window.localStorage.getItem("hotspot.voice.engine");
  } catch {
    /* stockage indisponible */
  }
  if (forced === "server" && serverTranscription && canRecord()) return "server";
  if (recognitionClass()) return "browser";
  if (serverTranscription && canRecord()) return "server";
  return null;
}

export function listen(engine: VoiceEngine, events: ListenEvents, options: { serverFallback: boolean }): Listener {
  if (engine === "browser") return listenBrowser(events, options);
  return listenServer(events);
}

/* ------------------------------------------------------------------ Dictee du navigateur */

function listenBrowser(events: ListenEvents, options: { serverFallback: boolean }): Listener {
  const Ctor = recognitionClass()!;
  const recognition = new Ctor();
  recognition.lang = "fr-FR";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.maxAlternatives = 1;
  let finalText = "";
  let aborted = false;
  let switched: Listener | null = null;
  let handled = false;

  recognition.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) finalText += result[0].transcript;
      else interim += result[0].transcript;
    }
    events.onInterim?.((finalText + interim).trim());
  };
  recognition.onerror = (e) => {
    if (aborted || handled) return;
    if (e.error === "no-speech" || e.error === "aborted") return;
    handled = true;
    if (e.error === "not-allowed") return events.onError("L'accès au micro a été refusé. Autorisez-le dans les réglages du navigateur pour parler à l'assistant.");
    // Service de dictee indisponible (reseau, navigateur sans service) : repli sur la transcription serveur.
    if ((e.error === "network" || e.error === "service-not-allowed" || e.error === "language-not-supported") && options.serverFallback && canRecord()) {
      switched = listenServer(events);
      return;
    }
    events.onError("La dictée du navigateur ne fonctionne pas ici. Essayez avec Chrome ou Edge, ou écrivez votre question.");
  };
  recognition.onend = () => {
    if (aborted || handled) return;
    handled = true;
    const text = finalText.trim();
    if (text) events.onFinal(text);
    else events.onSilence();
  };
  try {
    recognition.start();
  } catch {
    window.setTimeout(() => events.onError("Le micro n'a pas pu démarrer."), 0);
  }
  return {
    engine: "browser",
    stop: () => (switched ? (switched as Listener).stop() : recognition.stop()),
    abort: () => {
      aborted = true;
      if (switched) (switched as Listener).abort();
      try {
        recognition.abort();
      } catch {
        /* deja arrete */
      }
    },
  };
}

/* ------------------------------------------------------------------ Enregistrement et transcription serveur */

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function listenServer(events: ListenEvents): Listener {
  let aborted = false;
  let stopRequested = false;
  let cleanup = () => {};
  let finish: (() => void) | null = null;

  (async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (error) {
      const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
      events.onError(denied ? "L'accès au micro a été refusé. Autorisez-le dans les réglages du navigateur pour parler à l'assistant." : "Aucun micro n'est disponible.");
      return;
    }
    if (aborted) return stream.getTracks().forEach((t) => t.stop());

    const mimeType = PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

    // Detection de la parole et du silence sur le niveau sonore.
    const audio = new AudioContext();
    const source = audio.createMediaStreamSource(stream);
    const analyser = audio.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const started = performance.now();
    let floor = 0.01;
    let spoke = false;
    let lastVoice = 0;

    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const rms = Math.sqrt(sum / samples.length);
      const elapsed = performance.now() - started;
      if (elapsed < 400) floor = Math.max(floor, rms);
      const threshold = Math.max(0.015, floor * 2.5);
      events.onLevel?.(Math.min(1, rms / (threshold * 4)));
      if (rms > threshold) {
        spoke = true;
        lastVoice = elapsed;
      }
      const silentFor = elapsed - lastVoice;
      if ((spoke && silentFor > 1300) || (!spoke && elapsed > 8000) || elapsed > 30000) finish?.();
    }, 100);

    cleanup = () => {
      window.clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      void audio.close().catch(() => {});
    };

    finish = () => {
      finish = null;
      window.clearInterval(timer);
      recorder.onstop = async () => {
        cleanup();
        if (aborted) return;
        if (!spoke || chunks.length === 0) return events.onSilence();
        events.onTranscribing?.();
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        try {
          const response = await fetch("/api/assistant/transcribe", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
          const body = (await response.json().catch(() => ({}))) as { text?: string; error?: string };
          if (aborted) return;
          if (!response.ok) return events.onError(body.error ?? "La transcription a échoué.");
          if (body.text) events.onFinal(body.text);
          else events.onSilence();
        } catch {
          if (!aborted) events.onError("Le serveur Hot-Spot ne répond pas.");
        }
      };
      recorder.stop();
    };
    recorder.start(250);
    if (stopRequested) finish();
  })();

  return {
    engine: "server",
    stop: () => {
      stopRequested = true;
      finish?.();
    },
    abort: () => {
      aborted = true;
      finish?.();
      cleanup();
    },
  };
}
