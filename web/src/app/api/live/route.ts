import { LIVE_SATELLITES, LIVE_TERRITORIES, liveSnapshot, type LiveSatellite, type LiveTerritory } from "@/lib/server/live";

function bad(message: string) {
  return Response.json({ error: message }, { status: 400 });
}

/**
 * Dernieres detections FIRMS (temps quasi reel) pour le Gabon et la France.
 * Parametres : territories=GAB,FRA ; days=1 a 7 (10 avec une cle FIRMS) ; sats=terra,aqua,snpp,noaa20,noaa21 ; refresh=1.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const territories = (params.get("territories") ?? "GAB,FRA").split(",").filter(Boolean) as LiveTerritory[];
  if (!territories.length || territories.some((t) => !LIVE_TERRITORIES.includes(t))) return bad("Territoire inconnu : GAB ou FRA attendus.");
  const sats = (params.get("sats") ?? LIVE_SATELLITES.join(",")).split(",").filter(Boolean) as LiveSatellite[];
  if (sats.some((s) => !LIVE_SATELLITES.includes(s))) return bad("Satellite inconnu.");
  const days = Number(params.get("days") ?? "1");
  try {
    const snapshot = await liveSnapshot({ force: params.get("refresh") === "1" });
    if (!Number.isInteger(days) || days < 1 || days > snapshot.maxDays) return bad(`Période invalide : 1 à ${snapshot.maxDays} jours.`);
    const now = Date.now();
    const since = new Date(now - days * 86_400_000).toISOString();
    const detections = snapshot.detections
      .filter((d) => territories.includes(d.territory) && sats.includes(d.satellite) && d.acquired >= since)
      .sort((a, b) => (a.acquired < b.acquired ? 1 : -1));
    const count = <K extends string>(key: (d: (typeof detections)[number]) => K | null) => {
      const out: Record<string, number> = {};
      for (const d of detections) {
        const k = key(d);
        if (k !== null) out[k] = (out[k] ?? 0) + 1;
      }
      return out;
    };
    return Response.json(
      {
        generatedAt: new Date(now).toISOString(),
        mode: snapshot.mode,
        maxDays: snapshot.maxDays,
        since,
        territories,
        days,
        feeds: snapshot.feeds.filter((f) => territories.includes(f.territory)),
        detections,
        counts: {
          total: detections.length,
          byTerritory: count((d) => d.territory),
          bySatellite: count((d) => d.satellite),
          byLevel1: count((d) => (d.level1 ? `${d.territory}:${d.level1}` : null)),
          byLevel2: count((d) => (d.level2 ? `${d.territory}:${d.level2}` : null)),
        },
        notice:
          "Détections satellitaires en temps quasi réel (NASA FIRMS, produits NRT) : non harmonisées, susceptibles d'être révisées par la NASA, et jamais des incendies confirmés.",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Erreur du service temps réel." }, { status: 502 });
  }
}
