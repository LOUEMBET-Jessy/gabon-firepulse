import { provenance, zoneDaily } from "@/lib/server/engine";
import { handle } from "@/lib/server/http";
import { dayToIso } from "@/lib/server/store";
import { parseZone, zoneInfo } from "@/lib/server/zone";
import type { DailyResponse } from "@/lib/types";

/** Indice harmonise jour par jour sur tout l'historique, avec la configuration qui alimente chaque jour. */
export function GET(request: Request) {
  return handle(request, (params, store): DailyResponse => {
    const zone = parseZone(params.get("zone"), store);
    const daily = zoneDaily(zone, store);
    const first = store.firstDay;
    return {
      zone: zoneInfo(zone, store),
      firstDate: dayToIso(store, first),
      harmonized: Array.from(daily.harmonized.subarray(first), (v) => Math.round(v * 100) / 100),
      source: Array.from(store.sourceOfDay.subarray(first)),
      provenance: provenance(store),
    };
  });
}
