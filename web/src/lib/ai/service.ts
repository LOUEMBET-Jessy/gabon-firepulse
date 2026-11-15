/**
 * Service de l'assistant Hot-Spots AI : boucle d'outils cote serveur.
 *
 * - Les outils de lecture s'executent ici, sur les donnees reelles.
 * - Les actions d'interface sont validees ici puis renvoyees au navigateur, qui les applique
 *   avec les fonctions de l'application ; l'export attend une confirmation de l'utilisateur.
 * - Le contexte applicatif est transmis comme message systeme de milieu de conversation :
 *   il porte l'autorite de l'operateur et ne casse pas le prefixe mis en cache.
 */

import Anthropic from "@anthropic-ai/sdk";

import { LIMITS, type AssistantAction, type AssistantContext, type AssistantReply, type ChatTurn } from "../assistant/protocol";
import { getStore } from "../server/store";
import { aiConfig, type AiConfig } from "./config";
import { AssistantUnavailable } from "./errors";
import { runGemini, type GenerateContent } from "./gemini";
import { SYSTEM_PROMPT, VOICE_PROMPT } from "./prompt";
import { TOOL_DEFINITIONS, describeContext, runTool } from "./tools";

type Beta = Anthropic.Beta.Messages.BetaMessage;
type BetaParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;

/** Fonction d'appel du modele : injectable pour les tests. */
export type CreateMessage = (params: BetaParams, options: { signal?: AbortSignal }) => Promise<Beta>;

export { AssistantUnavailable };

let client: Anthropic | null = null;

export function defaultCreateMessage(): CreateMessage {
  // Le client lit ANTHROPIC_API_KEY (ou ANTHROPIC_AUTH_TOKEN) dans l'environnement du serveur.
  client ??= new Anthropic({ maxRetries: 1, timeout: 60_000 });
  return (params, options) => client!.beta.messages.create(params, { signal: options.signal });
}

/** Historique nettoye : alternance stricte, longueurs bornees, derniers tours seulement. */
export function sanitizeHistory(raw: unknown): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  const turns: ChatTurn[] = [];
  for (const item of raw.slice(-LIMITS.historyTurns)) {
    if (!item || typeof item !== "object") continue;
    const { role, text } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof text !== "string" || !text.trim()) continue;
    const limit = role === "user" ? LIMITS.userMessageChars : LIMITS.assistantMessageChars;
    const clean = text.replace(/\u0000/g, "").trim().slice(0, limit);
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.text += `\n\n${clean}`;
    else turns.push({ role, text: clean });
  }
  while (turns.length && turns[0].role !== "user") turns.shift();
  return turns;
}

export async function runAssistant(
  history: ChatTurn[],
  context: AssistantContext,
  options: { createMessage?: CreateMessage; generateContent?: GenerateContent; config?: AiConfig; signal?: AbortSignal; voice?: boolean } = {},
): Promise<AssistantReply> {
  const config = options.config ?? aiConfig();
  const injected = Boolean(options.createMessage || options.generateContent);
  if (!config.enabled && !injected) throw new AssistantUnavailable(config.reason ?? "Assistant indisponible.", 503);
  if (!history.length || history[history.length - 1].role !== "user") throw new AssistantUnavailable("Le dernier message doit venir de l'utilisateur.", 400);
  if (config.provider === "gemini") return runGemini(history, context, config, { generate: options.generateContent, signal: options.signal, voice: options.voice });

  const create = options.createMessage ?? defaultCreateMessage();
  const store = getStore(context.country ?? "GAB");
  const ctx: AssistantContext = structuredClone(context);
  const actions: AssistantAction[] = [];
  const sources: string[] = [];

  const messages: BetaMessageParam[] = history.map((t) => ({ role: t.role, content: t.text }));
  // Contexte de l'application : apres le dernier message utilisateur, avant la reponse.
  messages.push({ role: "system", content: `${describeContext(ctx, store)}${options.voice ? `\n\n${VOICE_PROMPT}` : ""}` });

  for (let round = 0; round < config.maxToolRounds; round++) {
    let response: Beta;
    try {
      response = await create(
        {
          model: config.model,
          max_tokens: config.maxTokens,
          system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
          tools: TOOL_DEFINITIONS,
          messages,
          output_config: { effort: config.effort },
          // Repli serveur en cas de refus de securite : la requete est rejouee sur un modele adapte.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
        },
        { signal: options.signal },
      );
    } catch (error) {
      throw toUnavailable(error);
    }

    if (response.stop_reason === "refusal") {
      return { text: "Je ne peux pas répondre à cette demande. Je peux en revanche vous aider à explorer les détections, à lire un graphique ou à comprendre la méthode.", actions, sources };
    }

    const toolUses = response.content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === "tool_use");
    const text = response.content
      .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const truncated = response.stop_reason === "max_tokens";
      return {
        text: (text || (actions.length ? "C'est fait." : "Je n'ai pas de réponse à proposer.")) + (truncated ? "\n\n(Réponse interrompue : elle était trop longue.)" : ""),
        actions,
        sources: [...new Set(sources)],
      };
    }

    // Toutes les reponses aux outils d'un tour dans un seul message utilisateur.
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.Messages.BetaToolResultBlockParam[] = toolUses.map((use) => {
      let outcome;
      try {
        outcome = runTool(use.name, use.input, ctx, store);
      } catch (error) {
        console.error("[assistant] outil en erreur", use.name, error instanceof Error ? error.message : error);
        outcome = { content: "Erreur interne en lisant les données. Aucune action effectuée.", isError: true };
      }
      if (outcome.action) actions.push(outcome.action);
      if (outcome.source) sources.push(outcome.source);
      return { type: "tool_result", tool_use_id: use.id, content: outcome.content, ...(outcome.isError ? { is_error: true } : {}) };
    });
    messages.push({ role: "user", content: results });
  }

  return {
    text: "Cette demande nécessite trop d'étapes pour une seule réponse. Pouvez-vous la découper en questions plus simples ?",
    actions,
    sources: [...new Set(sources)],
  };
}

function toUnavailable(error: unknown): AssistantUnavailable {
  if (error instanceof Anthropic.APIUserAbortError) return new AssistantUnavailable("Demande interrompue.", 499);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    console.error("[assistant] identifiants refusés par le fournisseur IA");
    return new AssistantUnavailable("Le fournisseur IA a refusé la clé configurée sur ce serveur. L'aide hors ligne reste disponible.", 503);
  }
  if (error instanceof Anthropic.RateLimitError) {
    const retry = Number(error.headers?.get("retry-after"));
    return new AssistantUnavailable("Le service IA est très sollicité. Réessayez dans un instant.", 429, Number.isFinite(retry) ? retry : 30);
  }
  if (error instanceof Anthropic.APIConnectionError) return new AssistantUnavailable("Le service IA est injoignable depuis ce serveur (connexion réseau).", 503);
  if (error instanceof Anthropic.BadRequestError) {
    console.error("[assistant] requête refusée par le fournisseur :", error.message);
    return new AssistantUnavailable("Le service IA n'a pas pu traiter cette demande.", 502);
  }
  if (error instanceof Anthropic.APIError) {
    console.error("[assistant] erreur du fournisseur", error.status);
    return new AssistantUnavailable("Le service IA rencontre une erreur temporaire. Réessayez plus tard.", 503);
  }
  console.error("[assistant] erreur inattendue", error instanceof Error ? error.message : error);
  return new AssistantUnavailable("Erreur interne de l'assistant.", 500);
}
