/**
 * Boucle d'outils de Hot-Spots AI avec Google Gemini (SDK officiel @google/genai).
 *
 * Memes outils, memes validations et memes regles que le fournisseur Anthropic :
 * seule la forme des messages change. Le contexte applicatif est ajoute aux instructions
 * systeme (Gemini n'a pas de message systeme en milieu de conversation).
 * Les reponses du modele sont renvoyees telles quelles (signatures de reflexion comprises),
 * comme l'exige l'appel de fonctions de Gemini 3.
 */

import { ApiError, GoogleGenAI, ThinkingLevel, type Content, type FunctionCall, type GenerateContentParameters, type GenerateContentResponse, type Part } from "@google/genai";

import type { AssistantAction, AssistantContext, AssistantReply, ChatTurn } from "../assistant/protocol";
import { getStore } from "../server/store";
import type { AiConfig } from "./config";
import { SYSTEM_PROMPT, VOICE_PROMPT } from "./prompt";
import { TOOL_DEFINITIONS, describeContext, runTool } from "./tools";
import { AssistantUnavailable } from "./errors";

/** Appel du modele : injectable pour les tests. */
export type GenerateContent = (params: GenerateContentParameters) => Promise<GenerateContentResponse>;

let client: GoogleGenAI | null = null;

export function defaultGenerateContent(): GenerateContent {
  client ??= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY?.trim() });
  return (params) => client!.models.generateContent(params);
}

/** Declarations de fonctions Gemini, construites depuis les memes schemas JSON que pour Claude. */
export const GEMINI_FUNCTIONS = TOOL_DEFINITIONS.map((tool) => ({
  name: tool.name,
  description: tool.description,
  parametersJsonSchema: tool.input_schema,
}));

const THINKING: Record<AiConfig["effort"], ThinkingLevel> = { low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH };

/** Fins de generation qui signalent un blocage de securite plutot qu'une reponse. */
const BLOCKED = new Set(["SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "SPII", "RECITATION"]);

const REFUSAL = "Je ne peux pas répondre à cette demande. Je peux en revanche vous aider à explorer les détections, à lire un graphique ou à comprendre la méthode.";

export async function runGemini(
  history: ChatTurn[],
  context: AssistantContext,
  config: AiConfig,
  options: { generate?: GenerateContent; signal?: AbortSignal; voice?: boolean } = {},
): Promise<AssistantReply> {
  const generate = options.generate ?? defaultGenerateContent();
  // Si un modele echoue a n'importe quelle etape, le tour entier est rejoue avec le suivant, a partir de
  // l'etat initial : les lectures sont sans effet, et seules les actions du passage reussi sont renvoyees.
  const { value, model } = await withGeminiFallback(config, options.signal, (m) => runTurn(m, history, context, config, generate, options.signal, options.voice === true));
  return { ...value, model, fallback: model !== config.model };
}

/**
 * Execute une operation avec le modele principal puis les modeles de secours.
 * Un modele qui vient d'echouer (surcharge, quota, delai) est mis de cote quelques minutes,
 * pour ne pas faire attendre chaque demande.
 */
export async function withGeminiFallback<T>(config: AiConfig, signal: AbortSignal | undefined, run: (model: string) => Promise<T>): Promise<{ value: T; model: string }> {
  const now = Date.now();
  const all = [config.model, ...config.fallbackModels];
  const ready = all.filter((m) => (resting.get(m) ?? 0) <= now);
  const models = ready.length ? ready : all;
  for (let index = 0; ; index++) {
    try {
      const value = await run(models[index]);
      resting.delete(models[index]);
      return { value, model: models[index] };
    } catch (error) {
      const transient = isTransient(error) && !signal?.aborted;
      if (transient) resting.set(models[index], Date.now() + REST_MS);
      if (!transient || index >= models.length - 1) throw geminiError(error);
      console.warn(`[assistant] ${models[index]} indisponible (${error instanceof ApiError ? error.status : "délai"}), essai avec ${models[index + 1]}`);
    }
  }
}

/** Modeles temporairement mis de cote apres une surcharge, avec l'heure a laquelle les reessayer. */
const resting = new Map<string, number>();
const REST_MS = 5 * 60 * 1000;

/** Remise a zero, pour les tests. */
export function resetGeminiCooldown() {
  resting.clear();
}

/** Un tour complet de dialogue avec un modele donne. Lance l'erreur brute du SDK en cas d'echec d'appel. */
async function runTurn(
  model: string,
  history: ChatTurn[],
  context: AssistantContext,
  config: AiConfig,
  generate: GenerateContent,
  signal: AbortSignal | undefined,
  voice: boolean,
): Promise<AssistantReply> {
  const store = getStore(context.country ?? "GAB");
  const ctx: AssistantContext = structuredClone(context);
  const actions: AssistantAction[] = [];
  const sources: string[] = [];
  const contents: Content[] = history.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.text }] }));
  const done = (text: string): AssistantReply => ({ text, actions, sources: [...new Set(sources)] });
  let malformed = 0;

  for (let round = 0; round < config.maxToolRounds; round++) {
    const response = await generate({
      model,
      contents,
      config: {
        // Instructions figees, puis contexte du tour : l'etat de l'application peut avoir change entre deux appels.
        systemInstruction: `${SYSTEM_PROMPT}${voice ? `\n\n${VOICE_PROMPT}` : ""}\n\n${describeContext(ctx, store)}`,
        tools: [{ functionDeclarations: GEMINI_FUNCTIONS }],
        maxOutputTokens: config.maxTokens,
        thinkingConfig: { thinkingLevel: THINKING[config.effort] },
        abortSignal: signal,
        // Un seul essai par appel, dans un delai borne : la reprise se fait sur le modele de secours.
        httpOptions: { timeout: config.requestTimeoutMs, retryOptions: { attempts: 1 } },
      },
    });

    if (response.promptFeedback?.blockReason) return done(REFUSAL);
    const candidate = response.candidates?.[0];
    const finish = candidate?.finishReason ?? "";
    if (BLOCKED.has(finish)) return done(REFUSAL);

    const parts: Part[] = candidate?.content?.parts ?? [];
    const calls = parts.map((p) => p.functionCall).filter((c): c is FunctionCall => Boolean(c?.name));
    const text = parts
      .filter((p) => typeof p.text === "string" && !p.thought)
      .map((p) => p.text)
      .join("")
      .trim();

    if (finish === "MALFORMED_FUNCTION_CALL" && malformed++ < 1) continue;

    if (calls.length === 0) {
      return done((text || (actions.length ? "C'est fait." : "Je n'ai pas de réponse à proposer.")) + (finish === "MAX_TOKENS" ? "\n\n(Réponse interrompue : elle était trop longue.)" : ""));
    }

    // Tour du modele renvoye intact (signatures de reflexion comprises), puis toutes les reponses de fonctions.
    contents.push({ role: "model", parts });
    const responses: Part[] = calls.map((call) => {
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

  return done("Cette demande nécessite trop d'étapes pour une seule réponse. Pouvez-vous la découper en questions plus simples ?");
}

/** Surcharge, quota, erreur serveur ou delai depasse : un autre modele peut repondre. */
function isTransient(error: unknown): boolean {
  if (error instanceof ApiError) return error.status === 429 || error.status >= 500;
  return true;
}

function geminiError(error: unknown): AssistantUnavailable {
  if (error instanceof Error && error.name === "AbortError" && !/timeout|time out/i.test(error.message)) return new AssistantUnavailable("Demande interrompue.", 499);
  if (error instanceof ApiError) {
    const message = error.message ?? "";
    if (error.status === 401 || error.status === 403 || (error.status === 400 && /api key|API_KEY/i.test(message))) {
      console.error("[assistant] clé refusée par Google Gemini", error.status);
      return new AssistantUnavailable("Google Gemini a refusé la clé configurée sur ce serveur. L'aide hors ligne reste disponible.", 503);
    }
    if (error.status === 404) {
      console.error("[assistant] modèle Gemini introuvable");
      return new AssistantUnavailable("Le modèle Gemini configuré est introuvable. Vérifiez GEMINI_MODEL.", 503);
    }
    if (error.status === 429) return new AssistantUnavailable("Le service IA est très sollicité ou le quota Gemini est atteint. Réessayez dans un instant.", 429, 30);
    if (error.status === 400) {
      console.error("[assistant] requête refusée par Gemini :", message.slice(0, 300));
      return new AssistantUnavailable("Le service IA n'a pas pu traiter cette demande.", 502);
    }
    console.error("[assistant] erreur Gemini", error.status);
    return new AssistantUnavailable("Les modèles Gemini configurés sont surchargés pour le moment. Réessayez dans quelques minutes.", 503);
  }
  console.error("[assistant] Gemini sans réponse", error instanceof Error ? error.message : error);
  return new AssistantUnavailable("Le service IA n'a pas répondu à temps (surcharge ou connexion). Réessayez dans un instant.", 503);
}
