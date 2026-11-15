"use client";

/**
 * Panneau de Hot-Spot AI : conversation, actions appliquees, confirmations, aide hors ligne.
 * Non modal sur ordinateur (la page reste visible et utilisable pendant l'echange), plein ecran sur telephone.
 */

import { ArrowCounterClockwise, ArrowUp, CaretDown, ChartLineUp, Check, CompassTool, DownloadSimple, Info, MapTrifold, Microphone, SpeakerHigh, SpeakerSimpleSlash, Stop, Trash, WarningCircle, X } from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

import { AssistantMark, BRAND } from "@/components/brand";
import { Button, cx } from "@/components/ui";
import { FAQ, SUGGESTIONS, TOUR } from "@/lib/assistant/content";
import { LIMITS, needsConfirmation, pageFromPath, type AssistantReply, type AssistantStatus } from "@/lib/assistant/protocol";
import {
  WELCOME_KEY,
  getAssistant,
  hydrateAssistant,
  pushMessage,
  savedTourStep,
  setAssistant,
  uid,
  updateReceipt,
  useAssistant,
  type ActionReceipt,
  type UiMessage,
} from "@/state/assistant";

import { canSpeak, speak, stopSpeaking } from "@/lib/voice/speak";

import { describeAction, useActionRunner, useAssistantContext } from "./runtime";
import { VoiceConversation, voiceSupport } from "./voice";

/* ------------------------------------------------------------------ Rendu du texte */

/** Mise en forme minimale et sure : paragraphes, listes « - » ou « * », gras **...**. Aucun HTML injecte. */
function RichText({ text }: { text: string }) {
  const inline = (line: string, key: number) =>
    line
      .replace(/`([^`]+)`/g, "$1")
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${key}-${i}`} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <Fragment key={`${key}-${i}`}>{part}</Fragment>
      ),
    );
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, b) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•*]\s+/.test(l))) {
          return (
            <ul key={b} className="flex flex-col gap-1.5">
              {lines.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-[9px] size-1 shrink-0 rounded-full bg-accent" />
                  <span>{inline(l.replace(/^\s*[-•*]\s+/, ""), i)}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={b}>
            {lines.map((l, i) => (
              <Fragment key={i}>
                {i ? <br /> : null}
                {inline(l, i)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Accuses d'action */

function Receipts({ message, onConfirm }: { message: UiMessage; onConfirm: (receipt: ActionReceipt) => void }) {
  if (!message.receipts?.length) return null;
  return (
    <ul className="mt-3 flex flex-col gap-1.5" aria-label="Actions de l'assistant">
      {message.receipts.map((r) =>
        r.action.type === "export" ? (
          <li key={r.id} className="rounded-control border border-line-strong bg-bg/40 p-3">
            <p className="flex items-center gap-2 text-[12.5px] font-medium text-ink">
              <DownloadSimple size={15} className="text-accent" />
              Export préparé
            </p>
            <p className="mt-1 text-[12.5px] text-ink-2">{r.action.label}</p>
            {r.state === "pending" ? (
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" variant="primary" onClick={() => onConfirm(r)}>
                  {r.action.kind === "report_pdf" ? "Ouvrir et imprimer" : "Télécharger"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updateReceipt(message.id, r.id, "cancelled")}>
                  Annuler
                </Button>
              </div>
            ) : (
              <p className={cx("mt-2 text-[12px]", r.state === "confirmed" ? "text-good" : "text-ink-3")}>
                {r.state === "confirmed" ? (r.action.kind === "report_pdf" ? "Rapport ouvert : la fenêtre d'impression va s'afficher." : "Téléchargement lancé.") : r.state === "failed" ? "Échec du téléchargement." : "Export annulé."}
              </p>
            )}
          </li>
        ) : (
          <li key={r.id} className="flex items-start gap-2 text-[12.5px] text-ink-2">
            {r.state === "failed" ? <WarningCircle size={15} className="mt-px shrink-0 text-warning" /> : <Check size={15} weight="bold" className="mt-px shrink-0 text-good" />}
            <span>{r.state === "failed" ? `Non appliqué : ${describeAction(r.action)}` : describeAction(r.action)}</span>
          </li>
        ),
      )}
    </ul>
  );
}

/* ------------------------------------------------------------------ Aide hors ligne */

function OfflineHelp({ status, onAction }: { status: AssistantStatus | null; onAction: (actions: ActionReceipt["action"][]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-control border border-warning/30 bg-warning/[0.06] p-3.5 text-[13px] leading-relaxed text-ink-2">
        <p className="flex items-center gap-2 font-medium text-ink">
          <Info size={16} weight="fill" className="text-warning" />
          Assistant IA indisponible
        </p>
        <p className="mt-1">{status?.reason ?? "Vérification du service en cours."} Les réponses ci-dessous sont une aide rédigée à l'avance ; la visite guidée et les raccourcis fonctionnent normalement.</p>
      </div>
      <div>
        <p className="mb-2 text-[12px] font-medium text-ink-3">Questions fréquentes</p>
        <ul className="flex flex-col gap-1.5">
          {FAQ.map((entry, i) => (
            <li key={entry.question} className="rounded-control bg-surface-2">
              <button
                type="button"
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-[13px] font-medium text-ink"
              >
                {entry.question}
                <CaretDown size={13} weight="bold" className={cx("shrink-0 text-ink-3 transition-transform", open === i && "rotate-180")} />
              </button>
              {open === i ? (
                <div className="px-3 pb-3 text-[13px] leading-relaxed text-ink-2">
                  <p>{entry.answer}</p>
                  {entry.action ? (
                    <Button size="sm" className="mt-2.5" onClick={() => onAction(entry.action!.actions)}>
                      {entry.action.label}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Panneau */

export function AssistantPanel() {
  const open = useAssistant((s) => s.open);
  const messages = useAssistant((s) => s.messages);
  const busy = useAssistant((s) => s.busy);
  const status = useAssistant((s) => s.status);
  const draftFromApp = useAssistant((s) => s.draft);
  const pathname = usePathname();
  const page = pageFromPath(pathname);
  const getContext = useAssistantContext();
  const run = useActionRunner();
  const [draft, setDraft] = useState("");
  const [welcome, setWelcome] = useState(false);
  const [resumeStep, setResumeStep] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [voiceMode, setVoiceMode] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [voiceEngine, setVoiceEngine] = useState<ReturnType<typeof voiceSupport>>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const available = status?.available === true;

  // Conversation de l'onglet, etat du service, premiere visite.
  useEffect(() => {
    hydrateAssistant();
    fetch("/api/assistant/status")
      .then((r) => r.json() as Promise<AssistantStatus>)
      .then((s) => setAssistant({ status: s }))
      .catch(() => setAssistant({ status: { available: false, reason: "Le serveur Hot-Spot ne répond pas.", model: null } }));
    try {
      // Question venue de la page d'accueil (?ask=...) : pre-remplie, l'utilisateur l'envoie lui-meme.
      const ask = new URLSearchParams(window.location.search).get("ask");
      if (ask) {
        window.localStorage.setItem(WELCOME_KEY, "1");
        setAssistant({ open: true, draft: ask.slice(0, LIMITS.userMessageChars) });
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      const saved = savedTourStep();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du stockage du navigateur apres le montage
      if (saved !== null && saved > 0 && saved < TOUR.length) setResumeStep(saved);
      if (!window.localStorage.getItem(WELCOME_KEY)) {
        setWelcome(true);
        setAssistant({ open: true });
      }
    } catch {
      /* stockage indisponible : pas d'accueil automatique */
    }
  }, []);

  // Suggestion choisie ailleurs dans l'application : pre-remplit la saisie.
  useEffect(() => {
    if (!draftFromApp) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- transfert ponctuel d'un brouillon venu d'un autre composant
    setDraft(draftFromApp);
    setAssistant({ draft: "" });
    window.setTimeout(() => input.current?.focus(), 50);
  }, [draftFromApp]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [messages.length, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAssistant({ open: false });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dismissWelcome = () => {
    setWelcome(false);
    try {
      window.localStorage.setItem(WELCOME_KEY, "1");
    } catch {
      /* stockage indisponible */
    }
  };

  const applyLocal = (actions: ActionReceipt["action"][]) => {
    actions.forEach((a) => run(a));
    if (actions.some((a) => a.type === "start_tour")) setAssistant({ open: false });
  };

  /** Envoie une question ; renvoie la reponse (ou l'erreur) pour la conversation vocale. */
  const send = async (text: string, voice = false): Promise<{ text: string; error?: boolean } | null> => {
    const question = text.trim().slice(0, LIMITS.userMessageChars);
    if (!question || getAssistant().busy) return null;
    if (welcome) dismissWelcome();
    setDraft("");
    pushMessage({ id: uid("u"), role: "user", text: question });
    setAssistant({ busy: true });
    const controller = new AbortController();
    abort.current = controller;
    const history = getAssistant()
      .messages.filter((m) => !m.error)
      .map((m) => ({ role: m.role, text: m.text }));
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: getContext(), mode: voice ? "voice" : "text" }),
        signal: controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as Partial<AssistantReply> & { error?: string; unavailable?: boolean };
      if (!response.ok || typeof body.text !== "string") {
        if (body.unavailable) setAssistant({ status: { available: false, reason: body.error ?? null, model: null } });
        const message = body.error ?? `Le service a répondu par une erreur (${response.status}).`;
        pushMessage({ id: uid("e"), role: "assistant", text: message, error: true });
        return { text: message, error: true };
      }
      const id = uid("a");
      const receipts: ActionReceipt[] = (body.actions ?? []).map((action) => {
        if (needsConfirmation(action)) return { id: uid("r"), action, state: "pending" };
        let ok = false;
        try {
          ok = run(action);
        } catch {
          ok = false;
        }
        return { id: uid("r"), action, state: ok ? "applied" : "failed" };
      });
      pushMessage({ id, role: "assistant", text: body.text, receipts, sources: body.sources ?? [], fallbackModel: body.fallback ? body.model : undefined });
      if (receipts.some((r) => r.action.type === "start_tour")) setAssistant({ open: false });
      return { text: body.text };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === "AbortError";
      const message = aborted ? "Demande interrompue." : "Le serveur Hot-Spot ne répond pas. Vérifiez votre connexion.";
      pushMessage({ id: uid("e"), role: "assistant", text: message, error: true });
      return { text: message, error: true };
    } finally {
      abort.current = null;
      setAssistant({ busy: false });
    }
  };

  const confirmExport = (message: UiMessage, receipt: ActionReceipt) => {
    const ok = run(receipt.action);
    updateReceipt(message.id, receipt.id, ok ? "confirmed" : "failed");
  };

  // Moteur vocal disponible : depend du navigateur et de la transcription serveur (mesure apres le montage).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- capacites du navigateur, connues seulement cote client
    setVoiceEngine(voiceSupport(status?.transcription === true));
  }, [status]);

  // Panneau ferme : on arrete toute lecture a voix haute.
  useEffect(() => {
    if (!open) {
      stopSpeaking();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- arret de la conversation vocale a la fermeture du panneau
      setVoiceMode(false);
      setReading(null);
    }
  }, [open]);

  const readAloud = async (m: UiMessage) => {
    if (reading === m.id) {
      stopSpeaking();
      setReading(null);
      return;
    }
    setReading(m.id);
    await speak(m.text).done;
    setReading((current) => (current === m.id ? null : current));
  };

  if (!open) return null;

  return (
    <>
      <button type="button" aria-label="Fermer l'assistant" onClick={() => setAssistant({ open: false })} className="fixed inset-0 z-30 bg-bg-deep/70 md:hidden" />
      <aside
        role="complementary"
        aria-label={BRAND.assistant}
        className="fixed inset-x-0 bottom-0 top-[8dvh] z-40 flex animate-fade-up flex-col overflow-hidden rounded-t-[22px] border border-line-strong bg-surface shadow-[0_-12px_48px_-12px_rgb(0_0_0/0.7)] md:inset-x-auto md:bottom-4 md:right-4 md:top-4 md:w-[420px] md:rounded-[22px] md:shadow-[0_24px_64px_-16px_rgb(0_0_0/0.75)]"
      >
        {/* En-tete */}
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-bg/25 px-4 py-3">
          <AssistantMark size={34} />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{BRAND.assistant}</p>
            <p className="mt-1 flex w-fit items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink-2">
              <span aria-hidden className={cx("size-1.5 rounded-full", status === null ? "bg-ink-3" : available ? "bg-good" : "bg-warning")} />
              {status === null ? "Vérification du service" : available ? "Prêt à vous aider" : "Aide hors ligne"}
            </p>
          </div>
          <button
            type="button"
            title="Visite guidée"
            aria-label="Lancer la visite guidée"
            onClick={() => applyLocal([{ type: "start_tour" }])}
            className="rounded-control p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <CompassTool size={18} />
          </button>
          {messages.length ? (
            <button type="button" title="Effacer la conversation" aria-label="Effacer la conversation" onClick={() => setAssistant({ messages: [] })} className="rounded-control p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
              <Trash size={18} />
            </button>
          ) : null}
          <button type="button" aria-label="Fermer l'assistant" onClick={() => setAssistant({ open: false })} className="rounded-control p-2 text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink">
            <X size={18} />
          </button>
        </header>

        {/* Conversation */}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto bg-[linear-gradient(180deg,rgba(8,18,38,0.24),transparent_40%)] px-4 py-4" aria-live="polite" aria-relevant="additions text">
          {welcome ? (
            <section className="mb-4 overflow-hidden rounded-panel border border-accent/20 bg-[radial-gradient(ellipse_at_top_right,rgba(18,191,210,0.12),transparent_55%),linear-gradient(150deg,#163152,#10213a)] p-4">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-strong">
                <AssistantMark size={22} />
                Copilote de données
              </div>
              <h2 className="mt-3 text-[18px] font-semibold leading-snug tracking-[-0.02em] text-ink">Bonjour, que souhaitez-vous explorer ?</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                Je suis {BRAND.assistant}, votre guide pour comprendre les détections satellitaires du Gabon. Je peux expliquer les graphiques, ajuster la carte et la période, ou préparer un export.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-control border border-line-strong/70 bg-bg/25 px-2.5 py-2">
                  <MapTrifold size={16} className="text-accent" />
                  <p className="mt-1.5 text-[11.5px] font-medium text-ink">Explorer</p>
                  <p className="text-[10.5px] leading-snug text-ink-3">carte & zone</p>
                </div>
                <div className="rounded-control border border-line-strong/70 bg-bg/25 px-2.5 py-2">
                  <ChartLineUp size={16} className="text-accent" />
                  <p className="mt-1.5 text-[11.5px] font-medium text-ink">Comprendre</p>
                  <p className="text-[10.5px] leading-snug text-ink-3">chiffres & méthode</p>
                </div>
                <div className="rounded-control border border-line-strong/70 bg-bg/25 px-2.5 py-2">
                  <DownloadSimple size={16} className="text-accent" />
                  <p className="mt-1.5 text-[11.5px] font-medium text-ink">Préparer</p>
                  <p className="text-[10.5px] leading-snug text-ink-3">vos exports</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-3">Archives historiques jusqu’au 31 décembre 2025 · pas d’alerte en temps réel.</p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    dismissWelcome();
                    applyLocal([{ type: "start_tour" }]);
                  }}
                >
                  <CompassTool size={14} />
                  Voir la visite guidée
                </Button>
                <Button size="sm" variant="ghost" onClick={() => {
                  dismissWelcome();
                  if (available) input.current?.focus();
                }}>
                  Poser une question
                </Button>
              </div>
            </section>
          ) : null}

          {resumeStep !== null && !welcome ? (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-control bg-surface-2 px-3 py-2.5 text-[13px] text-ink-2">
              <span>Visite guidée interrompue à l'étape {resumeStep + 1}.</span>
              <Button
                size="sm"
                onClick={() => {
                  setAssistant({ tourStep: resumeStep, open: false });
                  setResumeStep(null);
                }}
              >
                <ArrowCounterClockwise size={14} />
                Reprendre
              </Button>
            </div>
          ) : null}

          {messages.length === 0 && !welcome ? (
            <div className="mb-4 rounded-panel border border-line bg-bg/25 p-4">
              <p className="text-[15px] font-semibold text-ink">Votre copilote pour explorer les données</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-3">
                {available ? "Demandez une explication ou une action, par exemple : « Montre le Haut-Ogooué en 2024 »." : "L’assistant IA est hors ligne pour le moment. Consultez les questions fréquentes ou utilisez la visite guidée."}
              </p>
            </div>
          ) : null}

          {messages.length > 0 ? (
            <div className="mb-4 flex items-center gap-2 border-b border-line/70 pb-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-3">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden />
              Conversation
              <span className="ml-auto normal-case tracking-normal">{messages.length} message{messages.length > 1 ? "s" : ""}</span>
            </div>
          ) : null}

          <ol aria-label="Messages de la conversation" className="flex flex-col gap-5">
            {messages.map((m) => (
              <li key={m.id} className={cx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <div className="max-w-[88%] rounded-[18px] rounded-br-[6px] border border-accent/20 bg-[linear-gradient(145deg,rgba(18,191,210,0.18),rgba(18,191,210,0.08))] px-4 py-3 text-[14px] leading-relaxed text-ink shadow-[0_6px_18px_-12px_rgb(18_191_210/0.5)]">
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-strong">Vous</p>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                  </div>
                ) : (
                  <div className="flex max-w-full gap-2.5">
                    <AssistantMark size={24} className="mt-0.5 shrink-0" />
                    <div className={cx("min-w-0 flex-1 rounded-[16px] rounded-tl-[6px] border border-line bg-surface-2/75 px-3.5 py-3 text-[14px] leading-relaxed", m.error ? "text-warning" : "text-ink-2")}>
                      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent-strong">{BRAND.assistant}</p>
                      <RichText text={m.text} />
                      <Receipts message={m} onConfirm={(r) => confirmExport(m, r)} />
                      {m.sources?.length ? <p className="mt-2.5 text-[11.5px] text-ink-3">Chiffres lus dans : {m.sources.join(" · ")}</p> : null}
                      {!m.error && canSpeak() && !voiceMode ? (
                        <button
                          type="button"
                          onClick={() => void readAloud(m)}
                          aria-label={reading === m.id ? "Arrêter la lecture" : "Écouter cette réponse"}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          {reading === m.id ? <SpeakerSimpleSlash size={14} /> : <SpeakerHigh size={14} />}
                          {reading === m.id ? "Arrêter" : "Écouter"}
                        </button>
                      ) : null}
                      {m.fallbackModel ? <p className="mt-1 text-[11.5px] text-ink-3">Réponse du modèle de secours {m.fallbackModel} : le modèle principal était surchargé.</p> : null}
                    </div>
                  </div>
                )}
              </li>
            ))}
            {busy ? (
              <li className="flex items-center gap-2.5 text-[13px] text-ink-3" role="status">
                <AssistantMark size={24} className="animate-pulse" />
                {BRAND.assistant} consulte les données…
              </li>
            ) : null}
          </ol>

          {!available && status !== null ? (
            <div className="mt-4">
              <OfflineHelp status={status} onAction={applyLocal} />
            </div>
          ) : null}
        </div>

        {/* Suggestions et saisie */}
        <footer className="shrink-0 border-t border-line bg-surface px-4 pb-4 pt-3">
          {voiceMode ? (
            <VoiceConversation
              serverTranscription={status?.transcription === true}
              ask={(text) => send(text, true)}
              cancelAsk={() => abort.current?.abort()}
              onClose={() => setVoiceMode(false)}
            />
          ) : null}
          {!voiceMode && available && !busy ? (
            <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1" aria-label="Suggestions">
              {SUGGESTIONS[page].map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-ink">
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <form
            hidden={voiceMode}
            onSubmit={(e) => {
              e.preventDefault();
              void send(draft);
            }}
            className={cx("flex items-end gap-2 rounded-[16px] border bg-bg/50 p-1.5 pl-3 transition-colors", available ? "border-line-strong focus-within:border-accent" : "border-line")}
          >
            <label htmlFor="assistant-input" className="sr-only">
              Votre message
            </label>
            <textarea
              id="assistant-input"
              ref={input}
              rows={1}
              value={draft}
              disabled={!available || busy}
              maxLength={LIMITS.userMessageChars}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              placeholder={available ? "Posez une question ou demandez une action" : "Assistant IA non configuré sur ce serveur"}
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] text-ink placeholder:text-ink-3 focus:outline-none disabled:cursor-not-allowed"
            />
            {available && !busy && voiceEngine ? (
              <button
                type="button"
                onClick={() => {
                  stopSpeaking();
                  setReading(null);
                  setVoiceMode(true);
                }}
                aria-label="Démarrer une conversation vocale"
                title="Conversation vocale"
                className="flex size-9 shrink-0 items-center justify-center rounded-[12px] text-ink-2 transition-colors hover:bg-surface-3 hover:text-ink"
              >
                <Microphone size={18} />
              </button>
            ) : null}
            {busy ? (
              <button type="button" onClick={() => abort.current?.abort()} aria-label="Interrompre" className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-surface-3 text-ink hover:bg-line-strong">
                <Stop size={16} weight="fill" />
              </button>
            ) : (
              <button type="submit" disabled={!available || !draft.trim()} aria-label="Envoyer" className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-ink transition-colors hover:bg-accent-strong disabled:bg-surface-3 disabled:text-ink-3">
                <ArrowUp size={17} weight="bold" />
              </button>
            )}
          </form>
          <p className="mt-2 text-[11px] leading-snug text-ink-3">Hot-Spot AI peut se tromper. Les chiffres viennent des données chargées ; vérifiez-les dans les écrans concernés.</p>
        </footer>
      </aside>
    </>
  );
}

/** Bouton flottant d'acces a l'assistant. */
export function AssistantLauncher({ className }: { className?: string }) {
  const open = useAssistant((s) => s.open);
  if (open) return null;
  return (
    <button
      type="button"
      data-tour="assistant-launcher"
      onClick={() => setAssistant({ open: true })}
      aria-label={`Ouvrir ${BRAND.assistant}`}
      className={cx(
        "group fixed z-20 flex items-center gap-2 rounded-full border border-accent/40 bg-surface-2 py-1.5 pl-1.5 pr-4 text-[13.5px] font-medium text-ink shadow-[0_12px_32px_-8px_rgb(0_0_0/0.7)] transition-[transform,border-color] duration-200 hover:-translate-y-0.5 hover:border-accent active:translate-y-0",
        className,
      )}
    >
      <AssistantMark size={30} />
      {BRAND.assistant}
    </button>
  );
}
