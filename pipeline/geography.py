"""Etape G - Geographie d'exploration : pays du monde, departements et localites du Gabon.

Lancer apres build.py (lit detections.bin pour rattacher chaque detection a son departement) :
    python pipeline/geography.py

Sources (dans data/raw, telechargees avec leur provenance) :
- Natural Earth, pays du monde au 1:110 000 000 (domaine public) : navigation sur le globe ;
- geoBoundaries, departements du Gabon (ADM2, 2018, CC BY 3.0) ;
- GeoNames, lieux habites du Gabon (CC BY 4.0).

Sorties :
- web/public/geo/world.geojson        pays du monde (nom francais, continent), coordonnees arrondies ;
- web/public/geo/departments.geojson  49 departements, rattaches a leur province ;
- web/public/geo/places.geojson       lieux habites, avec leur province et leur departement ;
- web/data/departments.bin            indice de departement de chaque detection (int8, -1 hors polygone) ;
- web/data/geography.json             listes, sources et parametres lus par le serveur.

Aucune donnee de detection n'est creee ici : seuls des rattachements geographiques sont calcules.
"""

from __future__ import annotations

import io
import json
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from hotspot.geo import assign_provinces, load_provinces, points_in_geometry  # noqa: E402

RAW = ROOT / "data" / "raw"
WEB_DATA = ROOT / "web" / "data"
WEB_GEO = ROOT / "web" / "public" / "geo"

# Rayon de la zone d'analyse autour d'une localite : un point n'a pas de surface,
# l'analyse porte donc sur un disque, annonce comme tel a l'ecran.
PLACE_RADIUS_KM = 15.0

CONTINENT_FR = {
    "Africa": "Afrique",
    "Europe": "Europe",
    "Asia": "Asie",
    "North America": "Amérique du Nord",
    "South America": "Amérique du Sud",
    "Oceania": "Océanie",
    "Antarctica": "Antarctique",
    "Seven seas (open ocean)": "Océans",
}


def rounded(geometry: dict, digits: int) -> dict:
    def walk(c):
        if isinstance(c[0], (int, float)):
            return [round(c[0], digits), round(c[1], digits)]
        return [walk(x) for x in c]

    return {"type": geometry["type"], "coordinates": walk(geometry["coordinates"])}


def representative_point(geometry: dict) -> tuple[float, float]:
    """Point interieur approximatif : centre de la plus grande boucle, ramene dans le polygone si besoin."""
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    ring = max((p[0] for p in polygons), key=len)
    arr = np.asarray(ring, dtype=float)[:, :2]
    cx, cy = float(arr[:, 0].mean()), float(arr[:, 1].mean())
    if points_in_geometry(np.array([cx]), np.array([cy]), geometry)[0]:
        return cx, cy
    # Repli : grille de points dans l'emprise, on garde le plus proche du centre qui tombe dedans.
    xs = np.linspace(arr[:, 0].min(), arr[:, 0].max(), 40)
    ys = np.linspace(arr[:, 1].min(), arr[:, 1].max(), 40)
    gx, gy = np.meshgrid(xs, ys)
    gx, gy = gx.ravel(), gy.ravel()
    inside = points_in_geometry(gx, gy, geometry)
    d = (gx - cx) ** 2 + (gy - cy) ** 2
    d[~inside] = np.inf
    k = int(np.argmin(d))
    return float(gx[k]), float(gy[k])


def world() -> list[dict]:
    collection = json.loads((RAW / "world" / "ne_110m_admin_0_countries.geojson").read_text("utf-8"))
    features = []
    for f in collection["features"]:
        p = f["properties"]
        iso = p.get("ISO_A3") if p.get("ISO_A3") not in (None, "-99") else p.get("ADM0_A3")
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "iso": iso,
                    "name": p.get("NAME_FR") or p.get("NAME"),
                    "continent": CONTINENT_FR.get(p.get("CONTINENT"), p.get("CONTINENT")),
                    "lx": round(float(p.get("LABEL_X") or 0), 3),
                    "ly": round(float(p.get("LABEL_Y") or 0), 3),
                },
                "geometry": rounded(f["geometry"], 3),
            }
        )
    return features


def departments(provinces: list[dict]) -> list[dict]:
    collection = json.loads((RAW / "boundaries" / "geoboundaries_GAB_ADM2_simplified.geojson").read_text("utf-8"))
    items = []
    for f in collection["features"]:
        name = str(f["properties"].get("shapeName", "")).strip()
        x, y = representative_point(f["geometry"])
        # Departements (2018) et provinces (2005) ne s'emboitent pas exactement : la province retenue
        # est celle qui couvre la plus grande part du departement (vote sur une grille de points interieurs).
        arr = np.vstack([np.asarray(r, dtype=float)[:, :2] for poly in (f["geometry"]["coordinates"] if f["geometry"]["type"] == "MultiPolygon" else [f["geometry"]["coordinates"]]) for r in poly])
        gx, gy = np.meshgrid(np.linspace(arr[:, 0].min(), arr[:, 0].max(), 60), np.linspace(arr[:, 1].min(), arr[:, 1].max(), 60))
        gx, gy = gx.ravel(), gy.ravel()
        inside = points_in_geometry(gx, gy, f["geometry"])
        votes = assign_provinces(gx[inside], gy[inside], provinces)
        votes = votes[votes >= 0]
        parent = int(np.bincount(votes).argmax()) if votes.size else int(assign_provinces(np.array([x]), np.array([y]), provinces)[0])
        items.append({"name": name, "province": parent, "geometry": f["geometry"], "label": [round(x, 4), round(y, 4)]})
    # Ordre stable : province, puis nom.
    items.sort(key=lambda d: (d["province"], d["name"]))
    for i, d in enumerate(items):
        d["index"] = i
    return items


def places(country_geometry: dict, provinces: list[dict], depts: list[dict]) -> list[dict]:
    with zipfile.ZipFile(RAW / "places" / "geonames_GA.zip") as z:
        text = z.read("GA.txt").decode("utf-8")
    rows = [line.split("\t") for line in text.splitlines() if line]
    out = []
    for r in rows:
        if r[6] != "P" or r[7] in ("PPLX", "PPLH", "PPLQ", "PPLW"):
            continue
        out.append({"id": int(r[0]), "name": r[1], "lat": float(r[4]), "lon": float(r[5]), "code": r[7], "pop": int(r[14] or 0)})
    lon = np.array([p["lon"] for p in out])
    lat = np.array([p["lat"] for p in out])
    inside = points_in_geometry(lon, lat, country_geometry)
    prov = assign_provinces(lon, lat, provinces)
    dept = np.full(len(out), -1, dtype=np.int16)
    for d in depts:
        mask = points_in_geometry(lon, lat, d["geometry"]) & (dept == -1)
        dept[mask] = d["index"]
    kept = []
    for i, p in enumerate(out):
        if not inside[i]:
            continue
        kind = "capital" if p["code"] == "PPLC" else "admin" if p["code"].startswith("PPLA") else "town" if p["pop"] > 0 else "village"
        kept.append({**p, "kind": kind, "province": int(prov[i]), "department": int(dept[i])})
    return kept


def detection_departments(depts: list[dict]) -> tuple[np.ndarray, int]:
    meta = json.loads((WEB_DATA / "detections.meta.json").read_text("utf-8"))
    raw = (WEB_DATA / "detections.bin").read_bytes()
    col = {c["name"]: c for c in meta["columns"]}

    def f32(name: str) -> np.ndarray:
        c = col[name]
        return np.frombuffer(raw, dtype="<f4", count=c["bytes"] // 4, offset=c["offset"]).astype(float)

    lon, lat = f32("lon"), f32("lat")
    out = np.full(len(lon), -1, dtype=np.int8)
    for d in depts:
        mask = points_in_geometry(lon, lat, d["geometry"]) & (out == -1)
        out[mask] = d["index"]
    return out, int(meta["count"])


def main() -> None:
    provinces = load_provinces(RAW / "boundaries" / "geoboundaries_GAB_ADM1_simplified.geojson")
    country = json.loads((RAW / "boundaries" / "geoboundaries_GAB_ADM0_simplified.geojson").read_text("utf-8"))["features"][0]["geometry"]
    w = world()
    depts = departments(provinces)
    pl = places(country, provinces, depts)
    dept_of_row, n = detection_departments(depts)

    WEB_GEO.mkdir(parents=True, exist_ok=True)
    (WEB_GEO / "world.geojson").write_text(json.dumps({"type": "FeatureCollection", "features": w}, ensure_ascii=False, separators=(",", ":")), "utf-8")
    (WEB_GEO / "departments.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {"type": "Feature", "properties": {"index": d["index"], "name": d["name"], "province": d["province"]}, "geometry": rounded(d["geometry"], 4)}
                    for d in depts
                ],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "utf-8",
    )
    (WEB_GEO / "places.geojson").write_text(
        json.dumps(
            {
                "type": "FeatureCollection",
                "features": [
                    {
                        "type": "Feature",
                        "properties": {"id": p["id"], "name": p["name"], "kind": p["kind"], "pop": p["pop"], "province": p["province"], "department": p["department"]},
                        "geometry": {"type": "Point", "coordinates": [round(p["lon"], 4), round(p["lat"], 4)]},
                    }
                    for p in pl
                ],
            },
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        "utf-8",
    )
    (WEB_DATA / "departments.bin").write_bytes(np.ascontiguousarray(dept_of_row).tobytes())

    adm2_meta = json.loads((RAW / "boundaries" / "geoboundaries_GAB_ADM2.meta.json").read_text("utf-8"))
    towns = [p for p in pl if p["kind"] != "village"]
    payload = {
        "built_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rows": n,
        "place_radius_km": PLACE_RADIUS_KM,
        "departments": [{"index": d["index"], "name": d["name"], "province": d["province"], "label": d["label"]} for d in depts],
        # Toutes les localites sont valides comme zone ; la liste complete est servie par la carte (places.geojson).
        "places": [{"id": p["id"], "name": p["name"], "lat": p["lat"], "lon": p["lon"], "kind": p["kind"], "pop": p["pop"], "province": p["province"], "department": p["department"]} for p in pl],
        "towns": [p["id"] for p in sorted(towns, key=lambda p: -p["pop"])],
        "sources": {
            "world": {
                "name": "Natural Earth, Admin 0 Countries 1:110m",
                "license": "Domaine public",
                "url": "https://www.naturalearthdata.com/downloads/110m-cultural-vectors/",
            },
            "departments": {
                "name": f"geoBoundaries, Gabon ADM2 ({adm2_meta.get('boundaryCanonical') or 'départements'})",
                "year": adm2_meta.get("boundaryYearRepresented"),
                "license": adm2_meta.get("boundaryLicense"),
                "source": adm2_meta.get("boundarySource"),
                "url": adm2_meta.get("gjDownloadURL"),
                "units": len(depts),
            },
            "places": {
                "name": "GeoNames, lieux habités du Gabon (GA.zip)",
                "license": "Creative Commons Attribution 4.0",
                "url": "https://download.geonames.org/export/dump/GA.zip",
                "count": len(pl),
                "withPopulation": sum(1 for p in pl if p["pop"] > 0),
            },
        },
        "outside_departments": int((dept_of_row == -1).sum()),
    }
    (WEB_DATA / "geography.json").write_text(json.dumps(payload, ensure_ascii=False, indent=1), "utf-8")

    unassigned = [d["name"] for d in depts if d["province"] == -1]
    print(f"{len(w)} pays, {len(depts)} départements ({len(unassigned)} sans province : {unassigned}), {len(pl)} localités dont {len(towns)} villes")
    print(f"{n} détections, {int((dept_of_row == -1).sum())} hors départements")
    for p_index, p in enumerate(provinces):
        print(f"  {p['name']}: {sum(1 for d in depts if d['province'] == p_index)} départements")


if __name__ == "__main__":
    main()
