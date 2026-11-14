"""Etapes B et C - Controle qualite et normalisation.

Chaque ligne source devient soit une detection normalisee, soit une entree du
journal des rejets avec son fichier, son numero de ligne et le motif. Aucune
valeur n'est corrigee silencieusement.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from .config import ENVELOPE, EPOCH, SAT_BY_FILE_VALUE

REQUIRED_COMMON = [
    "latitude", "longitude", "scan", "track", "acq_date", "acq_time",
    "satellite", "instrument", "confidence", "version", "frp", "daynight",
]
BRIGHTNESS_COLUMNS = {"MODIS": ("brightness", "bright_t31"), "VIIRS": ("bright_ti4", "bright_ti5")}
VIIRS_CONFIDENCE = {"l": 0, "n": 1, "h": 2}
MAX_REJECTS_KEPT = 500  # le journal garde le detail des 500 premiers rejets, et le total exact


def confidence_class_modis(pct: np.ndarray) -> np.ndarray:
    """Classes du guide utilisateur MODIS : faible < 30, nominale 30-79, elevee >= 80."""
    out = np.ones(len(pct), dtype=np.uint8)
    out[pct < 30] = 0
    out[pct >= 80] = 2
    return out


def read_source(path: Path) -> pd.DataFrame:
    """Lit un CSV FIRMS sans interpretation (tout en texte) et numerote les lignes."""
    df = pd.read_csv(path, dtype=str, keep_default_na=False, encoding="utf-8")
    df.columns = [c.strip() for c in df.columns]
    df["_line"] = np.arange(2, len(df) + 2, dtype=np.int64)  # ligne 1 = en-tete
    return df


def validate_and_normalize(df: pd.DataFrame, sensor: str, src_idx: int, file_name: str):
    """Retourne (detections normalisees, rejets, avertissements)."""
    rejects: list[dict] = []
    warnings: list[dict] = []
    b1, b2 = BRIGHTNESS_COLUMNS[sensor]
    missing = [c for c in REQUIRED_COMMON + [b1, b2] if c not in df.columns]
    if missing:
        raise ValueError(f"{file_name} : colonnes absentes {missing}")

    n = len(df)
    reason = np.full(n, "", dtype=object)

    def flag(mask: np.ndarray, label: str) -> None:
        sel = mask & (reason == "")
        reason[sel] = label

    lat = pd.to_numeric(df["latitude"], errors="coerce").to_numpy(dtype=float)
    lon = pd.to_numeric(df["longitude"], errors="coerce").to_numpy(dtype=float)
    flag(np.isnan(lat) | np.isnan(lon), "coordonnees non numeriques")
    flag((np.abs(lat) > 90) | (np.abs(lon) > 180), "coordonnees hors plage valide")
    flag(
        (lat < ENVELOPE["lat_min"]) | (lat > ENVELOPE["lat_max"]) | (lon < ENVELOPE["lon_min"]) | (lon > ENVELOPE["lon_max"]),
        "coordonnees hors emprise attendue",
    )

    dates = pd.to_datetime(df["acq_date"], format="%Y-%m-%d", errors="coerce")
    flag(dates.isna().to_numpy(), "date d'acquisition invalide")
    day = (dates - pd.Timestamp(EPOCH)).dt.days.to_numpy(dtype=float)
    flag(~np.isnan(day) & (day < 0), "date anterieure a 2000")

    time_txt = df["acq_time"].str.strip()
    time_ok = time_txt.str.fullmatch(r"\d{4}").to_numpy(dtype=bool)
    hhmm = pd.to_numeric(time_txt.where(time_ok, "0"), errors="coerce").to_numpy(dtype=np.int64)
    time_ok = time_ok & (hhmm // 100 < 24) & (hhmm % 100 < 60)
    flag(~time_ok, "heure d'acquisition invalide")

    sat_txt = df["satellite"].str.strip()
    known = sat_txt.isin(list(SAT_BY_FILE_VALUE)).to_numpy()
    flag(~known, "satellite inconnu")
    sat_sensor = sat_txt.map(lambda v: SAT_BY_FILE_VALUE[v].sensor if v in SAT_BY_FILE_VALUE else "")
    flag(known & (sat_sensor != sensor).to_numpy(), "satellite incoherent avec le jeu de donnees")
    flag((df["instrument"].str.strip() != sensor).to_numpy(), "instrument incoherent avec le jeu de donnees")

    conf_txt = df["confidence"].str.strip()
    if sensor == "MODIS":
        conf_num = pd.to_numeric(conf_txt, errors="coerce").to_numpy(dtype=float)
        conf_ok = ~np.isnan(conf_num) & (conf_num >= 0) & (conf_num <= 100)
        conf_native = np.where(conf_ok, conf_num, 0).astype(np.uint8)
        conf_class = confidence_class_modis(conf_native)
    else:
        conf_ok = conf_txt.isin(list(VIIRS_CONFIDENCE)).to_numpy()
        conf_class = conf_txt.map(VIIRS_CONFIDENCE).fillna(1).to_numpy(dtype=np.uint8)
        conf_native = np.full(n, 255, dtype=np.uint8)  # pas de valeur numerique native
    flag(~conf_ok, "confiance invalide")

    dn_txt = df["daynight"].str.strip()
    flag(~dn_txt.isin(["D", "N"]).to_numpy(), "indicateur jour/nuit invalide")

    # Doublons techniques : meme satellite, memes coordonnees, meme instant.
    dup = df.duplicated(subset=["satellite", "latitude", "longitude", "acq_date", "acq_time"], keep="first").to_numpy()
    flag(dup, "doublon technique")

    # Champs optionnels : une valeur illisible devient "indisponible" et est signalee.
    def optional_float(col: str, minimum: float | None = None) -> np.ndarray:
        values = pd.to_numeric(df[col], errors="coerce").to_numpy(dtype=float, copy=True)
        bad = np.isnan(values)
        if minimum is not None:
            bad |= values < minimum
        bad_valid = bad & (reason == "")
        if bad_valid.any():
            warnings.append({"file": file_name, "field": col, "count": int(bad_valid.sum()), "action": "valeur marquee indisponible"})
        values[bad] = np.nan
        return values.astype(np.float32)

    frp = optional_float("frp", 0.0)
    bright = optional_float(b1)
    bright2 = optional_float(b2)
    scan = optional_float("scan")
    track = optional_float("track")

    if "type" in df.columns:
        type_num = pd.to_numeric(df["type"], errors="coerce").to_numpy(dtype=float)
        type_code = np.where(np.isnan(type_num) | (type_num < 0) | (type_num > 3), 255, type_num).astype(np.uint8)
    else:
        type_code = np.full(n, 255, dtype=np.uint8)
    unknown_type = (type_code == 255) & (reason == "")
    if unknown_type.any():
        warnings.append({"file": file_name, "field": "type", "count": int(unknown_type.sum()), "action": "type inconnu, exclu de l'indice"})

    bad = reason != ""
    total_rejected = int(bad.sum())
    for idx in np.flatnonzero(bad)[:MAX_REJECTS_KEPT]:
        row = df.iloc[idx]
        rejects.append(
            {
                "file": file_name,
                "line": int(row["_line"]),
                "reason": str(reason[idx]),
                "raw": {k: row[k] for k in df.columns if not k.startswith("_")},
            }
        )

    keep = ~bad
    out = pd.DataFrame(
        {
            "lat": lat[keep],
            "lon": lon[keep],
            "day": day[keep].astype(np.int32),
            "time": hhmm[keep].astype(np.uint16),
            "sat": sat_txt[keep].map(lambda v: SAT_BY_FILE_VALUE[v].code).to_numpy(dtype=np.uint8),
            "conf_class": conf_class[keep],
            "conf_native": conf_native[keep],
            "frp": frp[keep],
            "bright": bright[keep],
            "bright2": bright2[keep],
            "scan": scan[keep],
            "track": track[keep],
            "night": (dn_txt[keep] == "N").to_numpy(dtype=np.uint8),
            "type": type_code[keep],
            "version": df["version"].str.strip()[keep].to_numpy(),
            "src": np.full(int(keep.sum()), src_idx, dtype=np.uint8),
            "line": df["_line"].to_numpy()[keep].astype(np.uint32),
        }
    )
    return out, rejects, warnings, total_rejected
