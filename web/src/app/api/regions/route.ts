import { BadRequest } from "@/lib/server/zone";
import { handle, parsePeriod } from "@/lib/server/http";
import { departmentRegions, regions } from "@/lib/server/queries";

/** Activite par province (par defaut) ou par departement (level=department, province facultative). */
export function GET(request: Request) {
  return handle(request, (params, store) => {
    const { first, last } = parsePeriod(params, store);
    if (params.get("level") !== "department") return regions(first, last, store);
    const raw = params.get("province");
    const province = raw === null || raw === "" ? null : Number(raw);
    if (province !== null && (!Number.isInteger(province) || province < 0 || province >= store.meta.provinces.length)) throw new BadRequest("Province inconnue.");
    return departmentRegions(first, last, province, store);
  });
}
