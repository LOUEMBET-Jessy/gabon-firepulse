"""Etape A - Acquisition.

Telecharge les archives annuelles FIRMS (pays : Gabon) et les limites
administratives geoBoundaries, puis ecrit un manifeste de provenance
(URL, taille, empreinte SHA-256, date d'acces UTC, nombre de lignes).

Aucune transformation n'est faite ici : les fichiers bruts restent intacts
dans data/raw/ et servent de reference pour l'audit.

Usage :  python pipeline/acquire.py [--force]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
FIRMS_DIR = RAW / "firms"
BOUNDS_DIR = RAW / "boundaries"
MANIFEST = RAW / "manifest.json"

USER_AGENT = "firms-archive-client/1.0 (research prototype)"
FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/data/country"
COUNTRY = "Gabon"
ISO3 = "GAB"

# Jeu FIRMS -> (premiere annee a tenter, derniere annee a tenter).
# Les annees absentes cote serveur (404) sont consignees, pas masquees.
DATASETS: dict[str, tuple[int, int]] = {
    "modis": (2000, 2026),
    "viirs-snpp": (2012, 2026),
    "viirs-jpss1": (2018, 2026),
}

GEOBOUNDARIES_API = "https://www.geoboundaries.org/api/current/gbOpen/{iso}/{level}/"


def fetch(url: str, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def acquire_firms(force: bool) -> tuple[list[dict], list[dict]]:
    files: list[dict] = []
    missing: list[dict] = []
    FIRMS_DIR.mkdir(parents=True, exist_ok=True)
    previous = {}
    if MANIFEST.exists():
        previous = {f["path"]: f for f in json.loads(MANIFEST.read_text("utf-8")).get("firms_files", [])}

    for dataset, (first, last) in DATASETS.items():
        for year in range(first, last + 1):
            name = f"{dataset}_{year}_{COUNTRY}.csv"
            url = f"{FIRMS_BASE}/{dataset}/{year}/{name}"
            dest = FIRMS_DIR / dataset / name
            rel = dest.relative_to(ROOT).as_posix()
            if dest.exists() and not force and rel in previous:
                files.append(previous[rel])
                continue
            try:
                payload = fetch(url)
            except urllib.error.HTTPError as err:
                missing.append({"dataset": dataset, "year": year, "url": url, "http_status": err.code, "checked_at": now_utc()})
                print(f"  absent  {dataset} {year} (HTTP {err.code})")
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(payload)
            rows = max(payload.count(b"\n") - 1, 0)
            files.append(
                {
                    "dataset": dataset,
                    "year": year,
                    "url": url,
                    "path": rel,
                    "bytes": len(payload),
                    "sha256": hashlib.sha256(payload).hexdigest(),
                    "rows": rows,
                    "accessed_at": now_utc(),
                }
            )
            print(f"  ok      {dataset} {year}  {rows:>6} lignes")
            time.sleep(0.4)
    return files, missing


def acquire_boundaries(force: bool) -> list[dict]:
    out: list[dict] = []
    BOUNDS_DIR.mkdir(parents=True, exist_ok=True)
    for level in ("ADM0", "ADM1"):
        meta_path = BOUNDS_DIR / f"geoboundaries_{ISO3}_{level}.meta.json"
        geo_path = BOUNDS_DIR / f"geoboundaries_{ISO3}_{level}_simplified.geojson"
        if meta_path.exists() and geo_path.exists() and not force:
            meta = json.loads(meta_path.read_text("utf-8"))
        else:
            api_url = GEOBOUNDARIES_API.format(iso=ISO3, level=level)
            meta = json.loads(fetch(api_url).decode("utf-8"))
            meta["_api_url"] = api_url
            meta["_accessed_at"] = now_utc()
            payload = fetch(meta["simplifiedGeometryGeoJSON"])
            geo_path.write_bytes(payload)
            meta["_sha256"] = hashlib.sha256(payload).hexdigest()
            meta["_bytes"] = len(payload)
            meta_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), "utf-8")
            print(f"  ok      geoBoundaries {level}")
        out.append(
            {
                "level": level,
                "path": geo_path.relative_to(ROOT).as_posix(),
                "api_url": meta.get("_api_url"),
                "download_url": meta.get("simplifiedGeometryGeoJSON"),
                "source": meta.get("boundarySource"),
                "license": meta.get("boundaryLicense"),
                "license_detail": meta.get("licenseDetail"),
                "year_represented": meta.get("boundaryYearRepresented"),
                "boundary_id": meta.get("boundaryID"),
                "sha256": meta.get("_sha256"),
                "bytes": meta.get("_bytes"),
                "accessed_at": meta.get("_accessed_at"),
            }
        )
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="retelecharger meme si le fichier existe")
    args = parser.parse_args()

    print("FIRMS : archives annuelles par pays")
    files, missing = acquire_firms(args.force)
    print("geoBoundaries : limites administratives")
    try:
        boundaries = acquire_boundaries(args.force)
    except Exception as err:  # la couche de contexte est facultative, l'echec est consigne
        print(f"  echec   geoBoundaries : {err}")
        boundaries = []

    manifest = {
        "generated_at": now_utc(),
        "country": COUNTRY,
        "firms_base_url": FIRMS_BASE,
        "firms_files": files,
        "firms_missing": missing,
        "boundaries": boundaries,
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), "utf-8")
    total = sum(f["rows"] for f in files)
    print(f"Manifeste : {MANIFEST.relative_to(ROOT)}  |  {len(files)} fichiers, {total} lignes, {len(missing)} annees absentes")
    return 0 if files else 1


if __name__ == "__main__":
    sys.exit(main())
