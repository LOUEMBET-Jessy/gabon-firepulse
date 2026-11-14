/**
 * Limitation des requetes de l'assistant, en memoire du processus.
 * Deux garde-fous : par visiteur (fenetre glissante) et global par jour (maitrise des couts).
 * Le visiteur est identifie par une empreinte de son adresse : l'adresse elle-meme n'est pas conservee.
 */

import { createHash } from "node:crypto";

const visitors = new Map<string, number[]>();
let day = "";
let dayCount = 0;

export function visitorKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "local";
  return createHash("sha256").update(address).digest("hex").slice(0, 16);
}

export type RateDecision = { ok: true } | { ok: false; reason: "visitor" | "daily"; retryAfterSeconds: number };

export function checkRate(key: string, limit: number, windowMs: number, dailyLimit: number, now = Date.now()): RateDecision {
  const today = new Date(now).toISOString().slice(0, 10);
  if (today !== day) {
    day = today;
    dayCount = 0;
  }
  if (dayCount >= dailyLimit) {
    const midnight = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1);
    return { ok: false, reason: "daily", retryAfterSeconds: Math.ceil((midnight - now) / 1000) };
  }
  const recent = (visitors.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    visitors.set(key, recent);
    return { ok: false, reason: "visitor", retryAfterSeconds: Math.ceil((windowMs - (now - recent[0])) / 1000) };
  }
  recent.push(now);
  visitors.set(key, recent);
  dayCount++;
  // Nettoyage occasionnel des visiteurs inactifs.
  if (visitors.size > 5000) for (const [k, times] of visitors) if (!times.some((t) => now - t < windowMs)) visitors.delete(k);
  return { ok: true };
}

/** Reinitialisation, pour les tests. */
export function resetRateLimits() {
  visitors.clear();
  day = "";
  dayCount = 0;
}
