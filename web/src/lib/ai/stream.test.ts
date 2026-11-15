import type { GenerateContentParameters, GenerateContentResponse } from "@google/genai";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { AssistantContext } from "../assistant/protocol";
import type { AiConfig } from "./config";
import { quickReply } from "./quick";
import { STREAM, breakerOpen, resetStreamBreaker, runAssistantStream, type GenerateStream, type StreamEvent } from "./stream";

const config: AiConfig = {
  enabled: true,
  reason: null,
  provider: "gemini",
  model: "principal",
  fallbackModels: ["secours"],
  requestTimeoutMs: 2000,
  effort: "low",
  maxTokens: 600,
  maxToolRounds: 4,
  rateLimit: 30,
  rateWindowMs: 600_000,
  dailyLimit: 1000,
};
const context: AssistantContext = { page: "dashboard", country: "GAB", zone: { kind: "country" }, from: "2025-01-01", to: "2025-12-31" };
const ask = (text: string) => [{ role: "user" as const, text }];

const chunk = (parts: object[], finishReason?: string) => ({ candidates: [{ content: { role: "model", parts }, finishReason }] }) as unknown as GenerateContentResponse;

/** Modele simule : une suite de tours (chaque tour = une liste de fragments) ; « lent » n'envoie jamais rien. */
function fakeModel(script: Record<string, (GenerateContentResponse[] | "lent")[]>) {
  const calls: string[] = [];
  const generate: GenerateStream = async (params: GenerateContentParameters) => {
    calls.push(params.model);
    const turn = script[params.model]?.shift();
    const signal = params.config?.abortSignal;
    if (turn === "lent" || turn === undefined) {
      await new Promise((_, reject) => signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
    }
    return (async function* () {
      for (const c of turn as GenerateContentResponse[]) yield c;
    })();
  };
  return { generate, calls };
}

async function collect(question: string, generate: GenerateStream) {
  const events: StreamEvent[] = [];
  await runAssistantStream(ask(question), context, { config, emit: (e) => events.push(e), generate });
  return events;
}

describe("assistant en flux", () => {
  const saved = { ...STREAM };
  beforeEach(() => {
    resetStreamBreaker();
    STREAM.primaryFirstChunkMs = 60;
    STREAM.fallbackFirstChunkMs = 500;
  });
  afterEach(() => Object.assign(STREAM, saved));

  it("repond localement aux salutations, sans appeler le modele", async () => {
    const { generate, calls } = fakeModel({});
    const events = await collect("Bonjour !", generate);
    expect(calls).toEqual([]);
    expect(events[0]).toMatchObject({ type: "delta" });
    expect(events.at(-1)).toMatchObject({ type: "done", model: "local" });
    expect(quickReply("Combien de détections au Gabon en 2025 ?", context)).toBeNull();
  });

  it("transmet le texte fragment par fragment, dans l'ordre", async () => {
    const { generate } = fakeModel({ principal: [[chunk([{ text: "En 2025, " }]), chunk([{ text: "3 978 cellules-jour." }], "STOP")]] });
    const events = await collect("Résume l'activité", generate);
    const text = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text).join("");
    expect(text).toBe("En 2025, 3 978 cellules-jour.");
    // Chiffres tires du resume fourni au modele : la source est citee.
    expect(events.at(-1)).toMatchObject({ type: "done", model: "principal", fallback: false });
    expect((events.at(-1) as { sources: string[] }).sources[0]).toMatch(/^Synthèse Gabon/);
  });

  it("bascule sur le secours si le premier fragment tarde, sans nouvelle tentative du principal", async () => {
    const { generate, calls } = fakeModel({ principal: ["lent"], secours: [[chunk([{ text: "Réponse du secours." }], "STOP")]] });
    const events = await collect("Résume l'activité", generate);
    expect(calls).toEqual(["principal", "secours"]);
    expect(events.at(-1)).toMatchObject({ type: "done", model: "secours", fallback: true });
  });

  it("ouvre le disjoncteur apres deux surcharges consecutives du principal", async () => {
    for (let i = 0; i < 2; i++) {
      const { generate } = fakeModel({ principal: ["lent"], secours: [[chunk([{ text: "ok" }], "STOP")]] });
      await collect("Résume l'activité", generate);
    }
    expect(breakerOpen()).toBe(true);
    const { generate, calls } = fakeModel({ secours: [[chunk([{ text: "direct" }], "STOP")]] });
    await collect("Résume l'activité", generate);
    expect(calls).toEqual(["secours"]);
  });

  it("execute un outil, annonce l'etape, puis repond", async () => {
    const { generate } = fakeModel({
      principal: [
        [chunk([{ functionCall: { id: "1", name: "get_history", args: {} } }], "STOP")],
        [chunk([{ text: "Voici l'historique." }], "STOP")],
      ],
    });
    const events = await collect("Raconte l'historique", generate);
    expect(events.some((e) => e.type === "status" && /historique/.test(e.text))).toBe(true);
    const done = events.at(-1) as { type: string; sources: string[] };
    expect(done.type).toBe("done");
    expect(done.sources.some((s) => s.startsWith("Historique"))).toBe(true);
  });

  it("signale une erreur expliquee si aucun modele ne repond", async () => {
    const { generate } = fakeModel({ principal: ["lent"], secours: ["lent"] });
    const events = await collect("Résume l'activité", generate);
    expect(events.at(-1)).toMatchObject({ type: "error", status: 503 });
  }, 10_000);
});
