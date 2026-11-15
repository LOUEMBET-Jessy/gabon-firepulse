"""Prolongement par l'API FIRMS (recent.py) : format, etendue, type de source deduit.

Lancement : python -m unittest discover -s pipeline/tests -v
Aucun appel reseau : les lignes imitent exactement le format NRT publie par FIRMS.
"""

from __future__ import annotations

import io
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import recent as R  # noqa: E402
from hotspot.ingest import validate_and_normalize  # noqa: E402

# Format NRT VIIRS de FIRMS : pas de colonne « instrument » ni « type », confiance en toutes lettres.
NRT_VIIRS = """latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight
-1.6333,13.5836,330.1,0.4,0.4,2026-11-10,0130,N20,nominal,2.0NRT,290.1,3.2,N
-0.7110,8.7650,340.0,0.4,0.4,2026-11-10,0130,N20,high,2.0NRT,295.0,9.0,N
-0.2000,8.3000,320.0,0.4,0.4,2026-11-10,0130,N20,low,2.0NRT,285.0,1.0,N
45.0000,2.0000,320.0,0.4,0.4,2026-11-10,0130,N20,low,2.0NRT,285.0,1.0,N
"""
NRT_MODIS = """latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight
-1.6333,13.5836,320.1,1.0,1.0,2026-11-10,0945,A,85,6.1NRT,290.1,12.4,D
"""


class RecentTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.land = R.land_geometry()
        # Masque minimal : un site statique connu pres de Port-Gentil.
        cls.mask = R.static_mask(pd.DataFrame({"latitude": [-0.7110, -0.7111], "longitude": [8.7650, 8.7652], "type": [2, 2], "year": [2024, 2025]}), 2025)
        cls.cells = set()

    def test_type_deduit_statique_mer_vegetation(self):
        lon = np.array([13.5836, 8.7650, 8.3000])
        lat = np.array([-1.6333, -0.7110, -0.2000])
        self.assertEqual(R.infer_type(lon, lat, self.mask, self.land).tolist(), [0, 2, 3])

    def test_format_archive_et_controle_qualite(self):
        raw = pd.read_csv(io.StringIO(NRT_VIIRS), dtype=str, keep_default_na=False)
        table, stats = R.to_archive_format(raw, "VIIRS", self.mask, self.land, self.cells)
        # Le point en France est hors du Gabon ; le point en mer n'est garde que s'il tombe dans l'etendue de l'archive.
        self.assertEqual(stats["kept"], 2)
        self.assertEqual(list(table.columns), R.ARCHIVE_COLUMNS["VIIRS"])
        self.assertEqual(table["instrument"].unique().tolist(), ["VIIRS"])
        self.assertEqual(sorted(table["confidence"].tolist()), ["h", "n"])
        df = table.copy()
        df["_line"] = np.arange(2, len(df) + 2)
        det, rejects, _warnings, _total = validate_and_normalize(df, "VIIRS", 0, "test.csv")
        self.assertEqual(len(rejects), 0)
        self.assertEqual(len(det), 2)

    def test_satellite_modis_abrege(self):
        raw = pd.read_csv(io.StringIO(NRT_MODIS), dtype=str, keep_default_na=False)
        table, _ = R.to_archive_format(raw, "MODIS", self.mask, self.land, self.cells)
        self.assertEqual(table["satellite"].tolist(), ["Aqua"])
        self.assertEqual(table["type"].tolist(), ["0"])


if __name__ == "__main__":
    unittest.main()
