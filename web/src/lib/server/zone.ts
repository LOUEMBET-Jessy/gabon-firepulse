import type { ZoneInfo, ZoneSpec } from "../types";
import type { Store } from "./store";

export class BadRequest extends Error {}

/** Emprise dans laquelle un rectangle personnalise est accepte. */
const LIMITS = { west: 7.5, south: -5, east: 15.5, north: 3.5 };

/** Analyse le parametre `zone` : "country", "province:3" ou "bbox:ouest,sud,est,nord". */
export function parseZone(raw: string | null, store: Store): ZoneSpec {
  if (!raw || raw === "country") return { kind: "country" };
  if (raw.startsWith("province:")) {
    const index = Number(raw.slice(9));
    if (!Number.isInteger(index) || index < 0 || index >= store.meta.provinces.length) {
      throw new BadRequest("Province inconnue.");
    }
    return { kind: "province", index };
  }
  if (raw.startsWith("bbox:")) {
    const parts = raw.slice(5).split(",").map(Number);
    if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
      throw new BadRequest("Rectangle invalide : quatre nombres attendus (ouest, sud, est, nord).");
    }
    const [w, s, e, n] = parts;
    if (w >= e || s >= n) throw new BadRequest("Rectangle invalide : ouest doit être inférieur à est, sud à nord.");
    if (w < LIMITS.west || e > LIMITS.east || s < LIMITS.south || n > LIMITS.north) {
      throw new BadRequest(
        `Rectangle hors de l'emprise couverte (longitude ${LIMITS.west} à ${LIMITS.east}, latitude ${LIMITS.south} à ${LIMITS.north}).`,
      );
    }
    return { kind: "bbox", bbox: [w, s, e, n] };
  }
  throw new BadRequest("Zone invalide.");
}

export function zoneKey(zone: ZoneSpec): string {
  if (zone.kind === "country") return "country";
  if (zone.kind === "province") return `province:${zone.index}`;
  return `bbox:${zone.bbox.map((v) => v.toFixed(4)).join(",")}`;
}

/** Predicat d'appartenance d'une ligne de detection a la zone. */
export function zoneMatcher(zone: ZoneSpec, store: Store): (row: number) => boolean {
  if (zone.kind === "country") return () => true;
  if (zone.kind === "province") {
    const { province } = store;
    const index = zone.index;
    return (row) => province[row] === index;
  }
  const [w, s, e, n] = zone.bbox;
  const { lon, lat } = store;
  return (row) => lon[row] >= w && lon[row] <= e && lat[row] >= s && lat[row] <= n;
}

function bboxAreaKm2([w, s, e, n]: [number, number, number, number]): number {
  const R = 6371.0088;
  const rad = Math.PI / 180;
  return R * R * (e - w) * rad * (Math.sin(n * rad) - Math.sin(s * rad));
}

export function zoneInfo(zone: ZoneSpec, store: Store): ZoneInfo {
  if (zone.kind === "country") {
    return { key: "country", label: "Gabon", kind: "country", areaKm2: store.countryAreaKm2, bbox: null };
  }
  if (zone.kind === "province") {
    return {
      key: zoneKey(zone),
      label: store.meta.provinces[zone.index].name,
      kind: "province",
      areaKm2: store.provinceAreaKm2[zone.index],
      bbox: store.provinceBbox[zone.index],
    };
  }
  const [w, s, e, n] = zone.bbox;
  const fmt = (v: number) => v.toFixed(2).replace(".", ",");
  return {
    key: zoneKey(zone),
    label: `Zone dessinée (${fmt(w)}° à ${fmt(e)}° E, ${fmt(s)}° à ${fmt(n)}° N)`,
    kind: "bbox",
    areaKm2: bboxAreaKm2(zone.bbox),
    bbox: zone.bbox,
  };
}
