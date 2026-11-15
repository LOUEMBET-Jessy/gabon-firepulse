import { aiConfig } from "@/lib/ai/config";
import { quickReply } from "@/lib/ai/quick";
import { checkRate, visitorKey } from "@/lib/ai/rate-limit";
import { AssistantUnavailable, runAssistant, sanitizeHistory } from "@/lib/ai/service";
import { runAssistantStream, type StreamEvent } from "@/lib/ai/stream";
import { validateContext } from "@/lib/ai/tools";

/**
 * POST /api/assistant : un tour de conversation avec Hot-Spots AI.
 * Corps : { messages: [{ role, text }], context: { page, zone, from, to, ... }, mode? }.
 *
 * Avec « Accept: text/event-stream » : reponse en flux (evenements status, delta, done, error),
 * le premier mot s'affiche des que le modele l'ecrit. Sinon : { text, actions, sources } en une fois.
 * Les actions sont appliquees par le navigateur. Rien n'est journalise du contenu des messages.
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
  const ctx = validateContext(context);
  const voice = mode === "voice";

  if ((request.headers.get("accept") ?? "").includes("text/event-stream")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let open = true;
        const emit = (event: StreamEvent) => {
          if (!open) return;
          const { type, ...data } = event;
          try {
            controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            open = false; // navigateur parti
          }
        };
        try {
          await runAssistantStream(history, ctx, { config, emit, signal: request.signal, voice });
        } catch (error) {
          console.error("[assistant] erreur", error instanceof Error ? error.message : error);
          emit({ type: "error", error: "Erreur interne de l'assistant.", status: 500 });
        } finally {
          open = false;
          try {
            controller.close();
          } catch {
            /* deja ferme */
          }
        }
      },
    });
    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" },
    });
  }

  try {
    const local = quickReply(history[history.length - 1].text, ctx);
    if (local) return Response.json(local, { headers: { "Cache-Control": "no-store" } });
    const reply = await runAssistant(history, ctx, { config, signal: request.signal, voice });
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
