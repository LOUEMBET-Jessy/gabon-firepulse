import { calendar } from "@/lib/server/engine";
import { handle } from "@/lib/server/http";
import { parseZone } from "@/lib/server/zone";
import { ANOMALY_SETTINGS } from "@/lib/science/anomaly";

/** Mois dont l'activite s'ecarte de la reference saisonniere, avec le detail du calcul. */
export function GET(request: Request) {
  return handle(request, (params, store) => {
    const result = calendar(parseZone(params.get("zone"), store), store);
    const flagged = new Set(["strong_high", "high", "low"]);
    return {
      zone: result.zone,
      unit: result.unit,
      settings: ANOMALY_SETTINGS,
      method:
        "Score robuste = (valeur - médiane) / (1,4826 x écart absolu médian), calculé sur le même mois calendaire des autres années.",
      anomalies: result.months
        .filter((m) => flagged.has(m.assessment.status))
        .map((m) => ({ year: m.year, month: m.month, kind: m.kind, ...m.assessment })),
      notAssessed: result.months
        .filter((m) => m.assessment.status === "incomplete" || m.assessment.status === "insufficient")
        .map((m) => ({ year: m.year, month: m.month, status: m.assessment.status })),
      provenance: result.provenance,
    };
  });
}
