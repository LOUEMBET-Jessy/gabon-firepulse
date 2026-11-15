import { handle, parseDetectionFilter } from "@/lib/server/http";
import { queryDetections } from "@/lib/server/queries";

/** Detections natives selon zone, periode, satellite, confiance, type et jour/nuit. */
export function GET(request: Request) {
  return handle(request, (params, store) => queryDetections(parseDetectionFilter(params, store), store));
}
