/**
 * Configuration du fournisseur IA, lue cote serveur uniquement.
 * Aucune cle n'est jamais envoyee au navigateur.
 *
 * Deux fournisseurs possibles (web/.env.local) :
 *   Google Gemini   : GEMINI_API_KEY, GEMINI_MODEL (defaut : gemini-3.8-flash),
 *                     GEMINI_FALLBACK_MODELS modeles de secours separes par des virgules (defaut : gemini-3.5-flash, gemini-3.1-flash-lite),
 *                     utilises si le modele principal est surcharge ou ne repond pas dans le delai
 *   HOTSPOT_AI_TIMEOUT_MS  delai maximal d'un appel au fournisseur (defaut : 25000)
 *   Anthropic Claude: ANTHROPIC_API_KEY (ou ANTHROPIC_AUTH_TOKEN), HOTSPOT_AI_MODEL (defaut : claude-opus-5-5)
 *   HOTSPOT_AI_PROVIDER    "gemini" ou "anthropic" pour forcer le choix ; sinon, celui dont la cle est presente
 *                          (Gemini en premier si les deux le sont)
 *
 * Options communes :
 *   HOTSPOT_AI_EFFORT       low | medium | high (defaut : low, adapte au dialogue)
 *   HOTSPOT_AI_DISABLED     "1" pour couper l'assistant sans retirer la cle
 *   HOTSPOT_AI_RATE_LIMIT   requetes par fenetre de 10 minutes et par visiteur (defaut : 30)
 *   HOTSPOT_AI_DAILY_LIMIT  requetes par jour pour tout le serveur, garde-fou de cout (defaut : 1000)
 */

export const AI_DEFAULT_MODEL = "claude-opus-5-5";
export const GEMINI_DEFAULT_MODEL = "gemini-3.8-flash";
export const GEMINI_DEFAULT_FALLBACKS = ["gemini-3.5-flash", "gemini-3.1-flash-lite"];

export type AiProvider = "anthropic" | "gemini";

export interface AiConfig {
  enabled: boolean;
  reason: string | null;
  provider: AiProvider;
  model: string;
  /** Modeles de secours, essayes dans l'ordre si le modele principal est indisponible. */
  fallbackModels: string[];
  /** Delai maximal d'un appel au fournisseur, en millisecondes. */
  requestTimeoutMs: number;
  effort: "low" | "medium" | "high";
  maxTokens: number;
  maxToolRounds: number;
  rateLimit: number;
  rateWindowMs: number;
  dailyLimit: number;
}

function intFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

const env = (name: string) => process.env[name]?.trim() || "";

export function aiConfig(): AiConfig {
  const hasGemini = Boolean(env("GEMINI_API_KEY"));
  const hasAnthropic = Boolean(env("ANTHROPIC_API_KEY") || env("ANTHROPIC_AUTH_TOKEN"));
  const forced = env("HOTSPOT_AI_PROVIDER");
  const provider: AiProvider = forced === "anthropic" || forced === "gemini" ? forced : hasGemini || !hasAnthropic ? "gemini" : "anthropic";
  const hasCredential = provider === "gemini" ? hasGemini : hasAnthropic;
  const disabled = env("HOTSPOT_AI_DISABLED") === "1";
  const effort = env("HOTSPOT_AI_EFFORT");
  const missing = provider === "gemini" ? "clé GEMINI_API_KEY absente" : "clé ANTHROPIC_API_KEY absente";
  return {
    enabled: hasCredential && !disabled,
    reason: disabled
      ? "L'assistant IA a été désactivé par l'administrateur de cette installation."
      : hasCredential
        ? null
        : `Aucun fournisseur IA n'est configuré sur ce serveur (${missing}).`,
    provider,
    model: provider === "gemini" ? env("GEMINI_MODEL") || GEMINI_DEFAULT_MODEL : env("HOTSPOT_AI_MODEL") || AI_DEFAULT_MODEL,
    fallbackModels:
      provider === "gemini"
        ? (env("GEMINI_FALLBACK_MODELS") ? env("GEMINI_FALLBACK_MODELS").split(",").map((m) => m.trim()).filter(Boolean) : GEMINI_DEFAULT_FALLBACKS).filter(
            (m) => m !== (env("GEMINI_MODEL") || GEMINI_DEFAULT_MODEL),
          )
        : [],
    requestTimeoutMs: intFromEnv("HOTSPOT_AI_TIMEOUT_MS", 25_000),
    effort: effort === "medium" || effort === "high" ? effort : "low",
    maxTokens: 8000,
    maxToolRounds: 6,
    rateLimit: intFromEnv("HOTSPOT_AI_RATE_LIMIT", 30),
    rateWindowMs: 10 * 60 * 1000,
    dailyLimit: intFromEnv("HOTSPOT_AI_DAILY_LIMIT", 1000),
  };
}
