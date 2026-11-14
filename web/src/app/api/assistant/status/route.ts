import { connection } from "next/server";

import { aiConfig } from "@/lib/ai/config";
import type { AssistantStatus } from "@/lib/assistant/protocol";

/** GET /api/assistant/status : l'assistant IA est-il configure sur ce serveur ? Ne revele aucune cle. */
export async function GET() {
  await connection();
  const config = aiConfig();
  const status: AssistantStatus = { available: config.enabled, reason: config.reason, model: config.enabled ? config.model : null, provider: config.enabled ? config.provider : null, transcription: config.enabled && config.provider === "gemini" };
  return Response.json(status, { headers: { "Cache-Control": "no-store" } });
}
