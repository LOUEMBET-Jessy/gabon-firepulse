/**
 * Hot-Spots AI en flux : la reponse s'affiche mot a mot pendant que le modele l'ecrit.
 *
 * Evenements envoyes au navigateur (text/event-stream) :
 *   status  etape en cours (« Je lis la synthese de la zone… »)
 *   delta   fragment de texte de la reponse
 *   done    fin : actions a appliquer, sources des chiffres, modele qui a repondu
 *   error   echec explique (aucune reponse inventee)
 *
 * Latence :
 *   - reponses locales instantanees (salutations, aide) : aucun appel au modele ;
 *   - resume chiffre de la selection (zone, periode) mis en cache et fourni au modele : la plupart
 *     des questions courantes se repondent sans appel d'outil, donc en un seul aller-retour ;
 *   - premier fragment attendu 3 s au plus du modele principal, sinon bascule immediate sur le modele
 *     de secours (sans nouvelle tentative du meme modele) ;
 *   - disjoncteur : apres 2 surcharges consecutives du modele principal, le secours repond directement
 *     pendant 5 minutes ;
 *   - reflexion minimale, sortie bornee, temperature basse.
 * Journal serveur : modele, delai au premier fragment, duree totale (jamais le contenu des messages).
 */

import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type FunctionCall, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";

import type { AssistantAction, AssistantContext, ChatTurn } from "../assistant/protocol";
import { getStore, type Store } from "../server/store";
import { zoneKey } from "../server/zone";
import type { AiConfig } from "./config";
import { AssistantUnavailable } from "./errors";
import { GEMINI_FUNCTIONS, geminiError, isTransient } from "./gemini";
import { SYSTEM_PROMPT, VOICE_PROMPT } from "./prompt";
import { quickReply } from "./quick";
import { runAssistant } from "./service";
import { describeContext, runTool } from "./tools";

export type StreamEvent =
  | { type: "status"; text: string }
  | { type: "delta"; text: string }
  | { type: "done"; actions: AssistantAction[]; sources: string[]; model: string; fallback: boolean }
  | { type: "error"; error: string; status: number; unavailable?: boolean; retryAfter?: number };

export type Emit = (event: StreamEvent) => void;

/** Appel du modele en flux : injectable pour les tests. */
export type GenerateStream = (params: GenerateContentParameters) => Promise<AsyncGenerator<GenerateContentResponse>>;

let client: GoogleGenAI | null = null;
export function defaultGenerateStream(): GenerateStream {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY?.trim() });
  return (params) => client!.models.generateContentStream(params);
}

/** Reglages du flux. */
export const STREAM = {
  primaryFirstChunkMs: 3000,
  fallbackFirstChunkMs: 5000,
  maxOutputTokens: 600,
  temperature: 0.3,
  breakerThreshold: 2,
  breakerMs: 5 * 60 * 1000,
};

/* ------------------------------------------------------------------ Disjoncteur */

const breaker = { failures: 0, openUntil: 0 };
/** Modeles de secours en echec recent (quota, surcharge) : mis de cote 2 minutes, sauf s'il n'en reste aucun. */
const resting = new Map<string, number>();
const FALLBACK_REST_MS = 2 * 60 * 1000;
/** Modeles qui refusent la reflexion « minimale » : on leur demande directement « low ». */
const noMinimal = new Set<string>();

/** Remise a zero, pour les tests. */
export function resetStreamBreaker() {
  breaker.failures = 0;
  breaker.openUntil = 0;
  resting.clear();
  noMinimal.clear();
}

export function breakerOpen(now = Date.now()): boolean {
  return breaker.openUntil > now;
}

function recordPrimary(ok: boolean) {
  if (ok) {
    breaker.failures = 0;
    return;
  }
  breaker.failures++;
  if (breaker.failures >= STREAM.breakerThreshold) {
    breaker.openUntil = Date.now() + STREAM.breakerMs;
    breaker.failures = 0;
    console.warn(`[assistant] modèle principal surchargé ${STREAM.breakerThreshold} fois de suite : secours direct pendant ${STREAM.breakerMs / 60000} min`);
  }
}

/* ------------------------------------------------------------------ Resume chiffre en cache */

const summaries = new Map<string, { text: string; source: string } | null>();

/** Synthese chiffree de la zone et de la periode selectionnees (meme calcul que l'outil get_activity_summary). */
export function selectionSummary(ctx: AssistantContext, store: Store): { text: string; source: string } | null {
  const key = `${store.country}|${store.metadata.built_at}|${zoneKey(ctx.zone)}|${ctx.from}|${ctx.to}`;
  if (summaries.has(key)) return summaries.get(key)!;
  let value: { text: string; source: string } | null = null;
  try {
    const outcome = runTool("get_activity_summary", {}, ctx, store);
    if (!outcome.isError && outcome.source) value = { text: outcome.content, source: outcome.source };
  } catch {
    value = null;
  }
  if (summaries.size > 64) summaries.delete(summaries.keys().next().value!);
  summaries.set(key, value);
  return value;
}

/* ------------------------------------------------------------------ Etapes affichees */

const STEP: Record<string, string> = {
  get_activity_summary: "Je lis la synthèse de la zone…",
  get_history: "Je parcours l'historique depuis 2000…",
  get_month_detail: "J'examine le détail du mois…",
  get_province_ranking: "Je compare les provinces…",
  get_method_facts: "Je relis la méthode et les limites…",
  prepare_export: "Je prépare l'export…",
  start_guided_tour: "Je prépare la visite guidée…",
};
const stepFor = (tool: string) => STEP[tool] ?? "Je règle l'écran…";

const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);
const REFUSAL = "Je ne peux pas répondre à cette demande. Je peux en revanche vous aider à explorer les détections, à lire un graphique ou à comprendre la méthode.";

/** Pas de premier fragment dans le delai : le modele est juge surcharge. */
class FirstChunkTimeout extends Error {
  constructor(model: string) {
    super(`${model} : aucun fragment dans le délai`);
  }
}
/** Echec apres le debut de la reponse : on ne peut plus changer de modele sans repeter le texte. */
class AfterFirstWords extends Error {
  constructor(readonly cause: unknown) {
    super("échec après le début de la réponse");
  }
}

interface TurnResult {
  actions: AssistantAction[];
  sources: string[];
  text: string;
  firstChunkMs: number | null;
  rounds: number;
  /** Noms des outils appeles (journal : jamais le contenu). */
  tools?: string[];
}

/** Un tour complet avec un modele, en flux. Lance l'erreur brute si rien n'a encore ete affiche. */
async function streamTurn(
  model: string,
  firstChunkMs: number,
  history: ChatTurn[],
  context: AssistantContext,
  config: AiConfig,
  generate: GenerateStream,
  emit: Emit,
  signal: AbortSignal | undefined,
  voice: boolean,
  /** Debut de la requete : les delais journalises partent de la, bascule comprise. */
  started: number,
): Promise<TurnResult> {
  const store = getStore(context.country ?? "GAB");
  const ctx: AssistantContext = structuredClone(context);
  const actions: AssistantAction[] = [];
  const sources: string[] = [];
  const contents: Content[] = history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] }));
  // Le resume chiffre accompagne aussi la question : le modele y repond directement, sans appel d'outil.
  const initial = selectionSummary(ctx, store);
  const last = contents[contents.length - 1];
  if (initial && last?.role === "user") {
    last.parts = [...(last.parts ?? []), { text: `[Données de la sélection affichée, déjà lues pour toi : ${initial.text}]` }];
  }
  let text = "";
  let firstAt: number | null = null;
  let thinking = noMinimal.has(model) ? ThinkingLevel.LOW : ThinkingLevel.MINIMAL;
  let malformed = 0;
  const tools: string[] = [];

  const say = (fragment: string) => {
    if (!fragment) return;
    if (firstAt === null) firstAt = performance.now() - started;
    emit({ type: "delta", text: fragment });
    text += fragment;
  };

  for (let round = 0; round < config.maxToolRounds; round++) {
    const summary = selectionSummary(ctx, store);
    const systemInstruction = [
      SYSTEM_PROMPT,
      voice ? VOICE_PROMPT : "",
      describeContext(ctx, store),
      summary
        ? `Résumé chiffré de la sélection actuelle, lu dans les données (utilisable tel quel ; appelle un outil seulement pour une autre zone, une autre période ou plus de détail) :\n${summary.text}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const controller = new AbortController();
    const relay = () => controller.abort();
    signal?.addEventListener("abort", relay);
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      round === 0 ? firstChunkMs : config.requestTimeoutMs,
    );
    const parts: Part[] = [];
    let finish = "";
    let blocked = false;
    const separate = text.length > 0;
    let separated = false;
    try {
      const iterator = await generate({
        model,
        contents,
        config: {
          systemInstruction,
          tools: [{ functionDeclarations: GEMINI_FUNCTIONS }],
          maxOutputTokens: STREAM.maxOutputTokens,
          temperature: STREAM.temperature,
          thinkingConfig: { thinkingLevel: thinking },
          abortSignal: controller.signal,
          httpOptions: { timeout: config.requestTimeoutMs, retryOptions: { attempts: 1 } },
        },
      });
      for await (const chunk of iterator) {
        clearTimeout(timer);
        if (chunk.promptFeedback?.blockReason) blocked = true;
        const candidate = chunk.candidates?.[0];
        if (candidate?.finishReason) finish = candidate.finishReason;
        for (const part of candidate?.content?.parts ?? []) {
          parts.push(part);
          if (typeof part.text === "string" && part.text && !part.thought) {
            if (separate && !separated) {
              say("\n\n");
              separated = true;
            }
            say(part.text);
          }
        }
      }
    } catch (error) {
      // Niveau de reflexion « minimal » refuse par ce modele : meme tour, niveau « low ».
      if (!text && error instanceof ApiError && error.status === 400 && /thinking/i.test(error.message ?? "") && thinking === ThinkingLevel.MINIMAL) {
        thinking = ThinkingLevel.LOW;
        noMinimal.add(model);
        round--;
        continue;
      }
      if (text) throw new AfterFirstWords(error);
      if (timedOut && !signal?.aborted) throw new FirstChunkTimeout(model);
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
    }

    if (blocked || BLOCKED.has(finish)) {
      if (!text) say(REFUSAL);
      return { actions, sources: [...new Set(sources)], text, firstChunkMs: firstAt, rounds: round + 1 };
    }
    const calls = parts.map((p) => p.functionCall).filter((c): c is FunctionCall => Boolean(c?.name));
    if (finish === "MALFORMED_FUNCTION_CALL" && calls.length === 0 && malformed++ < 1) continue;

    if (calls.length === 0) {
      if (!text) say(actions.length ? "C'est fait." : "Je n'ai pas de réponse à proposer.");
      if (finish === "MAX_TOKENS") say("\n\n(Réponse interrompue : elle était trop longue.)");
      // Chiffres tires du resume fourni d'office : la source est citee comme pour un outil.
      if (summary && /\d/.test(text) && sources.length === 0) sources.push(summary.source);
      return { actions, sources: [...new Set(sources)], text, firstChunkMs: firstAt, rounds: round + 1, tools };
    }

    // Tour du modele renvoye intact (signatures de reflexion comprises), puis les reponses des outils.
    contents.push({ role: "model", parts });
    const responses: Part[] = calls.map((call) => {
      emit({ type: "status", text: stepFor(call.name!) });
      tools.push(call.name!);
      let outcome;
      try {
        outcome = runTool(call.name!, call.args ?? {}, ctx, store);
      } catch (error) {
        console.error("[assistant] outil en erreur", call.name, error instanceof Error ? error.message : error);
        outcome = { content: "Erreur interne en lisant les données. Aucune action effectuée.", isError: true };
      }
      if (outcome.action) actions.push(outcome.action);
      if (outcome.source) sources.push(outcome.source);
      return { functionResponse: { id: call.id, name: call.name, response: outcome.isError ? { error: outcome.content } : { output: outcome.content } } };
    });
    contents.push({ role: "user", parts: responses });
  }
  say(text ? "" : "Cette demande nécessite trop d'étapes pour une seule réponse. Pouvez-vous la découper en questions plus simples ?");
  return { actions, sources: [...new Set(sources)], text, firstChunkMs: firstAt, rounds: config.maxToolRounds };
}

function emitError(emit: Emit, error: unknown) {
  const e = error instanceof AssistantUnavailable ? error : geminiError(error);
  emit({ type: "error", error: e.message, status: e.status, unavailable: e.status === 503, retryAfter: e.retryAfterSeconds });
}

/**
 * Un tour de conversation en flux. N'echoue jamais : toute erreur devient un evenement « error ».
 */
export async function runAssistantStream(
  history: ChatTurn[],
  context: AssistantContext,
  options: { config: AiConfig; emit: Emit; signal?: AbortSignal; voice?: boolean; generate?: GenerateStream },
): Promise<void> {
  const { config, emit, signal } = options;
  const started = performance.now();
  const question = history[history.length - 1]?.text ?? "";

  // 1. Reponse locale instantanee.
  const local = quickReply(question, context);
  if (local) {
    emit({ type: "delta", text: local.text });
    emit({ type: "done", actions: local.actions, sources: local.sources, model: "local", fallback: false });
    console.info(`[assistant] modèle=local 1er mot=${Math.round(performance.now() - started)} ms total=${Math.round(performance.now() - started)} ms`);
    return;
  }

  // 2. Autre fournisseur (Anthropic) : reponse complete, envoyee en un fragment.
  if (config.provider !== "gemini") {
    try {
      const reply = await runAssistant(history, context, { config, signal, voice: options.voice });
      emit({ type: "delta", text: reply.text });
      emit({ type: "done", actions: reply.actions, sources: reply.sources, model: reply.model ?? config.model, fallback: Boolean(reply.fallback) });
    } catch (error) {
      emitError(emit, error);
    }
    return;
  }

  // 3. Gemini en flux, avec bascule rapide et disjoncteur.
  // L'interface affiche deja l'etape initiale (« Je lis les donnees du Gabon, annee 2025… ») : le serveur n'envoie que les suivantes.
  const generate = options.generate ?? defaultGenerateStream();
  const skipPrimary = breakerOpen() && config.fallbackModels.length > 0;
  const now = Date.now();
  const ready = config.fallbackModels.filter((m) => (resting.get(m) ?? 0) <= now);
  const fallbacks = ready.length ? ready : config.fallbackModels;
  const models = skipPrimary ? fallbacks : [config.model, ...fallbacks];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const isPrimary = model === config.model;
    const firstChunkMs = isPrimary ? STREAM.primaryFirstChunkMs : i === models.length - 1 ? config.requestTimeoutMs : STREAM.fallbackFirstChunkMs;
    try {
      const result = await streamTurn(model, firstChunkMs, history, context, config, generate, emit, signal, options.voice === true, started);
      if (isPrimary) recordPrimary(true);
      else resting.delete(model);
      emit({ type: "done", actions: result.actions, sources: result.sources, model, fallback: !isPrimary });
      console.info(
        `[assistant] modèle=${model} 1er mot=${result.firstChunkMs === null ? "-" : Math.round(result.firstChunkMs)} ms total=${Math.round(performance.now() - started)} ms tours=${result.rounds}${result.tools?.length ? ` outils=${result.tools.join(",")}` : ""}${skipPrimary ? " (disjoncteur ouvert)" : ""}`,
      );
      return;
    } catch (error) {
      if (signal?.aborted) return;
      if (error instanceof AfterFirstWords) {
        console.error("[assistant] flux interrompu", model, error.cause instanceof Error ? error.cause.message : error.cause);
        emit({ type: "error", error: "La réponse a été interrompue par le service IA. Réessayez.", status: 503 });
        return;
      }
      const transient = error instanceof FirstChunkTimeout || isTransient(error);
      if (isPrimary && transient) recordPrimary(false);
      if (!isPrimary && transient) resting.set(model, Date.now() + FALLBACK_REST_MS);
      if (!transient || i === models.length - 1) {
        console.warn(`[assistant] échec du modèle ${model} après ${Math.round(performance.now() - started)} ms`);
        emitError(emit, error instanceof FirstChunkTimeout ? new AssistantUnavailable("Le service IA n'a pas répondu à temps (surcharge). Réessayez dans un instant.", 503) : error);
        return;
      }
      console.warn(`[assistant] ${model} ${error instanceof FirstChunkTimeout ? "sans premier fragment en " + firstChunkMs + " ms" : "indisponible"} : bascule sur ${models[i + 1]}`);
      emit({ type: "status", text: "Le service est chargé : un modèle de secours prend le relais…" });
    }
  }
}
