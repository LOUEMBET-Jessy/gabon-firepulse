"""Parametres du traitement. Toute valeur ici est une hypothese de conception
documentee dans l'application (page Methode), pas une prescription de la NASA."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
RAW_DIR = ROOT / "data" / "raw"
WEB_DATA_DIR = ROOT / "web" / "data"
WEB_GEO_DIR = ROOT / "web" / "public" / "geo"

EPOCH = date(2000, 1, 1)  # jour 0 de l'index temporel


@dataclass(frozen=True)
class Grid:
    """Grille reguliere commune en degres (WGS84)."""

    lon0: float = 8.5
    lat0: float = -4.0
    step: float = 0.05  # ~5,5 km a l'equateur
    ncols: int = 124  # 8,5 -> 14,7
    nrows: int = 130  # -4,0 -> 2,5


GRID = Grid()

# Emprise attendue pour le controle qualite (Gabon + marge). Une coordonnee
# valide mais hors emprise est rejetee et journalisee, jamais corrigee.
ENVELOPE = {"lon_min": 8.0, "lon_max": 15.0, "lat_min": -4.5, "lat_max": 3.0}


@dataclass(frozen=True)
class Satellite:
    code: int
    key: str
    name: str
    sensor: str
    dataset: str
    file_value: str
    first_day: date


SATELLITES = [
    Satellite(0, "terra", "Terra", "MODIS", "modis", "Terra", date(2000, 11, 1)),
    Satellite(1, "aqua", "Aqua", "MODIS", "modis", "Aqua", date(2002, 7, 4)),
    Satellite(2, "snpp", "Suomi-NPP", "VIIRS", "viirs-snpp", "N", date(2012, 1, 20)),
    Satellite(3, "noaa20", "NOAA-20", "VIIRS", "viirs-jpss1", "N20", date(2018, 4, 1)),
]
SAT_BY_FILE_VALUE = {s.file_value: s for s in SATELLITES}

# Configurations d'observation utilisees pour l'indice harmonise.
# Chaque configuration est calee sur la reference (Suomi-NPP seul).
CONFIGS: dict[str, tuple[int, ...]] = {
    "T": (0,),  # Terra seul
    "A": (1,),  # Aqua seul
    "TA": (0, 1),  # Terra + Aqua
    "S": (2,),  # Suomi-NPP (reference)
    "N": (3,),  # NOAA-20
}
REFERENCE_CONFIG = "S"
# Ordre de priorite du relais jour par jour.
RELAY_PRIORITY = ("S", "N", "TA", "A", "T")

# Regle d'eligibilite a l'indice de brulage.
ELIGIBLE_TYPE = 0  # 0 = feu de vegetation presume (codes du produit MCD14ML)
MODIS_LOW_CONFIDENCE_BELOW = 30  # % ; classes du guide utilisateur MODIS (Giglio et al.)

# Detection des interruptions d'observation (voir harmonize.find_gaps).
# Une serie de jours consecutifs sans aucune detection d'un satellite est
# consideree comme une interruption si elle est assez longue ET si le nombre
# de detections attendu sur ces jours (climatologie du satellite) est eleve.
# Un silence en saison humide, ou peu de detections sont attendues, n'est donc
# pas signale : il n'aurait de toute facon presque aucun effet sur l'indice.
GAP_RULES = {
    "VIIRS": {"min_days": 3, "min_expected": 30.0},
    "MODIS": {"min_days": 5, "min_expected": 50.0},
}
# Temoin : si l'autre satellite VIIRS, en service, a lui aussi presque rien vu
# pendant ces jours, la cause probable est la couverture nuageuse, pas une panne.
GAP_WITNESS_MIN_DETECTIONS = 10

# Calage.
CALIBRATION_MODELS = ("global", "season", "month")
SEASON_MONTHS = (6, 7, 8, 9)  # groupe "saison seche" du modele a deux facteurs
CV_MIN_REFERENCE = 20  # un mois compte dans l'erreur s'il a >= 20 cellules-jour de reference
PARSIMONY_TOLERANCE = 0.01  # un modele plus complexe doit gagner > 1 point d'erreur mediane
