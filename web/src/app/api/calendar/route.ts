import { calendar } from "@/lib/server/engine";
import { handle } from "@/lib/server/http";
import { parseZone } from "@/lib/server/zone";

/** Series calendaires harmonisees (mois, references saisonnieres, annees, tendances) pour une zone. */
export function GET(request: Request) {
  return handle(request, (params, store) => calendar(parseZone(params.get("zone"), store), store));
}
