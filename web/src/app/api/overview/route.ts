import { handle, parsePeriod } from "@/lib/server/http";
import { overview } from "@/lib/server/queries";
import { parseZone } from "@/lib/server/zone";

/** Synthese d'une zone sur une periode : indice, detections par satellite, qualite, comparaison saisonniere. */
export function GET(request: Request) {
  return handle(request, (params, store) => {
    const { first, last } = parsePeriod(params, store);
    return overview(parseZone(params.get("zone"), store), first, last, store);
  });
}
