import type { ZoneInfo, ZoneSpec } from "../types";
import type { Store } from "./store";

export class BadRequest extends Error {}


/** Analyse le parametre `zone` : "country", "province:3", "department:12", "place:2399697" ou "bbox:ouest,sud,est,nord". */
export function parseZone(raw: string | null, store: Store): ZoneSpec {
  if (!raw || raw === "country") return { kind: "country" };
  if (raw.startsWith("province:")) {
    const index = Number(raw.slice(9));
    if (!Number.isInteger(index) || index < 0 || index >= store.meta.provinces.length) {
      throw new BadRequest("Province inconnue.");
    }
    return { kind: "province", index };
  }
  if (raw.startsWith("department:")) {
    const index = Number(raw.slice(11));
    if (!Number.isInteger(index) || index < 0 || index >= store.geography.departments.length) throw new BadRequest("Département inconnu.");
    return { kind: "department", index };
  }
  if (raw.startsWith("place:")) {
    const id = Number(raw.slice(6));
    if (!Number.isInteger(id) || !store.placeById.has(id)) throw new BadRequest("Localité inconnue.");
    return { kind: "place", id };
  }
  if (raw.startsWith("bbox:")) {
    const parts = raw.slice(5).split(",").map(Number);
    if (parts.length !== 4 || parts.some((v) => !Number.isFinite(v))) {
      throw new BadRequest("Rectangle invalide : quatre nombres attendus (ouest, sud, est, nord).");
    }
    const [w, s, e, n] = parts;
    // Emprise acceptee : l'enveloppe de controle qualite du pays, elargie d'un demi-degre.
    const env = (store.metadata as unknown as { envelope: { lon_min: number; lon_max: number; lat_min: number; lat_max: number } }).envelope;
    const LIMITS = { west: env.lon_min - 0.5, south: env.lat_min - 0.5, east: env.lon_max + 0.5, north: env.lat_max + 0.5 };
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
  if (zone.kind === "department") return `department:${zone.index}`;
  if (zone.kind === "place") return `place:${zone.id}`;
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
  if (zone.kind === "department") {
    const { department } = store;
    const index = zone.index;
    return (row) => department[row] === index;
  }
  if (zone.kind === "place") {
    // Disque de rayon fixe autour de la localite : prefiltre rectangulaire, puis distance sur la sphere.
    const place = store.placeById.get(zone.id)!;
    const radius = store.geography.place_radius_km;
    const rad = Math.PI / 180;
    const dLat = radius / 111.32;
    const dLon = radius / (111.32 * Math.cos(place.lat * rad));
    const { lon, lat } = store;
    const cosLat0 = Math.cos(place.lat * rad);
    return (row) => {
      const y = lat[row];
      const x = lon[row];
      if (Math.abs(y - place.lat) > dLat || Math.abs(x - place.lon) > dLon) return false;
      const a = Math.sin(((y - place.lat) * rad) / 2) ** 2 + cosLat0 * Math.cos(y * rad) * Math.sin(((x - place.lon) * rad) / 2) ** 2;
      return 2 * 6371.0088 * Math.asin(Math.sqrt(a)) <= radius;
    };
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
    return { key: "country", label: store.countryName, kind: "country", areaKm2: store.countryAreaKm2, bbox: null };
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
  if (zone.kind === "department") {
    const d = store.geography.departments[zone.index];
    return { key: zoneKey(zone), label: d.name, kind: "department", areaKm2: store.departmentAreaKm2[zone.index], bbox: store.departmentBbox[zone.index] };
  }
  if (zone.kind === "place") {
    const place = store.placeById.get(zone.id)!;
    const r = store.geography.place_radius_km;
    const dLat = r / 111.32;
    const dLon = r / (111.32 * Math.cos((place.lat * Math.PI) / 180));
    return {
      key: zoneKey(zone),
      label: `${place.name} (rayon de ${r} km)`,
      kind: "place",
      areaKm2: Math.PI * r * r,
      bbox: [place.lon - dLon, place.lat - dLat, place.lon + dLon, place.lat + dLat],
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
