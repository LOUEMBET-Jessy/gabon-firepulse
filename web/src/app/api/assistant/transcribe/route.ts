import { aiConfig } from "@/lib/ai/config";
import { AssistantUnavailable } from "@/lib/ai/errors";
import { checkRate, visitorKey } from "@/lib/ai/rate-limit";
import { MAX_AUDIO_BYTES, baseAudioType, transcribe } from "@/lib/ai/transcribe";

/**
 * POST /api/assistant/transcribe : transcrit un court enregistrement vocal (corps = audio brut).
 * Sert aux navigateurs qui n'ont pas de dictee integree. Disponible avec le fournisseur Gemini.
 * L'audio n'est ni stocke ni journalise.
 */
export async function POST(request: Request) {
  const config = aiConfig();
  if (!config.enabled || config.provider !== "gemini") {
    return Response.json({ error: "La transcription vocale côté serveur n'est pas disponible sur cette installation." }, { status: 503 });
  }
  const mimeType = baseAudioType(request.headers.get("content-type"));
  if (!mimeType) return Response.json({ error: "Format audio non pris en charge." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_AUDIO_BYTES) return Response.json({ error: "Enregistrement trop long." }, { status: 413 });

  const rate = checkRate(visitorKey(request), config.rateLimit, config.rateWindowMs, config.dailyLimit);
  if (!rate.ok) return Response.json({ error: "Trop de demandes en peu de temps. Patientez quelques minutes." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

  const audio = new Uint8Array(await request.arrayBuffer());
  if (audio.byteLength === 0) return Response.json({ error: "Enregistrement vide." }, { status: 400 });
  if (audio.byteLength > MAX_AUDIO_BYTES) return Response.json({ error: "Enregistrement trop long." }, { status: 413 });

  try {
    const result = await transcribe(audio, mimeType, config, { signal: request.signal });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AssistantUnavailable) return Response.json({ error: error.message }, { status: error.status });
    console.error("[assistant] transcription en erreur", error instanceof Error ? error.message : error);
    return Response.json({ error: "La transcription a échoué." }, { status: 500 });
  }
}
