"use client";

/**
 * Conversation vocale avec Hot-Spot AI : la personne parle, l'assistant repond a voix haute,
 * puis ecoute de nouveau. Chaque echange apparait aussi par ecrit dans la conversation.
 * Le micro n'est ouvert que pendant l'ecoute ; rien n'est enregistre au-dela de la question en cours.
 */

import { Microphone, Pause, Play, SpeakerSimpleSlash, Stop } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useRef, useState } from "react";

import { AssistantMark } from "@/components/brand";
import { Button, cx } from "@/components/ui";
import { chooseEngine, listen, type Listener, type VoiceEngine } from "@/lib/voice/listen";
import { canSpeak, speak, stopSpeaking } from "@/lib/voice/speak";

type Phase = "listening" | "transcribing" | "thinking" | "speaking" | "paused" | "error";

const LABEL: Record<Phase, string> = {
  listening: "Je vous écoute…",
  transcribing: "Transcription de votre question…",
  thinking: "Je consulte les données…",
  speaking: "Je vous réponds",
  paused: "Conversation en pause",
  error: "Conversation interrompue",
};

/** La conversation vocale est-elle possible dans ce navigateur, avec ce serveur ? */
export function voiceSupport(serverTranscription: boolean): VoiceEngine | null {
  if (typeof window === "undefined") return null;
  return chooseEngine(serverTranscription);
}

export function VoiceConversation({
  serverTranscription,
  ask,
  cancelAsk,
  onClose,
}: {
  serverTranscription: boolean;
  ask: (text: string) => Promise<{ text: string; error?: boolean } | null>;
  cancelAsk: () => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("listening");
  const [interim, setInterim] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const active = useRef(true);
  const paused = useRef(false);
  const listener = useRef<Listener | null>(null);
  const silences = useRef(0);
  const engine = useRef<VoiceEngine | null>(null);

  // Les rappels du micro relancent l'ecoute par cette reference, toujours a jour.
  const restart = useRef<() => void>(() => {});

  const startListening = useCallback(() => {
    if (!active.current) return;
    const chosen = engine.current ?? chooseEngine(serverTranscription);
    engine.current = chosen;
    if (!chosen) {
      setPhase("error");
      setMessage("Ce navigateur ne permet pas la conversation vocale. Utilisez Chrome ou Edge, ou écrivez votre question.");
      return;
    }
    setInterim("");
    setLevel(0);
    setPhase("listening");
    listener.current = listen(
      chosen,
      {
        onInterim: setInterim,
        onLevel: setLevel,
        onTranscribing: () => setPhase("transcribing"),
        onSilence: () => {
          listener.current = null;
          if (!active.current) return;
          silences.current += 1;
          // Deux silences de suite : la conversation se met en pause plutot que d'ecouter indefiniment.
          if (silences.current >= 2) {
            setPhase("paused");
            setMessage("Je n'ai rien entendu. Reprenez quand vous voulez.");
          } else restart.current();
        },
        onError: (error) => {
          listener.current = null;
          if (!active.current) return;
          setPhase("error");
          setMessage(error);
        },
        onFinal: async (text) => {
          listener.current = null;
          if (!active.current) return;
          silences.current = 0;
          setInterim(text);
          setPhase("thinking");
          const reply = await ask(text);
          if (!active.current || paused.current) return;
          if (!reply) return restart.current();
          setPhase("speaking");
          if (canSpeak()) await speak(reply.text).done;
          if (!active.current || paused.current) return;
          if (reply.error) {
            setPhase("paused");
            setMessage("Le service n'a pas pu répondre. Reprenez quand vous voulez.");
            return;
          }
          restart.current();
        },
      },
      { serverFallback: serverTranscription },
    );
  }, [ask, serverTranscription]);

  useEffect(() => {
    restart.current = startListening;
  }, [startListening]);

  // Demarre a l'ouverture, nettoie tout a la fermeture (micro, synthese, requete en cours).
  useEffect(() => {
    active.current = true;
    const timer = window.setTimeout(startListening, 0);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      active.current = false;
      listener.current?.abort();
      stopSpeaking();
      cancelAsk();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- demarrage unique a l'ouverture du mode vocal
  }, []);

  const resume = () => {
    paused.current = false;
    setMessage(null);
    silences.current = 0;
    startListening();
  };

  const skipSpeech = () => {
    // Couper la parole : la lecture s'arrete, l'ecoute reprend (via la fin de la lecture).
    stopSpeaking();
  };

  const ring = phase === "listening" ? 1 + level * 0.45 : 1;

  return (
    <div className="flex flex-col items-center gap-3 py-1 text-center" aria-label="Conversation vocale">
      <div className="relative flex size-[92px] items-center justify-center">
        <span
          aria-hidden
          className={cx(
            "absolute inset-0 rounded-full border-2 transition-transform duration-100",
            phase === "listening" ? "border-accent" : phase === "speaking" ? "voice-pulse border-ember" : phase === "error" ? "border-warning" : "border-line-strong",
          )}
          style={{ transform: `scale(${ring})` }}
        />
        <span aria-hidden className={cx("absolute inset-[10px] rounded-full bg-accent/10", (phase === "thinking" || phase === "transcribing") && "voice-spin border-2 border-transparent border-t-accent bg-transparent")} />
        <AssistantMark size={52} />
      </div>
      <p className="text-[14.5px] font-medium text-ink" role="status" aria-live="polite">
        {LABEL[phase]}
      </p>
      <p className="min-h-[40px] max-w-[34ch] text-[13px] leading-snug text-ink-2">
        {message ?? (interim ? `« ${interim} »` : phase === "listening" ? "Parlez naturellement, par exemple : « Montre la Nyanga en 2024 »." : "")}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {phase === "listening" ? (
          <Button size="sm" onClick={() => listener.current?.stop()}>
            <Microphone size={15} />
            J'ai fini
          </Button>
        ) : null}
        {phase === "speaking" ? (
          <Button size="sm" onClick={skipSpeech}>
            <SpeakerSimpleSlash size={15} />
            Couper la parole
          </Button>
        ) : null}
        {phase === "paused" || phase === "error" ? (
          <Button size="sm" variant="primary" onClick={resume}>
            <Play size={15} />
            Reprendre
          </Button>
        ) : null}
        {phase === "listening" || phase === "speaking" ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              paused.current = true;
              listener.current?.abort();
              listener.current = null;
              stopSpeaking();
              setPhase("paused");
              setMessage(null);
            }}
          >
            <Pause size={15} />
            Pause
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onClose}>
          <Stop size={15} />
          Terminer
        </Button>
      </div>
    </div>
  );
}
