import { handle, parsePeriod } from "@/lib/server/http";
import { queryGrid } from "@/lib/server/queries";
import { parseZone } from "@/lib/server/zone";

/** Agregats par cellule de la grille commune : jours actifs harmonises et detections par capteur. */
export function GET(request: Request) {
  return handle(request, (params, store) => {
    const { first, last } = parsePeriod(params, store);
    return queryGrid(parseZone(params.get("zone"), store), first, last, store);
  });
}
