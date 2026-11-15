"""Etape A bis - Prolonger l'archive jusqu'a aujourd'hui avec l'API NASA FIRMS.

Les archives annuelles par pays (acquire.py) ne sont publiees qu'apres la fin de l'annee. Pour l'annee en
cours, ce script interroge l'API « area » de FIRMS, avec une cle gratuite (FIRMS_MAP_KEY) :
- donnees « SP » (traitement standard, definitif) tant qu'elles existent ;
- puis donnees « NRT » (temps quasi reel, provisoire) jusqu'a la date la plus recente.

Les lignes sont remises au format exact des archives annuelles, puis ecrites comme un fichier annuel de plus
(data/raw/firms/<jeu>/<jeu>_<annee>_<Pays>.csv) et consignees dans le manifeste : build.py les traite comme
le reste, sans regle particuliere.

Deux ecarts de format sont traites explicitement, et documentes :
1. Etendue. L'API renvoie un rectangle ; une archive par pays contient le pays et quelques points en mer.
   On garde un point s'il est dans le pays, ou dans une cellule de 0,05° ou l'archive a deja eu des detections.
2. Type de source. Les produits NRT n'ont pas de colonne « type » (vegetation, source statique, mer). On le
   deduit : a l'emplacement d'une source statique deja classee par la NASA dans l'archive -> 2 ; sinon en mer -> 3 ;
   sinon -> 0. Ce masque est valide sur l'annee la plus recente de l'archive, dont le vrai type est connu :
   precision et rappel sont enregistres dans le manifeste.

Usage :
    HOTSPOT_COUNTRY=GAB python pipeline/recent.py           # cle lue dans FIRMS_MAP_KEY ou web/.env.local
    HOTSPOT_COUNTRY=GAB python pipeline/recent.py --check   # valide seulement le masque, sans reseau
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

from hotspot.config import GRID, PROFILE, RAW_DIR  # noqa: E402
from hotspot.geo import cell_index, points_in_geometry  # noqa: E402

FIRMS = "https://firms.modaps.eosdis.nasa.gov"
USER_AGENT = "firms-archive-client/1.0 (research prototype)"
DAY_RANGE = 5  # maximum accepte par l'API « area »
ARCHIVE_COLUMNS = {
    "MODIS": ["latitude", "longitude", "brightness", "scan", "track", "acq_date", "acq_time", "satellite", "instrument", "confidence", "version", "bright_t31", "frp", "daynight", "type"],
    "VIIRS": ["latitude", "longitude", "bright_ti4", "scan", "track", "acq_date", "acq_time", "satellite", "instrument", "confidence", "version", "bright_ti5", "frp", "daynight", "type"],
}
# Jeu de l'archive -> (capteur, source SP, source NRT de l'API)
DATASETS = {
    "modis": ("MODIS", "MODIS_SP", "MODIS_NRT"),
    "viirs-snpp": ("VIIRS", "VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"),
    "viirs-jpss1": ("VIIRS", "VIIRS_NOAA20_SP", "VIIRS_NOAA20_NRT"),
}
SATELLITE_NAMES = {"T": "Terra", "TERRA": "Terra", "A": "Aqua", "AQUA": "Aqua", "N": "N", "NPP": "N", "N20": "N20", "1": "N20"}
MANIFEST = RAW_DIR / PROFILE.manifest
MASK_STEP = 0.005  # environ 550 m : l'echelle d'un site industriel, tolerance de geolocalisation comprise


def map_key() -> str | None:
    key = os.environ.get("FIRMS_MAP_KEY", "").strip()
    if key:
        return key
    env = ROOT / "web" / ".env.local"
    if env.exists():
        for line in env.read_text("utf-8").splitlines():
            if line.strip().startswith("FIRMS_MAP_KEY="):
                return line.split("=", 1)[1].strip().strip('"') or None
    return None


def fetch(url: str, timeout: int = 120) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    attempts = 7
    for attempt in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as err:
            if attempt == attempts - 1:
                raise
            wait = min(10 * 2**attempt, 180)
            print(f"    nouvel essai dans {wait} s apres erreur : {err}", flush=True)
            time.sleep(wait)
    raise RuntimeError("inaccessible")


# Fenetres deja recues : un telechargement interrompu reprend la ou il s'est arrete. Les fenetres recentes
# (moins de 10 jours) sont toujours redemandees, car la NASA les complete encore.
CACHE = RAW_DIR / "firms" / "_api" / PROFILE.iso


def fetch_window(key: str, source: str, day: date, url: str) -> str:
    path = CACHE / source / f"{day.isoformat()}.csv"
    recent = (date.today() - day).days < 10
    if path.exists() and not recent:
        return path.read_text("utf-8")
    text = fetch(url)
    if not (text.lower().startswith("invalid") or "error" in text[:80].lower()):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, "utf-8")
    return text


def now_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ------------------------------------------------------------------ Archive de reference : etendue et sources statiques


def load_archive() -> pd.DataFrame:
    """Toutes les detections des archives annuelles du pays (colonnes utiles seulement)."""
    manifest = json.loads(MANIFEST.read_text("utf-8"))
    frames = []
    for f in manifest["firms_files"]:
        if f.get("api"):
            continue
        df = pd.read_csv(ROOT / f["path"], usecols=["latitude", "longitude", "acq_date", "type"], dtype={"type": "Int64"})
        df["year"] = int(f["year"])
        frames.append(df)
    return pd.concat(frames, ignore_index=True)


def mask_keys(lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    return (np.floor(lon / MASK_STEP).astype(np.int64) << 32) + np.floor(lat / MASK_STEP).astype(np.int64)


def static_mask(archive: pd.DataFrame, until_year: int) -> set[int]:
    """Cellules d'environ 550 m ou la NASA a classe au moins deux detections comme source statique (type 2)."""
    s = archive[(archive["type"] == 2) & (archive["year"] <= until_year)]
    keys, counts = np.unique(mask_keys(s["longitude"].to_numpy(), s["latitude"].to_numpy()), return_counts=True)
    kept = keys[counts >= 2]
    # Tolerance d'une cellule autour de chaque site (decalage de geolocalisation d'un passage a l'autre).
    out: set[int] = set()
    for k in kept:
        x, y = int(k >> 32), int(k & 0xFFFFFFFF) - (1 << 32 if (k & 0x80000000) else 0)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                out.add(((x + dx) << 32) + (y + dy))
    return out


def land_geometry() -> dict:
    return json.loads((RAW_DIR / "boundaries" / f"geoboundaries_{PROFILE.iso}_ADM0_simplified.geojson").read_text("utf-8"))["features"][0]["geometry"]


def infer_type(lon: np.ndarray, lat: np.ndarray, mask: set[int], land: dict) -> np.ndarray:
    on_land = points_in_geometry(lon, lat, land)
    keys = mask_keys(lon, lat)
    static = np.fromiter((k in mask for k in keys), dtype=bool, count=len(keys))
    # Un site industriel connu reste statique meme s'il tombe juste hors du trait de cote simplifie.
    return np.where(static, 2, np.where(~on_land, 3, 0)).astype(np.int64)


def validate_mask(archive: pd.DataFrame, land: dict) -> dict:
    """Le masque construit sans la derniere annee est applique a cette annee, dont le vrai type est connu."""
    last = int(archive["year"].max())
    mask = static_mask(archive, last - 1)
    test = archive[archive["year"] == last]
    truth = test["type"].to_numpy(dtype=float)
    pred = infer_type(test["longitude"].to_numpy(), test["latitude"].to_numpy(), mask, land)
    t_static, p_static = truth == 2, pred == 2
    tp = int((t_static & p_static).sum())
    precision = tp / max(int(p_static.sum()), 1)
    recall = tp / max(int(t_static.sum()), 1)
    # Ce qui compte pour l'indice : la part des detections classees « vegetation » qui le sont vraiment.
    veg_pred = pred == 0
    veg_ok = float((truth[veg_pred] == 0).mean()) if veg_pred.any() else 1.0
    return {
        "test_year": last,
        "rows": int(len(test)),
        "static_precision": round(precision, 4),
        "static_recall": round(recall, 4),
        "vegetation_precision": round(veg_ok, 4),
        "agreement": round(float((truth == pred).mean()), 4),
    }


def footprint(archive: pd.DataFrame) -> set[int]:
    cells = cell_index(archive["longitude"].to_numpy(), archive["latitude"].to_numpy(), GRID)
    return set(int(c) for c in np.unique(cells) if c >= 0)


# ------------------------------------------------------------------ API FIRMS


def availability(key: str) -> dict[str, tuple[date, date]]:
    text = fetch(f"{FIRMS}/api/data_availability/csv/{key}/ALL")
    out = {}
    for row in csv.DictReader(io.StringIO(text)):
        try:
            out[row["data_id"].strip()] = (date.fromisoformat(row["min_date"].strip()), date.fromisoformat(row["max_date"].strip()))
        except (KeyError, ValueError):
            continue
    if not out:
        raise RuntimeError(f"Reponse inattendue de data_availability : {text[:200]}")
    return out


def download(key: str, source: str, first: date, last: date) -> pd.DataFrame:
    w, s, e, n = PROFILE.envelope["lon_min"], PROFILE.envelope["lat_min"], PROFILE.envelope["lon_max"], PROFILE.envelope["lat_max"]
    frames = []
    day = first
    while day <= last:
        text = fetch_window(key, source, day, f"{FIRMS}/api/area/csv/{key}/{source}/{w},{s},{e},{n}/{DAY_RANGE}/{day.isoformat()}")
        if text.lower().startswith("invalid") or "error" in text[:80].lower():
            raise RuntimeError(f"{source} {day} : {text[:160]}")
        df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False)
        if len(df):
            frames.append(df)
        day += timedelta(days=DAY_RANGE)
        time.sleep(0.4)  # 5 000 transactions / 10 min : tres en dessous
    out = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
    if len(out):
        out = out[(out["acq_date"] >= first.isoformat()) & (out["acq_date"] <= last.isoformat())]
    return out


def to_archive_format(df: pd.DataFrame, sensor: str, mask: set[int], land: dict, cells: set[int]) -> tuple[pd.DataFrame, dict]:
    """Remet des lignes de l'API au format des archives annuelles, et ne garde que l'etendue du pays."""
    if df.empty:
        return pd.DataFrame(columns=ARCHIVE_COLUMNS[sensor]), {"kept": 0, "outside": 0, "type_inferred": 0}
    out = df.copy()
    out.columns = [c.strip() for c in out.columns]
    lon = pd.to_numeric(out["longitude"], errors="coerce").to_numpy(dtype=float)
    lat = pd.to_numeric(out["latitude"], errors="coerce").to_numpy(dtype=float)
    in_cells = np.isin(cell_index(lon, lat, GRID), list(cells))
    keep = points_in_geometry(lon, lat, land) | in_cells
    out, lon, lat = out[keep].copy(), lon[keep], lat[keep]
    out["instrument"] = sensor
    out["satellite"] = out["satellite"].str.strip().str.upper().map(SATELLITE_NAMES).fillna(out["satellite"].str.strip())
    if sensor == "VIIRS":
        out["confidence"] = out["confidence"].str.strip().str.lower().str[0]
    # L'API ecrit l'heure sans zero initial (121 pour 01:21) ; les archives annuelles l'ecrivent sur 4 chiffres.
    out["acq_time"] = out["acq_time"].astype(str).str.strip().str.zfill(4)
    # Type de source : garde tel quel quand la NASA le fournit (SP), deduit seulement pour les lignes NRT sans type.
    if "type" not in out.columns:
        out["type"] = ""
    # Valeur absente : chaine vide (fichier relu) ou NaN (concatenation de lignes SP avec type et NRT sans type).
    out["type"] = out["type"].fillna("").astype(str).str.strip().replace({"nan": ""})
    missing = (out["type"] == "").to_numpy()
    if missing.any():
        guessed = infer_type(lon, lat, mask, land).astype(str)
        out["type"] = np.where(missing, guessed, out["type"].astype(str).str.strip())
    inferred = int(missing.sum())
    for col in ARCHIVE_COLUMNS[sensor]:
        if col not in out.columns:
            out[col] = ""
    return out[ARCHIVE_COLUMNS[sensor]], {"kept": int(len(out)), "outside": int((~keep).sum()), "type_inferred": inferred}


def reformat(archive: pd.DataFrame, land: dict) -> int:
    """Reapplique la mise au format (idempotente) aux fichiers de l'API deja ecrits, et met le manifeste a jour."""
    manifest = json.loads(MANIFEST.read_text("utf-8"))
    year = int(archive["year"].max())
    mask, cells = static_mask(archive, year), footprint(archive)
    for f in manifest["firms_files"]:
        if not f.get("api"):
            continue
        sensor = DATASETS[f["dataset"]][0]
        path = ROOT / f["path"]
        table, stats = to_archive_format(pd.read_csv(path, dtype=str, keep_default_na=False), sensor, mask, land, cells)
        payload = table.to_csv(index=False).encode("utf-8")
        path.write_bytes(payload)
        f.update({"bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(), "rows": stats["kept"]})
        manifest.get("recent", {}).get("datasets", {}).get(f["dataset"], {})["type_inferred"] = stats["type_inferred"]
        print(f"  {f['path']} : {stats['kept']} lignes, type deduit pour {stats['type_inferred']}")
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), "utf-8")
    return 0


# ------------------------------------------------------------------ Programme


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="valider seulement le masque de sources statiques, sans reseau")
    parser.add_argument("--reformat", action="store_true", help="reappliquer la mise au format aux fichiers deja telecharges, sans reseau")
    args = parser.parse_args()

    archive = load_archive()
    land = land_geometry()
    quality = validate_mask(archive, land)
    print(f"Masque de sources statiques, teste sur {quality['test_year']} ({quality['rows']} detections au vrai type connu) :")
    print(f"  sources statiques : precision {quality['static_precision']:.1%}, rappel {quality['static_recall']:.1%}")
    print(f"  detections classees vegetation qui le sont vraiment : {quality['vegetation_precision']:.1%} ; accord global {quality['agreement']:.1%}")
    if args.check:
        return 0
    if args.reformat:
        return reformat(archive, land)

    key = map_key()
    if not key:
        print("FIRMS_MAP_KEY absente : demandez une cle gratuite sur https://firms.modaps.eosdis.nasa.gov/api/map_key/ puis ajoutez-la a web/.env.local.")
        return 2

    last_archive_year = int(archive["year"].max())
    start = date(last_archive_year + 1, 1, 1)
    mask = static_mask(archive, last_archive_year)
    cells = footprint(archive)
    avail = availability(key)
    manifest = json.loads(MANIFEST.read_text("utf-8"))
    manifest["firms_files"] = [f for f in manifest["firms_files"] if not (f.get("api") and f["year"] >= start.year)]
    manifest["firms_missing"] = [m for m in manifest.get("firms_missing", []) if m["year"] < start.year]
    recent = {"generated_at": now_utc(), "start": start.isoformat(), "mask_validation": quality, "datasets": {}}

    for dataset, (sensor, sp, nrt) in DATASETS.items():
        sp_range, nrt_range = avail.get(sp), avail.get(nrt)
        parts, ranges = [], {}
        if sp_range and sp_range[1] >= start:
            a, b = max(start, sp_range[0]), sp_range[1]
            print(f"  {dataset} : {sp} du {a} au {b}")
            parts.append(download(key, sp, a, b))
            ranges["SP"] = [a.isoformat(), b.isoformat()]
        nrt_first = date.fromisoformat(ranges["SP"][1]) + timedelta(days=1) if "SP" in ranges else start
        if nrt_range and nrt_range[1] >= nrt_first:
            a, b = max(nrt_first, nrt_range[0]), nrt_range[1]
            print(f"  {dataset} : {nrt} du {a} au {b} (provisoire)")
            parts.append(download(key, nrt, a, b))
            ranges["NRT"] = [a.isoformat(), b.isoformat()]
        raw = pd.concat([p for p in parts if len(p)], ignore_index=True) if any(len(p) for p in parts) else pd.DataFrame()
        table, stats = to_archive_format(raw, sensor, mask, land, cells)
        name = f"{dataset}_{start.year}_{PROFILE.firms_name}.csv"
        dest = RAW_DIR / "firms" / dataset / name
        payload = table.to_csv(index=False).encode("utf-8")
        dest.write_bytes(payload)
        print(f"    {stats['kept']} detections gardees, {stats['outside']} hors du pays, type deduit pour {stats['type_inferred']}")
        manifest["firms_files"].append(
            {
                "dataset": dataset,
                "year": start.year,
                "url": f"{FIRMS}/api/area/csv/CLE_MASQUEE/{{source}}/{PROFILE.envelope}/{DAY_RANGE}/{{date}}",
                "path": dest.relative_to(ROOT).as_posix(),
                "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "rows": stats["kept"],
                "accessed_at": now_utc(),
                "api": True,
                "processing": ranges,
            }
        )
        recent["datasets"][dataset] = {"ranges": ranges, **stats}

    nrt_starts = [v["ranges"]["NRT"][0] for v in recent["datasets"].values() if "NRT" in v["ranges"]]
    recent["provisional_from"] = min(nrt_starts) if nrt_starts else None
    manifest["recent"] = recent
    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), "utf-8")
    print(f"Manifeste mis a jour : {MANIFEST.relative_to(ROOT)} ; donnees provisoires a partir du {recent['provisional_from']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
