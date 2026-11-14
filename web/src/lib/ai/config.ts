/**
 * Configuration du fournisseur IA, lue cote serveur uniquement.
 * Aucune cle n'est jamais envoyee au navigateur.
 *
 * Variables d'environnement (web/.env.local) :
 *   ANTHROPIC_API_KEY       cle de l'API Claude (ou ANTHROPIC_AUTH_TOKEN)
 *   HOTSPOT_AI_MODEL        modele (defaut : claude-opus-5-5)
 *   HOTSPOT_AI_EFFORT       low | medium | high (defaut : low, adapte au dialogue)
 *   HOTSPOT_AI_DISABLED     "1" pour couper l'assistant sans retirer la cle
 *   HOTSPOT_AI_RATE_LIMIT   requetes par fenetre de 10 minutes et par visiteur (defaut : 30)
 *   HOTSPOT_AI_DAILY_LIMIT  requetes par jour pour tout le serveur, garde-fou de cout (defaut : 1000)
 */

export const AI_DEFAULT_MODEL = "claude-opus-5-5";

export interface AiConfig {
  enabled: boolean;
  reason: string | null;
  model: string;
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

export function aiConfig(): AiConfig {
  const hasCredential = Boolean(process.env.ANTHROPIC_API_KEY?.trim() || process.env.ANTHROPIC_AUTH_TOKEN?.trim());
  const disabled = process.env.HOTSPOT_AI_DISABLED === "1";
  const effort = process.env.HOTSPOT_AI_EFFORT;
  return {
    enabled: hasCredential && !disabled,
    reason: disabled
      ? "L'assistant IA a été désactivé par l'administrateur de cette installation."
      : hasCredential
        ? null
        : "Aucun fournisseur IA n'est configuré sur ce serveur (clé ANTHROPIC_API_KEY absente).",
    model: process.env.HOTSPOT_AI_MODEL?.trim() || AI_DEFAULT_MODEL,
    effort: effort === "medium" || effort === "high" ? effort : "low",
    maxTokens: 8000,
    maxToolRounds: 6,
    rateLimit: intFromEnv("HOTSPOT_AI_RATE_LIMIT", 30),
    rateWindowMs: 10 * 60 * 1000,
    dailyLimit: intFromEnv("HOTSPOT_AI_DAILY_LIMIT", 1000),
  };
}
