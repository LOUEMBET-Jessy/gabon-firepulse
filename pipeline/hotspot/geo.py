"""Etape D - Espace commun : grille reguliere et rattachement aux provinces."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from .config import Grid


def cell_index(lon: np.ndarray, lat: np.ndarray, grid: Grid) -> np.ndarray:
    """Indice de cellule (ligne * ncols + colonne). -1 hors grille.

    Le petit epsilon evite qu'une coordonnee posee exactement sur une limite
    de cellule bascule d'un cote ou de l'autre selon l'arrondi flottant.
    """
    col = np.floor((np.asarray(lon, dtype=float) - grid.lon0) / grid.step + 1e-9).astype(np.int64)
    row = np.floor((np.asarray(lat, dtype=float) - grid.lat0) / grid.step + 1e-9).astype(np.int64)
    inside = (col >= 0) & (col < grid.ncols) & (row >= 0) & (row < grid.nrows)
    return np.where(inside, row * grid.ncols + col, -1).astype(np.int32)


def _rings(geometry: dict) -> list[np.ndarray]:
    polygons = geometry["coordinates"] if geometry["type"] == "MultiPolygon" else [geometry["coordinates"]]
    return [np.asarray(ring, dtype=float)[:, :2] for polygon in polygons for ring in polygon]


def points_in_geometry(lon: np.ndarray, lat: np.ndarray, geometry: dict) -> np.ndarray:
    """Test point-dans-polygone (regle pair-impair, trous compris), vectorise."""
    lon = np.asarray(lon, dtype=float)
    lat = np.asarray(lat, dtype=float)
    rings = _rings(geometry)
    all_pts = np.vstack(rings)
    candidates = (
        (lon >= all_pts[:, 0].min()) & (lon <= all_pts[:, 0].max()) & (lat >= all_pts[:, 1].min()) & (lat <= all_pts[:, 1].max())
    )
    inside = np.zeros(len(lon), dtype=bool)
    idx = np.flatnonzero(candidates)
    if idx.size == 0:
        return inside
    x, y = lon[idx], lat[idx]
    crossings = np.zeros(idx.size, dtype=bool)
    for ring in rings:
        x1, y1 = ring[:-1, 0], ring[:-1, 1]
        x2, y2 = ring[1:, 0], ring[1:, 1]
        for ax, ay, bx, by in zip(x1, y1, x2, y2):
            if ay == by:
                continue
            straddle = (ay > y) != (by > y)
            x_at_y = ax + (y - ay) * (bx - ax) / (by - ay)
            crossings ^= straddle & (x < x_at_y)
    inside[idx] = crossings
    return inside


def load_provinces(path: Path) -> list[dict]:
    """Charge les provinces geoBoundaries (ADM1) avec un identifiant stable."""
    collection = json.loads(path.read_text("utf-8"))
    provinces = []
    for feature in collection["features"]:
        props = feature["properties"]
        name = str(props.get("shapeName", "")).strip()
        iso = str(props.get("shapeISO", "")).strip()
        provinces.append({"iso": iso, "name": name, "geometry": feature["geometry"]})
    provinces.sort(key=lambda p: p["name"])
    for i, province in enumerate(provinces):
        province["index"] = i
    return provinces


def assign_provinces(lon: np.ndarray, lat: np.ndarray, provinces: list[dict]) -> np.ndarray:
    """Indice de province par point, -1 si le point n'est dans aucun polygone."""
    out = np.full(len(lon), -1, dtype=np.int8)
    for province in provinces:
        mask = points_in_geometry(lon, lat, province["geometry"]) & (out == -1)
        out[mask] = province["index"]
    return out
