import os from "node:os";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

process.env.HOTSPOT_LIVE_CACHE = path.join(os.tmpdir(), `hotspot-live-test-${process.pid}`);
delete process.env.FIRMS_MAP_KEY;

type Live = typeof import("./live");
let live: Live;
beforeAll(async () => {
  live = await import("./live");
});

const VIIRS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight";
const MODIS_HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight";
const today = new Date().toISOString().slice(0, 10);
// Franceville (Gabon, Haut-Ogooue), Paris, un point en mer au large du Gabon, un point a Yaounde (hors territoires).
const viirsCsv = [
  VIIRS_HEADER,
  `-1.6333,13.5836,330.1,0.4,0.4,${today},0130,N20,nominal,2.0NRT,290.1,3.2,N`,
  `48.8566,2.3522,320.5,0.4,0.4,${today},1250,N20,high,2.0NRT,288.0,5.5,D`,
  `-2.5,8.6,310.0,0.4,0.4,${today},1250,N20,low,2.0NRT,280.0,1.0,D`,
  `3.848,11.502,330.0,0.4,0.4,${today},1250,N20,nominal,2.0NRT,280.0,1.0,D`,
].join("\n");
const modisCsv = [MODIS_HEADER, `-1.6333,13.5836,320.1,1.0,1.0,${today},0945,A,85,6.1NRT,290.1,12.4,D`].join("\n");

function fakeFirms() {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  let mode: "ok" | "notModified" | "down" = "ok";
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> });
    if (mode === "down") throw new TypeError("fetch failed");
    if (mode === "notModified") return new Response(null, { status: 304 });
    const body = url.includes("modis") ? modisCsv : url.includes("suomi-npp") ? VIIRS_HEADER : viirsCsv;
    return new Response(body, { status: 200, headers: { "last-modified": "Sun, 15 Nov 2026 04:42:20 GMT", etag: '"abc"' } });
  }) as typeof fetch;
  return { fetcher, calls, set: (m: typeof mode) => (mode = m) };
}

describe("observatoire temps reel (NASA FIRMS NRT)", () => {
  it("ne garde que les detections des territoires et les rattache a leurs subdivisions", () => {
    const feed = { key: "noaa20", sensor: "VIIRS", label: "", product: "", dir: "", prefix: "", apiSource: "" } as const;
    const gab = live.parseFirmsCsv(viirsCsv, feed, "GAB");
    expect(gab).toHaveLength(1);
    expect(gab[0]).toMatchObject({ satellite: "noaa20", sensor: "VIIRS", level1: "Haut-Ogooué", confidence: "nominal", daynight: "N" });
    expect(gab[0].acquired).toBe(`${today}T01:30:00Z`);
    const fra = live.parseFirmsCsv(viirsCsv, feed, "FRA");
    expect(fra).toHaveLength(1);
    expect(fra[0]).toMatchObject({ level1: "Île-de-France", level2: "Paris", confidence: "high" });
  });

  it("lit la confiance MODIS en pourcentage et distingue Terra d'Aqua", () => {
    const feed = { key: "modis", sensor: "MODIS", label: "", product: "", dir: "", prefix: "", apiSource: "" } as const;
    const [d] = live.parseFirmsCsv(modisCsv, feed, "GAB");
    expect(d).toMatchObject({ satellite: "aqua", confidenceNative: "85 %", confidence: "high", frp: 12.4 });
  });

  it("interroge la NASA au plus toutes les 10 minutes, puis par requete conditionnelle", async () => {
    const firms = fakeFirms();
    const first = await live.liveSnapshot({ fetcher: firms.fetcher });
    expect(firms.calls).toHaveLength(8); // 4 capteurs x 2 territoires
    expect(first.detections.filter((d) => d.territory === "GAB")).toHaveLength(3); // MODIS, NOAA-20, NOAA-21
    expect(first.feeds.find((f) => f.feed === "snpp")?.status).toBe("empty");

    await live.liveSnapshot({ fetcher: firms.fetcher });
    await live.liveSnapshot({ fetcher: firms.fetcher, force: true });
    expect(firms.calls).toHaveLength(8); // ni l'appel suivant ni une actualisation forcee immediate

    firms.set("notModified");
    const later = await live.liveSnapshot({ fetcher: firms.fetcher, now: Date.now() + 11 * 60_000 });
    expect(firms.calls).toHaveLength(16);
    expect(firms.calls[8].headers["If-Modified-Since"]).toBe("Sun, 15 Nov 2026 04:42:20 GMT");
    expect(later.detections).toHaveLength(first.detections.length);
  });

  it("sert la derniere copie, marquee ancienne, quand la NASA est injoignable", async () => {
    const firms = fakeFirms();
    firms.set("down");
    const snapshot = await live.liveSnapshot({ fetcher: firms.fetcher, now: Date.now() + 30 * 60_000 });
    const noaa20 = snapshot.feeds.find((f) => f.feed === "noaa20" && f.territory === "GAB")!;
    expect(noaa20.status).toBe("stale");
    expect(noaa20.error).toBeTruthy();
    expect(snapshot.detections.length).toBeGreaterThan(0);
  });
});
