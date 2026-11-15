import { imageryFor } from "@/lib/server/imagery";

/**
 * GET /api/imagery?date=AAAA-MM-JJ : couche d'imagerie NASA GIBS en couleurs vraies a afficher pour ce jour
 * (fond de carte « Image du jour »). Ne touche a aucune donnee de detection.
 */
export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Paramètre date attendu (AAAA-MM-JJ)." }, { status: 400 });
  const choice = await imageryFor(date);
  return Response.json(choice, { headers: { "Cache-Control": "public, max-age=3600" } });
}
