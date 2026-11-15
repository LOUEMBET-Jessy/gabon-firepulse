import { aiConfig } from "@/lib/ai/config";
import { checkRate, visitorKey } from "@/lib/ai/rate-limit";
import { AssistantUnavailable, runAssistant, sanitizeHistory } from "@/lib/ai/service";
import { validateContext } from "@/lib/ai/tools";

/**
 * POST /api/assistant : un tour de conversation avec Hot-Spots AI.
 * Corps : { messages: [{ role, text }], context: { page, zone, from, to, ... } }.
 * Reponse : { text, actions, sources }. Les actions sont appliquees par le navigateur.
 * Rien n'est journalise du contenu des messages.
 */
export async function POST(request: Request) {
  const config = aiConfig();
  if (!config.enabled) return Response.json({ error: config.reason, unavailable: true }, { status: 503 });

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 64_000) return Response.json({ error: "Requête trop volumineuse." }, { status: 413 });

  const rate = checkRate(visitorKey(request), config.rateLimit, config.rateWindowMs, config.dailyLimit);
  if (!rate.ok) {
    const message =
      rate.reason === "daily"
        ? "Le quota quotidien de l'assistant est atteint sur ce serveur. L'aide hors ligne reste disponible."
        : "Vous avez envoyé beaucoup de messages en peu de temps. Patientez quelques minutes.";
    return Response.json({ error: message }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Corps de requête invalide." }, { status: 400 });
  }
  const { messages, context, mode } = (body ?? {}) as { messages?: unknown; context?: unknown; mode?: unknown };
  const history = sanitizeHistory(messages);
  if (!history.length) return Response.json({ error: "Message vide." }, { status: 400 });

  try {
    const reply = await runAssistant(history, validateContext(context), { config, signal: request.signal, voice: mode === "voice" });
    return Response.json(reply, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AssistantUnavailable) {
      return Response.json(
        { error: error.message, unavailable: error.status === 503 },
        { status: error.status, headers: error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : undefined },
      );
    }
    console.error("[assistant] erreur", error instanceof Error ? error.message : error);
    return Response.json({ error: "Erreur interne de l'assistant." }, { status: 500 });
  }
}
