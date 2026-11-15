"""Construit les donnees traitees de Hot-Spots a partir de data/raw/.

Sorties (web/data/, lues cote serveur par l'application) :
  detections.bin + detections.meta.json  detections normalisees, format colonne
  harmonization.json                     grille, relais, facteurs de calage, validation
  metadata.json                          sources, provenance, bilan qualite
  quality_log.json                       journal des rejets et avertissements
Et web/public/geo/ : limites administratives affichees sur la carte.

Usage :  python pipeline/build.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hotspot import harmonize as hz  # noqa: E402
from hotspot.config import (  # noqa: E402
    CONFIGS,
    CV_MIN_REFERENCE,
    ELIGIBLE_TYPE,
    ENVELOPE,
    PROFILE,
    EPOCH,
    GAP_RULES,
    GAP_WITNESS_MIN_DETECTIONS,
    GRID,
    MODIS_LOW_CONFIDENCE_BELOW,
    PARSIMONY_TOLERANCE,
    RAW_DIR,
    REFERENCE_CONFIG,
    RELAY_PRIORITY,
    ROOT,
    SATELLITES,
    SEASON_MONTHS,
    WEB_DATA_DIR,
    WEB_GEO_DIR,
)
from hotspot.geo import assign_provinces, cell_index, load_provinces  # noqa: E402
from hotspot.ingest import read_source, validate_and_normalize  # noqa: E402

COLUMNS = [  # (nom, type numpy little-endian, type annonce au lecteur)
    ("lat", "<f4", "f32"), ("lon", "<f4", "f32"), ("frp", "<f4", "f32"), ("bright", "<f4", "f32"),
    ("bright2", "<f4", "f32"), ("scan", "<f4", "f32"), ("track", "<f4", "f32"),
    ("cell", "<i4", "i32"), ("line", "<u4", "u32"),
    ("day", "<u2", "u16"), ("time", "<u2", "u16"),
    ("sat", "u1", "u8"), ("conf_class", "u1", "u8"), ("conf_native", "u1", "u8"), ("night", "u1", "u8"),
    ("type", "u1", "u8"), ("version", "u1", "u8"), ("src", "u1", "u8"), ("province", "i1", "i8"), ("eligible", "u1", "u8"),
]


def clean(value):
    """JSON strict : NaN et infinis deviennent null."""
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (np.floating, float)):
        return None if not np.isfinite(value) else float(value)
    if isinstance(value, np.integer):
        return int(value)
    return value


def write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(clean(payload), ensure_ascii=False, indent=1), "utf-8")


def main() -> int:
    manifest = json.loads((RAW_DIR / PROFILE.manifest).read_text("utf-8"))
    sources = sorted(manifest["firms_files"], key=lambda f: (f["dataset"], f["year"]))
    sensor_of = {s.dataset: s.sensor for s in SATELLITES}

    # ---- B, C : controle qualite et normalisation
    frames, rejects, warnings = [], [], []
    per_file = []
    for idx, src in enumerate(sources):
        path = ROOT / src["path"]
        raw = read_source(path)
        norm, rej, warn, n_rejected = validate_and_normalize(raw, sensor_of[src["dataset"]], idx, path.name)
        frames.append(norm)
        rejects.extend(rej)
        warnings.extend(warn)
        per_file.append({**src, "file": path.name, "rows_read": len(raw), "rows_kept": len(norm), "rows_rejected": n_rejected})
    det = pd.concat(frames, ignore_index=True)
    total_read = sum(f["rows_read"] for f in per_file)
    total_rejected = sum(f["rows_rejected"] for f in per_file)
    print(f"Lignes lues {total_read} | conservees {len(det)} | rejetees {total_rejected} | avertissements {len(warnings)}")

    # ---- D : espace commun
    det["cell"] = cell_index(det["lon"].to_numpy(), det["lat"].to_numpy(), GRID)
    off_grid = int((det["cell"] < 0).sum())
    if off_grid:
        raise RuntimeError(f"{off_grid} detections hors grille : elargir la grille")
    provinces = load_provinces(RAW_DIR / "boundaries" / f"geoboundaries_{PROFILE.iso}_ADM1_simplified.geojson")
    det["province"] = assign_provinces(det["lon"].to_numpy(), det["lat"].to_numpy(), provinces)

    versions = sorted(det["version"].unique())
    det["version"] = det["version"].map({v: i for i, v in enumerate(versions)}).astype(np.uint8)

    is_modis = det["sat"].to_numpy() <= 1
    not_low = np.where(is_modis, det["conf_native"].to_numpy() >= MODIS_LOW_CONFIDENCE_BELOW, det["conf_class"].to_numpy() >= 1)
    det["eligible"] = ((det["type"].to_numpy() == ELIGIBLE_TYPE) & not_low).astype(np.uint8)

    det = det.sort_values(["day", "cell", "sat", "time", "src", "line"], kind="stable").reset_index(drop=True)

    # ---- E, F : temps commun, interruptions, calage, relais
    day = det["day"].to_numpy(dtype=np.int64)
    cell = det["cell"].to_numpy(dtype=np.int64)
    sat = det["sat"].to_numpy()
    eligible = det["eligible"].to_numpy(dtype=bool)
    n_days = int(day.max()) + 1
    n_cells = GRID.ncols * GRID.nrows
    cal_month, ym = hz.calendar_arrays(n_days)
    first_day = {s.code: (s.first_day - EPOCH).days for s in SATELLITES}
    observed_first = {s.code: int(day[sat == s.code].min()) for s in SATELLITES}
    # La mise en service est une date connue de la mission ; la premiere detection peut arriver quelques jours
    # apres dans un pays peu actif (aucun feu le premier jour). Elle ne peut jamais la preceder.
    for s in SATELLITES:
        delay = observed_first[s.code] - first_day[s.code]
        if delay < 0 or delay > 45:
            raise RuntimeError(f"{s.name} : premiere detection {hz.day_to_date(observed_first[s.code])} incoherente avec la mise en service {s.first_day}")

    all_counts = {s.code: hz.daily_counts(day, sat == s.code, n_days) for s in SATELLITES}
    gaps = hz.find_gaps(all_counts, first_day, n_days - 1, cal_month)
    operating = hz.operating_mask(gaps, first_day, n_days)
    valid = {c: np.logical_and.reduce([operating[code] for code in sats]) for c, sats in CONFIGS.items()}

    cell_days = {c: hz.daily_cell_days(day, cell, eligible & np.isin(sat, sats), n_days, n_cells) for c, sats in CONFIGS.items()}
    raw_counts = {c: hz.daily_counts(day, eligible & np.isin(sat, sats), n_days) for c, sats in CONFIGS.items()}

    calibration = hz.calibrate(cell_days, valid, ym)
    source = hz.relay_sources(valid, n_days)
    harmonized = hz.harmonized_daily(cell_days, source, calibration, cal_month)
    start = min(first_day.values())

    print("\nInterruptions detectees :")
    for g in gaps:
        print(f"  {g['satellite']:7} {g['start']} -> {g['end']} ({g['days']} j, attendu {g['expected_detections']}, temoin {g['witness_detections']})")
    print("\nCalage sur Suomi-NPP (validation en retirant une annee) :")
    for c, cal in calibration.items():
        v = cal["validation"]
        cands = ", ".join(f"{m}={r['monthly_median_abs_pct_error']:.3f}" for m, r in cal["candidates"].items())
        f = cal["factors_by_month"]
        print(f"  {c:2} modele={cal['model']:6} facteur={min(f):.2f}..{max(f):.2f}  erreur mensuelle mediane={v['monthly_median_abs_pct_error']:.1%}  annuelle moy={v['annual_mean_abs_pct_error']:.1%} max={v['annual_max_abs_pct_error']:.1%}  r={v['monthly_correlation']:.3f}  [{cands}]")

    # Diagnostic : le choix de l'unite (cellules-jour contre detections brutes)
    unit_comparison = {}
    for label, series in (("cell_days", cell_days), ("raw_detections", raw_counts)):
        common = valid["TA"] & valid[REFERENCE_CONFIG]
        y, m, s_, r_ = hz.monthly_pairs(series["TA"], series[REFERENCE_CONFIG], common, ym)
        res = hz.cross_validate(calibration["TA"]["model"], y, m, s_, r_)
        unit_comparison[label] = {
            "factor_global": float(r_.sum() / s_.sum()),
            "monthly_median_abs_pct_error": res["monthly_median_abs_pct_error"],
            "annual_mean_abs_pct_error": res["annual_mean_abs_pct_error"],
            "monthly_ratio_q10": res["monthly_ratio_q10"],
            "monthly_ratio_q90": res["monthly_ratio_q90"],
        }
    print("\nUnite :", {k: f"{v['monthly_median_abs_pct_error']:.1%} (facteur {v['factor_global']:.2f})" for k, v in unit_comparison.items()})

    # Diagnostic : stabilite du rapport d'une annee a l'autre
    yearly_ratio = []
    for year in sorted({int(i) // 12 for i in ym[valid[REFERENCE_CONFIG]]}):
        row = {"year": year}
        for c in ("TA", "A", "T", "N"):
            common = valid[c] & valid[REFERENCE_CONFIG] & (ym // 12 == year)
            den = cell_days[c][common].sum()
            row[c] = float(cell_days[REFERENCE_CONFIG][common].sum() / den) if den > 0 and common.sum() >= 180 else None
        yearly_ratio.append(row)

    # Diagnostic : le facteur national tient-il province par province ?
    province_idx = det["province"].to_numpy()
    province_transfer = []
    ta_factors = np.asarray(calibration["TA"]["factors_by_month"])
    common = valid["TA"] & valid[REFERENCE_CONFIG]
    for p in provinces:
        in_p = province_idx == p["index"]
        ta = hz.daily_cell_days(day, cell, eligible & in_p & np.isin(sat, CONFIGS["TA"]), n_days, n_cells)
        ref = hz.daily_cell_days(day, cell, eligible & in_p & np.isin(sat, CONFIGS[REFERENCE_CONFIG]), n_days, n_cells)
        pred = (ta_factors[cal_month - 1] * ta)[common].sum()
        actual = ref[common].sum()
        years = np.unique(ym[common] // 12)
        ann = [((ta_factors[cal_month - 1] * ta)[common & (ym // 12 == y)].sum(), ref[common & (ym // 12 == y)].sum()) for y in years]
        ape = [abs(a - b) / b for a, b in ann if b >= CV_MIN_REFERENCE]
        province_transfer.append(
            {
                "province": p["name"],
                "reference_cell_days": float(actual),
                "predicted_cell_days": float(pred),
                "ratio_reference_over_predicted": float(actual / pred) if pred > 0 else None,
                "annual_median_abs_pct_error": float(np.median(ape)) if ape else None,
                "years_scored": len(ape),
            }
        )

    # Table mensuelle nationale : sert de reference au test de coherence du moteur TypeScript
    month_ids = np.unique(ym[start:])
    national_monthly = []
    for i in month_ids:
        sel = (ym == i) & (np.arange(n_days) >= start)
        src_days = {c: int((source[sel] == r).sum()) for r, c in enumerate(RELAY_PRIORITY) if (source[sel] == r).any()}
        national_monthly.append(
            {
                "year": int(i // 12),
                "month": int(i % 12 + 1),
                "days": int(sel.sum()),
                "unobserved_days": int((source[sel] == -1).sum()),
                "source_days": src_days,
                "cell_days": {c: float(cell_days[c][sel].sum()) for c in CONFIGS},
                "detections": {s.key: int(all_counts[s.code][sel].sum()) for s in SATELLITES},
                "harmonized": float(harmonized[sel].sum()),
            }
        )

    built_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    harmonization = {
        "built_at": built_at,
        "unit": "cellules-jour actives, equivalent Suomi-NPP",
        "grid": {"lon0": GRID.lon0, "lat0": GRID.lat0, "step_deg": GRID.step, "ncols": GRID.ncols, "nrows": GRID.nrows},
        "eligibility": {"type": ELIGIBLE_TYPE, "modis_min_confidence_pct": MODIS_LOW_CONFIDENCE_BELOW, "viirs_classes": ["n", "h"]},
        "configs": {c: [SATELLITES[code].key for code in sats] for c, sats in CONFIGS.items()},
        "reference_config": REFERENCE_CONFIG,
        "relay_priority": list(RELAY_PRIORITY),
        "gap_rules": {**GAP_RULES, "witness_min_detections": GAP_WITNESS_MIN_DETECTIONS},
        "gaps": gaps,
        "relay_segments": hz.segments(source, start),
        "calibration": calibration,
        "calibration_settings": {
            "season_months": list(SEASON_MONTHS),
            "cv_min_reference": CV_MIN_REFERENCE,
            "parsimony_tolerance": PARSIMONY_TOLERANCE,
            "method": "rapport des sommes mensuelles sur les jours observes par les deux configurations ; validation en retirant une annee a la fois",
        },
        "diagnostics": {"unit_comparison": unit_comparison, "yearly_ratio": yearly_ratio, "province_transfer": province_transfer},
        "national_monthly": national_monthly,
    }

    # ---- Export binaire en colonnes
    n = len(det)
    column_meta = []
    offset = 0
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    with open(WEB_DATA_DIR / "detections.bin", "wb") as fh:
        for name, np_type, label in COLUMNS:
            arr = np.ascontiguousarray(det[name].to_numpy().astype(np_type))
            payload = arr.tobytes()
            fh.write(payload)
            column_meta.append({"name": name, "dtype": label, "offset": offset, "bytes": len(payload)})
            offset += len(payload)

    def stats_by(mask):
        return {s.key: int((mask & (sat == s.code)).sum()) for s in SATELLITES}

    type_arr = det["type"].to_numpy()
    cc = det["conf_class"].to_numpy()
    satellites_meta = []
    for s in SATELLITES:
        sel = sat == s.code
        satellites_meta.append(
            {
                "code": s.code, "key": s.key, "name": s.name, "sensor": s.sensor, "dataset": s.dataset,
                "file_value": s.file_value,
                "first_date": hz.day_to_date(day[sel].min()).isoformat(),
                "last_date": hz.day_to_date(day[sel].max()).isoformat(),
                "detections": int(sel.sum()),
                "eligible": int((sel & eligible).sum()),
                "by_type": {str(t): int((sel & (type_arr == t)).sum()) for t in (0, 1, 2, 3, 255) if (sel & (type_arr == t)).any()},
                "by_confidence_class": {k: int((sel & (cc == i)).sum()) for i, k in enumerate(("low", "nominal", "high"))},
                "night": int((sel & (det["night"].to_numpy() == 1)).sum()),
            }
        )

    write_json(
        WEB_DATA_DIR / "detections.meta.json",
        {
            "built_at": built_at,
            "count": n,
            "epoch": EPOCH.isoformat(),
            "first_day": int(day.min()),
            "last_day": int(day.max()),
            "columns": column_meta,
            "versions": versions,
            "satellites": satellites_meta,
            "provinces": [{"index": p["index"], "iso": p["iso"], "name": p["name"]} for p in provinces],
            "sources": [
                {k: f[k] for k in ("file", "dataset", "year", "url", "sha256", "bytes", "accessed_at", "rows_read", "rows_kept", "rows_rejected")}
                for f in per_file
            ],
        },
    )
    write_json(WEB_DATA_DIR / "harmonization.json", harmonization)
    write_json(
        WEB_DATA_DIR / "quality_log.json",
        {"built_at": built_at, "rows_read": total_read, "rows_kept": n, "rows_rejected": total_rejected, "rejects": rejects, "warnings": warnings},
    )
    write_json(
        WEB_DATA_DIR / "metadata.json",
        {
            "built_at": built_at,
            "data_kind": "real",
            "data_kind_label": "Donnees NASA FIRMS reelles (archives annuelles par pays), figees a la date d'acces indiquee",
            "country": manifest["country"],
            "coverage": {"first_date": hz.day_to_date(day.min()).isoformat(), "last_date": hz.day_to_date(day.max()).isoformat()},
            "rows": {"read": total_read, "kept": n, "rejected": total_rejected, "eligible": int(eligible.sum()), "outside_provinces": int((province_idx == -1).sum())},
            "by_satellite": stats_by(np.ones(n, dtype=bool)),
            "envelope": ENVELOPE,
            # Prolongement par l'API FIRMS (recent.py) : periodes SP et NRT, debut des donnees provisoires,
            # validation du masque de sources statiques. Absent si l'archive s'arrete aux fichiers annuels.
            "recent": manifest.get("recent"),
            "firms": {
                "base_url": manifest["firms_base_url"],
                "missing_years": manifest["firms_missing"],
                "accessed_first": min(f["accessed_at"] for f in sources),
                "accessed_last": max(f["accessed_at"] for f in sources),
            },
            "boundaries": manifest["boundaries"],
        },
    )

    # ---- Limites administratives pour la carte
    WEB_GEO_DIR.mkdir(parents=True, exist_ok=True)
    write_json(
        WEB_GEO_DIR / "provinces.geojson",
        {
            "type": "FeatureCollection",
            "features": [
                {"type": "Feature", "id": p["index"], "properties": {"index": p["index"], "iso": p["iso"], "name": p["name"]}, "geometry": p["geometry"]}
                for p in provinces
            ],
        },
    )
    country = json.loads((RAW_DIR / "boundaries" / f"geoboundaries_{PROFILE.iso}_ADM0_simplified.geojson").read_text("utf-8"))
    write_json(WEB_GEO_DIR / "country.geojson", {"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": PROFILE.name}, "geometry": f["geometry"]} for f in country["features"]]})

    print(f"\nEcrit : {n} detections ({offset / 1e6:.1f} Mo), {int(eligible.sum())} eligibles, {int((province_idx == -1).sum())} hors provinces")
    return 0


if __name__ == "__main__":
    sys.exit(main())
