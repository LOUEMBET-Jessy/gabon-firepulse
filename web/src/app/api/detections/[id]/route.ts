import { detectionDetail } from "@/lib/server/queries";
import { getStore } from "@/lib/server/store";

/** Fiche complete d'une detection, avec le renvoi a sa ligne source. */
export async function GET(_request: Request, ctx: RouteContext<"/api/detections/[id]">) {
  const { id } = await ctx.params;
  try {
    const detail = /^\d+$/.test(id) ? detectionDetail(Number(id), getStore()) : null;
    if (!detail) return Response.json({ error: "Détection introuvable." }, { status: 404 });
    return Response.json(detail, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api]", error);
    return Response.json({ error: "Erreur interne lors de la lecture des données." }, { status: 500 });
  }
}
