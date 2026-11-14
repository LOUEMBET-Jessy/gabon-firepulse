"""Etapes E et F - Temps commun, calage inter-capteurs et indice harmonise.

Unite commune : la cellule-jour active. Une cellule de la grille compte une
fois par jour des qu'au moins une detection eligible y tombe, quel que soit le
nombre de pixels signales. Cela neutralise l'effet de la taille de pixel
(VIIRS signale plusieurs pixels la ou MODIS en signale un).

Indice harmonise : cellules-jour actives exprimees en equivalent Suomi-NPP.
Chaque jour est alimente par une seule configuration d'observation (relais),
ce qui exclut tout double comptage entre capteurs.
"""

from __future__ import annotations

from datetime import timedelta

import numpy as np

from .config import (
    CALIBRATION_MODELS,
    CONFIGS,
    CV_MIN_REFERENCE,
    EPOCH,
    GAP_RULES,
    GAP_WITNESS_MIN_DETECTIONS,
    PARSIMONY_TOLERANCE,
    REFERENCE_CONFIG,
    RELAY_PRIORITY,
    SATELLITES,
    SEASON_MONTHS,
)


# --------------------------------------------------------------------------- calendrier


def day_to_date(day: int):
    return EPOCH + timedelta(days=int(day))


def calendar_arrays(n_days: int) -> tuple[np.ndarray, np.ndarray]:
    """Pour chaque jour : mois calendaire (1-12) et indice de mois (annee*12 + mois-1)."""
    months = np.empty(n_days, dtype=np.int16)
    ym = np.empty(n_days, dtype=np.int32)
    for d in range(n_days):
        date = day_to_date(d)
        months[d] = date.month
        ym[d] = date.year * 12 + date.month - 1
    return months, ym


# --------------------------------------------------------------------------- agregats journaliers


def daily_cell_days(day: np.ndarray, cell: np.ndarray, mask: np.ndarray, n_days: int, n_cells: int) -> np.ndarray:
    """Nombre de cellules distinctes actives par jour parmi les detections retenues."""
    keys = np.unique(day[mask].astype(np.int64) * n_cells + cell[mask].astype(np.int64))
    return np.bincount(keys // n_cells, minlength=n_days).astype(np.float64)


def daily_counts(day: np.ndarray, mask: np.ndarray, n_days: int) -> np.ndarray:
    return np.bincount(day[mask], minlength=n_days).astype(np.float64)


# --------------------------------------------------------------------------- interruptions


def _zero_runs(counts: np.ndarray, start: int, end: int) -> list[tuple[int, int]]:
    runs = []
    d = start
    while d <= end:
        if counts[d] == 0:
            e = d
            while e + 1 <= end and counts[e + 1] == 0:
                e += 1
            runs.append((d, e))
            d = e + 1
        else:
            d += 1
    return runs


def find_gaps(all_counts: dict[int, np.ndarray], first_day: dict[int, int], last_day: int, cal_month: np.ndarray) -> list[dict]:
    """Repere les interruptions d'observation probables, satellite par satellite."""
    gaps: list[dict] = []
    for sat in SATELLITES:
        counts = all_counts[sat.code]
        start = first_day[sat.code]
        rule = GAP_RULES[sat.sensor]
        # Climatologie : detections moyennes par jour pour chaque mois calendaire.
        rate = np.zeros(13)
        for m in range(1, 13):
            sel = cal_month[start : last_day + 1] == m
            rate[m] = counts[start : last_day + 1][sel].mean() if sel.any() else 0.0
        witness = next((s for s in SATELLITES if s.sensor == sat.sensor == "VIIRS" and s.code != sat.code), None)
        for a, b in _zero_runs(counts, start, last_day):
            length = b - a + 1
            expected = float(rate[cal_month[a : b + 1]].sum())
            if length < rule["min_days"] or expected < rule["min_expected"]:
                continue
            witness_count = None
            if witness is not None and a >= first_day[witness.code]:
                witness_count = int(all_counts[witness.code][a : b + 1].sum())
                if witness_count < GAP_WITNESS_MIN_DETECTIONS:
                    continue  # l'autre VIIRS n'a rien vu non plus : nuages probables
            gaps.append(
                {
                    "satellite": sat.key,
                    "start_day": int(a),
                    "end_day": int(b),
                    "start": day_to_date(a).isoformat(),
                    "end": day_to_date(b).isoformat(),
                    "days": int(length),
                    "expected_detections": round(expected, 1),
                    "witness": witness.key if witness_count is not None else None,
                    "witness_detections": witness_count,
                }
            )
    return gaps


def operating_mask(gaps: list[dict], first_day: dict[int, int], n_days: int) -> dict[int, np.ndarray]:
    out = {}
    for sat in SATELLITES:
        mask = np.zeros(n_days, dtype=bool)
        mask[first_day[sat.code] :] = True
        for gap in gaps:
            if gap["satellite"] == sat.key:
                mask[gap["start_day"] : gap["end_day"] + 1] = False
        out[sat.code] = mask
    return out


# --------------------------------------------------------------------------- calage


def _group_of(model: str, month: np.ndarray) -> np.ndarray:
    if model == "global":
        return np.zeros(len(month), dtype=np.int64)
    if model == "season":
        return np.isin(month, SEASON_MONTHS).astype(np.int64)
    return month.astype(np.int64) - 1  # "month"


def fit_factors(model: str, month: np.ndarray, source: np.ndarray, reference: np.ndarray) -> np.ndarray:
    """Facteurs par mois calendaire (12 valeurs) : rapport des sommes reference / source."""
    total = reference.sum() / source.sum() if source.sum() > 0 else np.nan
    groups = _group_of(model, month)
    factors = np.full(12, total)
    for m in range(1, 13):
        g = _group_of(model, np.array([m]))[0]
        sel = groups == g
        if source[sel].sum() > 0:
            factors[m - 1] = reference[sel].sum() / source[sel].sum()
    return factors


def cross_validate(model: str, year: np.ndarray, month: np.ndarray, source: np.ndarray, reference: np.ndarray) -> dict:
    """Validation en retirant une annee a la fois (les facteurs ne voient jamais l'annee testee)."""
    predicted = np.zeros(len(source))
    for y in np.unique(year):
        test = year == y
        factors = fit_factors(model, month[~test], source[~test], reference[~test])
        predicted[test] = factors[month[test] - 1] * source[test]

    scored = reference >= CV_MIN_REFERENCE
    ape = np.abs(predicted[scored] - reference[scored]) / reference[scored]
    ratio = reference[scored] / np.where(predicted[scored] > 0, predicted[scored], np.nan)
    ratio = ratio[np.isfinite(ratio)]
    years = np.unique(year)
    annual_pred = np.array([predicted[year == y].sum() for y in years])
    annual_ref = np.array([reference[year == y].sum() for y in years])
    annual_ape = np.abs(annual_pred - annual_ref) / annual_ref
    corr = float(np.corrcoef(predicted, reference)[0, 1]) if len(source) > 2 and predicted.std() > 0 else float("nan")
    return {
        "model": model,
        "months_scored": int(scored.sum()),
        "monthly_median_abs_pct_error": float(np.median(ape)) if ape.size else float("nan"),
        "monthly_mean_abs_pct_error": float(ape.mean()) if ape.size else float("nan"),
        "monthly_bias_pct": float((predicted[scored].sum() - reference[scored].sum()) / reference[scored].sum()) if scored.any() else float("nan"),
        "monthly_ratio_q10": float(np.quantile(ratio, 0.10)) if ratio.size else float("nan"),
        "monthly_ratio_q90": float(np.quantile(ratio, 0.90)) if ratio.size else float("nan"),
        "monthly_correlation": corr,
        "annual_mean_abs_pct_error": float(annual_ape.mean()),
        "annual_max_abs_pct_error": float(annual_ape.max()),
        "annual_ratio_min": float((annual_ref / annual_pred).min()),
        "annual_ratio_max": float((annual_ref / annual_pred).max()),
        "annual": [
            {"year": int(y), "predicted": float(p), "reference": float(r)} for y, p, r in zip(years, annual_pred, annual_ref)
        ],
    }


def select_model(results: dict[str, dict]) -> str:
    """Parcimonie : un modele plus complexe n'est retenu que s'il gagne nettement."""
    best = CALIBRATION_MODELS[0]
    for model in CALIBRATION_MODELS[1:]:
        if results[model]["monthly_median_abs_pct_error"] < results[best]["monthly_median_abs_pct_error"] - PARSIMONY_TOLERANCE:
            best = model
    return best


def monthly_pairs(source_daily: np.ndarray, reference_daily: np.ndarray, common: np.ndarray, ym: np.ndarray):
    """Sommes mensuelles sur les seuls jours ou les deux configurations observent."""
    ids = np.unique(ym[common])
    src = np.array([source_daily[common & (ym == i)].sum() for i in ids])
    ref = np.array([reference_daily[common & (ym == i)].sum() for i in ids])
    return ids // 12, ids % 12 + 1, src, ref


def calibrate(cell_days: dict[str, np.ndarray], valid: dict[str, np.ndarray], ym: np.ndarray) -> dict:
    """Cale chaque configuration sur la reference et mesure l'erreur hors echantillon."""
    out = {}
    for config in CONFIGS:
        if config == REFERENCE_CONFIG:
            continue
        common = valid[config] & valid[REFERENCE_CONFIG]
        year, month, src, ref = monthly_pairs(cell_days[config], cell_days[REFERENCE_CONFIG], common, ym)
        results = {m: cross_validate(m, year, month, src, ref) for m in CALIBRATION_MODELS}
        chosen = select_model(results)
        out[config] = {
            "model": chosen,
            "factors_by_month": [float(v) for v in fit_factors(chosen, month, src, ref)],
            "overlap_first_year": int(year.min()),
            "overlap_last_year": int(year.max()),
            "overlap_days": int(common.sum()),
            "overlap_months": int(len(src)),
            "validation": results[chosen],
            "candidates": {
                m: {k: v for k, v in r.items() if k != "annual"} for m, r in results.items()
            },
        }
    return out


# --------------------------------------------------------------------------- relais


def relay_sources(valid: dict[str, np.ndarray], n_days: int) -> np.ndarray:
    """Configuration retenue chaque jour (indice dans RELAY_PRIORITY), -1 si aucune n'observe."""
    source = np.full(n_days, -1, dtype=np.int8)
    for rank in range(len(RELAY_PRIORITY) - 1, -1, -1):
        source[valid[RELAY_PRIORITY[rank]]] = rank
    return source


def harmonized_daily(cell_days: dict[str, np.ndarray], source: np.ndarray, calibration: dict, cal_month: np.ndarray) -> np.ndarray:
    out = np.zeros(len(source))
    for rank, config in enumerate(RELAY_PRIORITY):
        sel = source == rank
        if not sel.any():
            continue
        if config == REFERENCE_CONFIG:
            out[sel] = cell_days[config][sel]
        else:
            factors = np.asarray(calibration[config]["factors_by_month"])
            out[sel] = factors[cal_month[sel] - 1] * cell_days[config][sel]
    return out


def segments(source: np.ndarray, first: int) -> list[dict]:
    """Compresse la chronologie journaliere des sources en intervalles."""
    out = []
    d = first
    n = len(source)
    while d < n:
        e = d
        while e + 1 < n and source[e + 1] == source[d]:
            e += 1
        out.append(
            {
                "config": RELAY_PRIORITY[source[d]] if source[d] >= 0 else None,
                "start_day": int(d),
                "end_day": int(e),
                "start": day_to_date(d).isoformat(),
                "end": day_to_date(e).isoformat(),
            }
        )
        d = e + 1
    return out
