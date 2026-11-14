/** Boucle Gemini avec un client simule : memes outils, memes validations que pour Claude. */

import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { beforeEach, describe, expect, it } from "vitest";

import type { AssistantContext } from "../assistant/protocol";
import type { AiConfig } from "./config";
import { GEMINI_FUNCTIONS, resetGeminiCooldown, type GenerateContent } from "./gemini";
import { runAssistant } from "./service";

const config: AiConfig = {
  enabled: true,
  reason: null,
  provider: "gemini",
  model: "gemini-3.8-flash",
  fallbackModels: [],
  requestTimeoutMs: 25_000,
  effort: "low",
  maxTokens: 8000,
  maxToolRounds: 6,
  rateLimit: 30,
  rateWindowMs: 60_000,
  dailyLimit: 1000,
};
const ctx: AssistantContext = { page: "map", zone: { kind: "country" }, from: "2025-01-01", to: "2025-12-31" };

type Parts = NonNullable<NonNullable<GenerateContentResponse["candidates"]>[number]["content"]>["parts"];
const reply = (parts: Parts, finishReason = "STOP") => ({ candidates: [{ content: { role: "model", parts }, finishReason }] }) as unknown as GenerateContentResponse;

function scripted(responses: GenerateContentResponse[]) {
  const requests: GenerateContentParameters[] = [];
  const generate: GenerateContent = async (params) => {
    requests.push(structuredClone({ ...params, config: { ...params.config, abortSignal: undefined } }));
    const next = responses.shift();
    if (!next) throw new Error("plus de reponse scriptee");
    return next;
  };
  return { generate, requests };
}

describe("fournisseur Gemini", () => {
  it("declare les memes outils, avec leurs schemas JSON", () => {
    expect(GEMINI_FUNCTIONS.map((f) => f.name)).toContain("set_period");
    expect(GEMINI_FUNCTIONS.find((f) => f.name === "set_period")!.parametersJsonSchema).toMatchObject({ required: ["from", "to"] });
  });

  it("execute les appels de fonctions et renvoie le tour du modele intact", async () => {
    const { generate, requests } = scripted([
      reply([{ functionCall: { id: "c1", name: "set_period", args: { from: "2024-06-01", to: "2024-09-30" } }, thoughtSignature: "sig-1" }, { functionCall: { id: "c2", name: "get_activity_summary", args: {} } }]),
      reply([{ text: "Voici la saison sèche 2024." }]),
    ]);
    const out = await runAssistant([{ role: "user", text: "Saison sèche 2024 ?" }], ctx, { config, generateContent: generate });
    expect(out.actions).toEqual([{ type: "set_period", from: "2024-06-01", to: "2024-09-30" }]);
    expect(out.text).toBe("Voici la saison sèche 2024.");
    // Contexte dans les instructions systeme, page carte transmise.
    expect(String(requests[0].config?.systemInstruction)).toContain("page ouverte : map");
    const second = requests[1].contents as { role: string; parts: Record<string, unknown>[] }[];
    // Signature de reflexion conservee, reponses de fonctions regroupees, lecture faite sur la nouvelle periode.
    expect(second[1]).toMatchObject({ role: "model", parts: [{ thoughtSignature: "sig-1" }, {}] });
    const responses = second[2].parts.map((p) => p.functionResponse as { id: string; response: { output: string } });
    expect(responses.map((r) => r.id)).toEqual(["c1", "c2"]);
    expect(JSON.parse(responses[1].response.output).periode).toMatchObject({ du: "2024-06-01", au: "2024-09-30" });
    expect(String(requests[1].config?.systemInstruction)).toContain("du 2024-06-01 au 2024-09-30");
  });

  it("renvoie une erreur de fonction au modele sans action, et ignore le texte de reflexion", async () => {
    const { generate, requests } = scripted([
      reply([{ functionCall: { name: "set_zone", args: { zone: "Lagos" } } }]),
      reply([{ text: "raisonnement interne", thought: true }, { text: "Je ne connais pas cette zone." }]),
    ]);
    const out = await runAssistant([{ role: "user", text: "Montre Lagos" }], ctx, { config, generateContent: generate });
    expect(out.actions).toEqual([]);
    expect(out.text).toBe("Je ne connais pas cette zone.");
    const parts = (requests[1].contents as { parts: { functionResponse?: { response: { error?: string } } }[] }[])[2].parts;
    expect(parts[0].functionResponse?.response.error).toContain("zone inconnue");
  });

  it("traite un blocage de securite comme un refus", async () => {
    const { generate } = scripted([reply([], "SAFETY")]);
    const out = await runAssistant([{ role: "user", text: "x" }], ctx, { config, generateContent: generate });
    expect(out.text).toContain("Je ne peux pas");
  });
});

describe("modele de secours Gemini", () => {
  beforeEach(() => resetGeminiCooldown());

  it("met de cote un modele surcharge pour les questions suivantes", async () => {
    const { ApiError } = await import("@google/genai");
    const used: string[] = [];
    const generate: GenerateContent = async (params) => {
      used.push(params.model);
      if (params.model === "gemini-3.8-flash") throw new ApiError({ message: "high demand", status: 503 });
      return reply([{ text: "ok" }]);
    };
    const cfg = { ...config, fallbackModels: ["gemini-3.5-flash"] };
    await runAssistant([{ role: "user", text: "a" }], ctx, { config: cfg, generateContent: generate });
    await runAssistant([{ role: "user", text: "b" }], ctx, { config: cfg, generateContent: generate });
    expect(used).toEqual(["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash"]);
  });

  it("rejoue tout le tour avec le modele de secours si le principal echoue en cours de route", async () => {
    const { ApiError } = await import("@google/genai");
    const used: string[] = [];
    let primaryCalls = 0;
    const generate: GenerateContent = async (params) => {
      used.push(params.model);
      if (params.model === "gemini-3.8-flash") {
        if (primaryCalls++ === 0) return reply([{ functionCall: { id: "p1", name: "set_zone", args: { zone: "Nyanga" } } }]);
        throw new ApiError({ message: "deadline", status: 504 });
      }
      if (used.filter((m) => m === "gemini-3.5-flash").length === 1) return reply([{ functionCall: { id: "s1", name: "set_zone", args: { zone: "Nyanga" } } }]);
      return reply([{ text: "Zone Nyanga sélectionnée." }]);
    };
    const out = await runAssistant([{ role: "user", text: "Montre Nyanga" }], ctx, { config: { ...config, fallbackModels: ["gemini-3.5-flash"] }, generateContent: generate });
    expect(used).toEqual(["gemini-3.8-flash", "gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash"]);
    // Une seule action : celle du passage reussi, pas de doublon venant du passage abandonne.
    expect(out.actions).toHaveLength(1);
    expect(out).toMatchObject({ model: "gemini-3.5-flash", fallback: true, text: "Zone Nyanga sélectionnée." });
  });

  it("passe au modele de secours si le principal est surcharge, et le signale", async () => {
    const { ApiError } = await import("@google/genai");
    const used: string[] = [];
    const generate: GenerateContent = async (params) => {
      used.push(params.model);
      if (params.model === "gemini-3.8-flash") throw new ApiError({ message: "high demand", status: 503 });
      return reply([{ text: "Réponse du modèle de secours." }]);
    };
    const out = await runAssistant([{ role: "user", text: "Bonjour" }], ctx, { config: { ...config, fallbackModels: ["gemini-3.5-flash"] }, generateContent: generate });
    expect(used).toEqual(["gemini-3.8-flash", "gemini-3.5-flash"]);
    expect(out).toMatchObject({ text: "Réponse du modèle de secours.", model: "gemini-3.5-flash", fallback: true });
  });

  it("ne change pas de modele pour une cle refusee, et ne masque pas l'echec", async () => {
    const { ApiError } = await import("@google/genai");
    const generate: GenerateContent = async () => {
      throw new ApiError({ message: "API key not valid", status: 400 });
    };
    await expect(
      runAssistant([{ role: "user", text: "x" }], ctx, { config: { ...config, fallbackModels: ["gemini-3.5-flash"] }, generateContent: generate }),
    ).rejects.toMatchObject({ status: 503, message: expect.stringContaining("refusé la clé") });
  });
});
