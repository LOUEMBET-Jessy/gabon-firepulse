"use client";

/**
 * Panneau de Hot-Spots AI : conversation, actions appliquees, confirmations, aide hors ligne.
 * Non modal sur ordinateur (la page reste visible et utilisable pendant l'echange), plein ecran sur telephone.
 */

import {
  ArrowCounterClockwise,
  ArrowRight,
  ArrowUp,
  CaretDown,
  ChatCircleText,
  ChartLineUp,
  Check,
  CompassTool,
  Copy,
  CursorClick,
  Database,
  DownloadSimple,
  Eye,
  Info,
  Microphone,
  ShieldCheck,
  SpeakerHigh,
  SpeakerSimpleSlash,
  Stop,
  Trash,
  WarningCircle,
  X,
} from "@phosphor-icons/react/dist/ssr";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useRef, useState } from "react";

import { AssistantMark, BRAND } from "@/components/brand";
import { zoneLabel } from "@/components/shell/pickers";
import { Button, cx } from "@/components/ui";
import { useMetadata } from "@/lib/api";
import { FAQ, SUGGESTIONS, TOUR } from "@/lib/assistant/content";
import { LIMITS, PAGES, needsConfirmation, pageFromPath, type AssistantReply, type AssistantStatus } from "@/lib/assistant/protocol";
import { fmtPeriod } from "@/lib/format";
import { canSpeak, speak, stopSpeaking } from "@/lib/voice/speak";
import { useFilters } from "@/state/filters";
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

import { describeAction, useActionRunner, useAssistantContext } from "./runtime";
import { VoiceConversation, voiceSupport } from "./voice";

/* ------------------------------------------------------------------ Rendu du texte */

/**
 * Mise en forme minimale et sure : paragraphes, listes « - », « * » ou « 1. », gras **...**. Aucun HTML injecte.
 * Lecture ligne par ligne : une liste qui suit une ligne de titre (« Limites : ») est bien reconnue.
 */
function RichText({ text }: { text: string }) {
  const inline = (line: string, key: string) =>
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

  type Block = { kind: "p"; lines: string[] } | { kind: "ul" | "ol"; items: string[] };
  const blocks: Block[] = [];
  for (const raw of text.trim().split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const last = blocks[blocks.length - 1];
    if (!line.trim()) {
      blocks.push({ kind: "p", lines: [] });
    } else if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (last && last.kind === "p") {
      last.lines.push(line);
    } else {
      blocks.push({ kind: "p", lines: [line] });
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, b) => {
        if (block.kind === "p") {
          if (block.lines.length === 0) return null;
          return (
            <p key={b}>
              {block.lines.map((l, i) => (
                <Fragment key={i}>
                  {i ? <br /> : null}
                  {inline(l, `${b}-${i}`)}
                </Fragment>
              ))}
            </p>
          );
        }
        const List = block.kind === "ul" ? "ul" : "ol";
        return (
          <List key={b} className="flex flex-col gap-1.5">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-2.5">
                {block.kind === "ul" ? (
                  <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-accent/80" />
                ) : (
                  <span aria-hidden className="num mt-px w-4 shrink-0 text-right text-[12.5px] text-accent">
                    {i + 1}.
                  </span>
                )}
                <span className="min-w-0">{inline(item, `${b}-${i}`)}</span>
              </li>
            ))}
          </List>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Accuses d'action */

function Receipts({ message, onConfirm }: { message: UiMessage; onConfirm: (receipt: ActionReceipt) => void }) {
  if (!message.receipts?.length) return null;
  const applied = message.receipts.filter((r) => r.action.type !== "export");
  const exports = message.receipts.filter((r) => r.action.type === "export");
  return (
    <div className="mt-3 flex flex-col gap-2" aria-label="Actions de l'assistant">
      {applied.length ? (
        <div className="rounded-[12px] border border-line bg-bg/35 px-3 py-2.5">
          <p className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-ink-3">
            <CursorClick size={13} className="text-accent" />
            Appliqué à l'écran
          </p>
          <ul className="flex flex-col gap-1">
            {applied.map((r) => (
              <li key={r.id} className="flex items-start gap-2 text-[12.5px] text-ink-2">
                {r.state === "failed" ? <WarningCircle size={15} className="mt-px shrink-0 text-warning" /> : <Check size={15} weight="bold" className="mt-px shrink-0 text-good" />}
                <span>{r.state === "failed" ? `Non appliqué : ${describeAction(r.action)}` : describeAction(r.action)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {exports.map((r) =>
        r.action.type === "export" ? (
          <div key={r.id} className="rounded-[12px] border border-accent/30 bg-accent/[0.06] p-3">
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
          </div>
        ) : null,
      )}
    </div>
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

/* ------------------------------------------------------------------ Presentation */

const CAPABILITIES = [
  { icon: ChatCircleText, title: "Expliquer", example: "Que signifie l'indice harmonisé ?" },
  { icon: CursorClick, title: "Régler l'écran pour vous", example: "Montre le Haut-Ogooué en 2024" },
  { icon: ChartLineUp, title: "Analyser les chiffres", example: "Cette période est-elle inhabituelle ?" },
] as const;

/**
 * Comment l'assistant se presente : qui il est, ce qu'il sait faire (chaque capacite est un exemple
 * cliquable), ce qu'il propose sur cet ecran, et ses engagements sur les donnees.
 */
function Intro({
  welcome,
  available,
  status,
  page,
  voice,
  onAsk,
  onVoice,
  onTour,
  onDismiss,
}: {
  welcome: boolean;
  available: boolean;
  status: AssistantStatus | null;
  page: keyof typeof SUGGESTIONS;
  voice: boolean;
  onAsk: (text: string) => void;
  onVoice: () => void;
  onTour: () => void;
  onDismiss: () => void;
}) {
  const examples = new Set<string>(CAPABILITIES.map((c) => c.example));
  const suggestions = SUGGESTIONS[page].filter((s) => !examples.has(s));
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-start gap-3 pt-1">
        <AssistantMark size={44} animated={status === null} />
        <div>
          <h2 className="text-[19px] font-semibold leading-snug tracking-[-0.025em] text-ink">{welcome ? `Bienvenue dans ${BRAND.name}` : `Bonjour, je suis ${BRAND.assistant}`}</h2>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-2">
            {welcome ? `Je suis ${BRAND.assistant}. ` : ""}Je lis les détections de feux des satellites de la NASA au Gabon pour vous les expliquer, et je règle l'écran à votre place.
          </p>
        </div>
      </div>

      {welcome ? (
        <div className="rounded-panel border border-accent/25 bg-[radial-gradient(120%_120%_at_100%_0%,color-mix(in_srgb,var(--color-leaf)_14%,transparent),transparent_60%)] p-4">
          <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
            <CompassTool size={17} className="text-accent" />
            Première visite ?
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-2">La visite guidée montre l'essentiel en {TOUR.length} étapes. Vous pouvez l'arrêter et la reprendre à tout moment.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={onTour}>
              <CompassTool size={14} />
              Voir la visite guidée
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Poser une question
            </Button>
          </div>
        </div>
      ) : null}

      {available ? (
        <div>
          <p className="mb-2 text-[12px] font-medium text-ink-3">Ce que je sais faire</p>
          <ul className="flex flex-col gap-1.5">
            {CAPABILITIES.map(({ icon: Icon, title, example }) => (
              <li key={title}>
                <button
                  type="button"
                  onClick={() => onAsk(example)}
                  className="group flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 px-3 py-2.5 text-left transition-[border-color,background-color] duration-200 hover:border-accent/50 hover:bg-surface-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-bg/60 text-accent">
                    <Icon size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">{title}</span>
                    <span className="block truncate text-[12.5px] text-ink-3">« {example} »</span>
                  </span>
                  <ArrowRight size={14} weight="bold" className="shrink-0 text-ink-3 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              </li>
            ))}
            {voice ? (
              <li>
                <button
                  type="button"
                  onClick={onVoice}
                  className="group flex w-full items-center gap-3 rounded-[14px] border border-line bg-surface-2/50 px-3 py-2.5 text-left transition-[border-color,background-color] duration-200 hover:border-accent/50 hover:bg-surface-2"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-bg/60 text-accent">
                    <Microphone size={17} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium text-ink">Converser à voix haute</span>
                    <span className="block text-[12.5px] text-ink-3">Parlez, je vous réponds à l'oral.</span>
                  </span>
                  <ArrowRight size={14} weight="bold" className="shrink-0 text-ink-3 opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {available && suggestions.length ? (
        <div>
          <p className="mb-2 text-[12px] font-medium text-ink-3">Sur cet écran</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => onAsk(s)} className="rounded-full border border-line-strong px-3 py-1.5 text-left text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <p className="flex items-start gap-2 text-[12px] leading-relaxed text-ink-3">
        <ShieldCheck size={15} className="mt-px shrink-0 text-good" />
        Archives NASA FIRMS depuis 2000, mois les plus récents provisoires. Je ne confirme pas d'incendie, je ne fais pas de prédiction, et je n'invente aucun chiffre.
      </p>
    </div>
  );
}

/**
 * Attente d'une reponse. Les messages qui suivent dependent du temps ecoule, pas d'une etape reelle :
 * ils disent seulement que la demande continue, et pourquoi elle peut etre longue.
 */
function Thinking() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <li className="flex items-center gap-3" role="status">
      <AssistantMark size={26} animated />
      <div className="flex flex-col">
        <span className="flex items-center gap-1 text-[13px] text-ink-2">
          {BRAND.assistant} consulte les données
          <span aria-hidden className="ml-0.5 flex gap-[3px]">
            {[0, 1, 2].map((i) => (
              <span key={i} className="thinking-dot size-1 rounded-full bg-accent" style={{ animationDelay: `${i * 160}ms` }} />
            ))}
          </span>
        </span>
        {seconds >= 8 ? (
          <span className="animate-fade-up text-[12px] text-ink-3">
            {seconds >= 20 ? "Le service est chargé : un modèle de secours peut prendre le relais." : "Toujours en cours, le service est parfois lent."}
          </span>
        ) : null}
      </div>
    </li>
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
  const [copied, setCopied] = useState<string | null>(null);
  // Ce que l'assistant voit de l'ecran, affiche en tete du panneau (le meme contexte part avec chaque question).
  const { zone, from, to } = useFilters();
  const meta = useMetadata();
  const zoneName = zoneLabel(zone, meta.data);

  // Conversation de l'onglet, etat du service, premiere visite.
  useEffect(() => {
    hydrateAssistant();
    fetch("/api/assistant/status")
      .then((r) => r.json() as Promise<AssistantStatus>)
      .then((s) => setAssistant({ status: s }))
      .catch(() => setAssistant({ status: { available: false, reason: "Le serveur Hot-Spots ne répond pas.", model: null } }));
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
      const message = aborted ? "Demande interrompue." : "Le serveur Hot-Spots ne répond pas. Vérifiez votre connexion.";
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

  const copy = async (m: UiMessage) => {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopied(m.id);
      window.setTimeout(() => setCopied((c) => (c === m.id ? null : c)), 1600);
    } catch {
      /* presse-papiers refuse : rien a signaler de plus */
    }
  };

  const startVoice = () => {
    stopSpeaking();
    setReading(null);
    if (welcome) dismissWelcome();
    setVoiceMode(true);
  };

  // La zone de saisie suit la longueur du texte, jusqu'a six lignes.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [draft, open]);

  if (!open) return null;

  const empty = messages.length === 0;

  return (
    <>
      <button type="button" aria-label="Fermer l'assistant" onClick={() => setAssistant({ open: false })} className="fixed inset-0 z-30 animate-[fade-in_0.2s_ease-out] bg-bg-deep/70 backdrop-blur-[2px] md:hidden" />
      <aside
        role="complementary"
        aria-label={BRAND.assistant}
        className="fixed inset-x-0 bottom-0 top-[6dvh] z-40 flex animate-fade-up flex-col overflow-hidden rounded-t-[24px] border border-line-strong bg-surface shadow-float md:inset-x-auto md:bottom-3 md:right-3 md:top-3 md:w-[440px] md:rounded-[24px]"
      >
        {/* En-tete : qui repond, dans quel etat, et ce qu'il voit de l'ecran. */}
        <header className="shrink-0 border-b border-line bg-[radial-gradient(90%_140%_at_0%_0%,color-mix(in_srgb,var(--color-leaf)_12%,transparent),transparent_60%)]">
          <div className="flex items-center gap-3 px-4 pb-2 pt-3.5">
            <span className="relative">
              <AssistantMark size={36} animated={busy} />
              <span
                aria-hidden
                className={cx("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface", status === null ? "bg-ink-3" : available ? "bg-good" : "bg-warning")}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold tracking-[-0.015em] text-ink">{BRAND.assistant}</p>
              <p className="text-[12px] text-ink-3">{status === null ? "Vérification du service" : busy ? "Consulte les données…" : available ? "Prêt à vous aider" : "Aide hors ligne"}</p>
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
          </div>
          <p className="flex items-center gap-2 px-4 pb-3 text-[12px] text-ink-3" title="Ce contexte est transmis avec chaque question">
            <Eye size={14} className="shrink-0 text-accent" />
            <span className="truncate">
              Je vois : <span className="text-ink-2">{PAGES[page].label}</span>, <span className="text-ink-2">{zoneName}</span>, <span className="text-ink-2">{fmtPeriod(from, to).toLowerCase()}</span>
            </span>
          </p>
        </header>

        {/* Conversation */}
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-5" aria-live="polite" aria-relevant="additions text">
          {resumeStep !== null && !welcome ? (
            <div className="mb-5 flex items-center justify-between gap-3 rounded-[14px] border border-line bg-surface-2/70 px-3 py-2.5 text-[13px] text-ink-2">
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

          {empty ? (
            <Intro
              welcome={welcome}
              available={available}
              status={status}
              page={page}
              voice={Boolean(voiceEngine)}
              onAsk={(text) => void send(text)}
              onVoice={startVoice}
              onTour={() => {
                dismissWelcome();
                applyLocal([{ type: "start_tour" }]);
              }}
              onDismiss={() => {
                dismissWelcome();
                if (available) input.current?.focus();
              }}
            />
          ) : null}

          <ol aria-label="Messages de la conversation" className="flex flex-col gap-6">
            {messages.map((m) => (
              <li key={m.id} className={cx("flex animate-fade-up", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "user" ? (
                  <p className="max-w-[86%] whitespace-pre-wrap rounded-[18px] rounded-br-[6px] border border-accent/25 bg-accent/10 px-4 py-2.5 text-[14px] leading-relaxed text-ink">
                    {m.text}
                  </p>
                ) : (
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    <p className="flex items-center gap-2 text-[12px] font-medium text-ink-3">
                      <AssistantMark size={20} />
                      {BRAND.assistant}
                    </p>
                    <div className={cx("text-[14px] leading-relaxed", m.error ? "rounded-[14px] border border-warning/30 bg-warning/[0.06] px-3.5 py-3 text-warning" : "text-ink-2")}>
                      {m.error ? (
                        <p className="flex items-start gap-2">
                          <WarningCircle size={16} className="mt-[3px] shrink-0" />
                          <span>{m.text}</span>
                        </p>
                      ) : (
                        <RichText text={m.text} />
                      )}
                      <Receipts message={m} onConfirm={(r) => confirmExport(m, r)} />
                      {m.sources?.length ? (
                        <p className="mt-3 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-ink-3">
                          <Database size={13} className="mt-px shrink-0" />
                          <span>Chiffres lus dans : {m.sources.join(" ; ")}</span>
                        </p>
                      ) : null}
                      {m.fallbackModel ? <p className="mt-1.5 text-[11.5px] text-ink-3">Réponse du modèle de secours {m.fallbackModel} : le modèle principal était surchargé.</p> : null}
                    </div>
                    {!m.error && !voiceMode ? (
                      <div className="-ml-2 flex items-center gap-0.5">
                        {canSpeak() ? (
                          <button
                            type="button"
                            onClick={() => void readAloud(m)}
                            aria-label={reading === m.id ? "Arrêter la lecture" : "Écouter cette réponse"}
                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            {reading === m.id ? <SpeakerSimpleSlash size={14} /> : <SpeakerHigh size={14} />}
                            {reading === m.id ? "Arrêter" : "Écouter"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => void copy(m)}
                          aria-label="Copier cette réponse"
                          className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[12px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                        >
                          {copied === m.id ? <Check size={14} weight="bold" className="text-good" /> : <Copy size={14} />}
                          {copied === m.id ? "Copié" : "Copier"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
            {busy ? <Thinking /> : null}
          </ol>

          {!available && status !== null ? (
            <div className="mt-5">
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
          {!voiceMode && available && !busy && !empty ? (
            <div className="no-scrollbar fade-x -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4" aria-label="Suggestions">
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
            className={cx(
              "flex items-end gap-1.5 rounded-[18px] border bg-bg/50 p-1.5 pl-3.5 transition-[border-color,box-shadow] duration-200",
              available ? "border-line-strong focus-within:border-accent focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]" : "border-line",
            )}
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
              placeholder={available ? "Posez votre question…" : "Assistant IA non configuré"}
              className="max-h-36 min-h-[36px] flex-1 resize-none bg-transparent py-2 text-[14px] leading-snug text-ink placeholder:text-ink-3 focus:outline-none disabled:cursor-not-allowed"
            />
            {available && !busy && voiceEngine ? (
              <button
                type="button"
                onClick={startVoice}
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
              <button
                type="submit"
                disabled={!available || !draft.trim()}
                aria-label="Envoyer"
                className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-accent text-accent-ink transition-[background-color,transform] duration-150 hover:bg-accent-strong active:scale-95 disabled:bg-surface-3 disabled:text-ink-3"
              >
                <ArrowUp size={17} weight="bold" />
              </button>
            )}
          </form>
          <p className="mt-2 flex items-center justify-between gap-3 text-[11px] text-ink-3">
            <span>Peut se tromper : vérifiez les chiffres dans les écrans.</span>
            {draft.length > LIMITS.userMessageChars * 0.8 ? (
              <span className="num shrink-0">
                {draft.length}/{LIMITS.userMessageChars}
              </span>
            ) : (
              <span className="hidden shrink-0 sm:inline">Entrée pour envoyer</span>
            )}
          </p>
        </footer>
      </aside>
    </>
  );
}
