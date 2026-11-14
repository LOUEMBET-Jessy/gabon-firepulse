/** Conversation vocale : transcription serveur, consignes orales, texte prononcable. */

import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { beforeEach, describe, expect, it } from "vitest";

import { toSpeech } from "../voice/speak";
import type { AiConfig } from "./config";
import { resetGeminiCooldown, type GenerateContent } from "./gemini";
import { VOICE_PROMPT } from "./prompt";
import { runAssistant } from "./service";
import { baseAudioType, transcribe } from "./transcribe";

const config: AiConfig = {
  enabled: true,
  reason: null,
  provider: "gemini",
  model: "gemini-3.8-flash",
  fallbackModels: ["gemini-3.5-flash"],
  requestTimeoutMs: 25_000,
  effort: "low",
  maxTokens: 8000,
  maxToolRounds: 6,
  rateLimit: 30,
  rateWindowMs: 60_000,
  dailyLimit: 1000,
};
const text = (t: string) => ({ candidates: [{ content: { role: "model", parts: [{ text: t }] }, finishReason: "STOP" }] }) as unknown as GenerateContentResponse;

beforeEach(() => resetGeminiCooldown());

describe("transcription serveur", () => {
  it("envoie l'audio en ligne et renvoie le texte reconnu", async () => {
    const seen: GenerateContentParameters[] = [];
    const generate: GenerateContent = async (p) => (seen.push(p), text("« Montre la Nyanga en 2024. »"));
    const out = await transcribe(new Uint8Array([1, 2, 3]), "audio/webm", config, { generate });
    expect(out).toEqual({ text: "Montre la Nyanga en 2024.", model: "gemini-3.8-flash" });
    const parts = (seen[0].contents as { parts: { inlineData?: { mimeType: string; data: string } }[] }[])[0].parts;
    expect(parts[0].inlineData).toEqual({ mimeType: "audio/webm", data: "AQID" });
  });

  it("renvoie une chaine vide quand rien n'est intelligible, et passe au secours en cas de surcharge", async () => {
    const { ApiError } = await import("@google/genai");
    const generate: GenerateContent = async (p) => {
      if (p.model === "gemini-3.8-flash") throw new ApiError({ message: "busy", status: 503 });
      return text("[silence]");
    };
    expect(await transcribe(new Uint8Array([1]), "audio/ogg", config, { generate })).toEqual({ text: "", model: "gemini-3.5-flash" });
  });

  it("n'accepte que des formats audio", () => {
    expect(baseAudioType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseAudioType("application/json")).toBeNull();
    expect(baseAudioType(null)).toBeNull();
  });
});

describe("reponses orales", () => {
  it("ajoute les consignes orales aux instructions en mode vocal seulement", async () => {
    const systems: string[] = [];
    const generate: GenerateContent = async (p) => (systems.push(String(p.config?.systemInstruction)), text("ok"));
    const ctx = { page: "dashboard" as const, zone: { kind: "country" as const }, from: "2025-01-01", to: "2025-12-31" };
    await runAssistant([{ role: "user", text: "a" }], ctx, { config, generateContent: generate, voice: true });
    await runAssistant([{ role: "user", text: "b" }], ctx, { config, generateContent: generate });
    expect(systems[0]).toContain(VOICE_PROMPT);
    expect(systems[1]).not.toContain("Conversation vocale");
  });

  it("rend le texte prononcable : sans mise en forme ni symboles", () => {
    expect(toSpeech("**Observé** : 3 978 cellules-jour, soit +12 %.\n\n- Fiabilité `élevée`\n- Zone de 33 900 km²")).toBe(
      "Observé : 3 978 cellules-jour, soit +12 pour cent. Fiabilité élevée. Zone de 33 900 kilomètres carrés",
    );
  });
});
