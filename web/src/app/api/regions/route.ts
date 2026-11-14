import { handle, parsePeriod } from "@/lib/server/http";
import { regions } from "@/lib/server/queries";

/** Activite par province sur une periode. */
export function GET(request: Request) {
  return handle(request, (params, store) => {
    const { first, last } = parsePeriod(params, store);
    return regions(first, last, store);
  });
}
