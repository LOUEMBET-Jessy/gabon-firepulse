"""Tests du traitement scientifique. Lancement : python -m unittest discover -s pipeline/tests -v

Couvrent les tests d'acceptation T-01 a T-03 du cahier des charges (import MODIS,
import VIIRS, ligne invalide) et les regles d'harmonisation.
"""

from __future__ import annotations

import io
import sys
import unittest
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from hotspot import harmonize as hz  # noqa: E402
from hotspot.config import EPOCH, GRID, SATELLITES  # noqa: E402
from hotspot.geo import cell_index, points_in_geometry  # noqa: E402
from hotspot.ingest import validate_and_normalize  # noqa: E402

MODIS_HEADER = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type"
VIIRS_HEADER = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type"


def frame(header: str, rows: list[str]) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO("\n".join([header, *rows])), dtype=str, keep_default_na=False)
    df["_line"] = np.arange(2, len(df) + 2)
    return df


class ImportTests(unittest.TestCase):
    def test_t01_modis_valide(self):
        df = frame(MODIS_HEADER, ["-0.8648,12.6561,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,7.5,D,0"])
        out, rejects, warnings, n_rejected = validate_and_normalize(df, "MODIS", 3, "modis_test.csv")
        self.assertEqual((len(out), n_rejected, rejects, warnings), (1, 0, [], []))
        row = out.iloc[0]
        self.assertEqual(row["sat"], 1)  # Aqua
        self.assertEqual(row["version"], "61.03")  # version native conservee telle quelle
        self.assertEqual(row["conf_native"], 65)
        self.assertEqual(row["conf_class"], 1)  # nominale
        self.assertEqual(row["src"], 3)
        self.assertEqual(row["line"], 2)  # renvoi a la ligne du fichier source
        self.assertEqual(row["day"], (date(2023, 1, 10) - EPOCH).days)
        self.assertEqual(row["time"], 1305)

    def test_t02_viirs_valide_sans_fusion_avec_modis(self):
        df = frame(VIIRS_HEADER, ["0.25555,13.09954,296.24,0.54,0.51,2023-01-01,0005,N,VIIRS,n,2,274.57,0.49,N,2"])
        out, _, _, n_rejected = validate_and_normalize(df, "VIIRS", 0, "viirs_test.csv")
        self.assertEqual(n_rejected, 0)
        row = out.iloc[0]
        self.assertEqual(row["sat"], 2)  # Suomi-NPP, distinct des codes MODIS 0 et 1
        self.assertEqual(row["conf_native"], 255)  # pas de pourcentage invente pour VIIRS
        self.assertEqual(row["conf_class"], 1)
        self.assertEqual(row["night"], 1)
        self.assertEqual(row["type"], 2)

    def test_t03_lignes_invalides_rejetees_et_journalisees(self):
        rows = [
            "-0.5,12.0,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,7.5,D,0",  # valide
            "abc,12.0,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,7.5,D,0",  # latitude illisible
            "95.0,12.0,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,7.5,D,0",  # latitude impossible
            "48.85,2.35,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,7.5,D,0",  # hors emprise
            "-0.5,12.0,311.7,1.2,1.1,2023-02-30,1305,Aqua,MODIS,65,61.03,293.2,7.5,D,0",  # date inexistante
            "-0.5,12.0,311.7,1.2,1.1,2023-01-10,2575,Aqua,MODIS,65,61.03,293.2,7.5,D,0",  # heure impossible
            "-0.5,12.0,311.7,1.2,1.1,2023-01-10,1305,N20,MODIS,65,61.03,293.2,7.5,D,0",  # satellite incoherent
            "-0.5,12.0,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,140,61.03,293.2,7.5,D,0",  # confiance hors plage
            "-0.5,12.0,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,7.5,X,0",  # jour/nuit invalide
            "-0.5,12.0,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,7.5,D,0",  # doublon de la premiere
        ]
        out, rejects, _, n_rejected = validate_and_normalize(frame(MODIS_HEADER, rows), "MODIS", 0, "modis_test.csv")
        self.assertEqual(len(out), 1)
        self.assertEqual(n_rejected, 9)
        reasons = [r["reason"] for r in rejects]
        self.assertEqual(
            reasons,
            [
                "coordonnees non numeriques", "coordonnees hors plage valide", "coordonnees hors emprise attendue",
                "date d'acquisition invalide", "heure d'acquisition invalide", "satellite incoherent avec le jeu de donnees",
                "confiance invalide", "indicateur jour/nuit invalide", "doublon technique",
            ],
        )
        self.assertEqual([r["line"] for r in rejects], list(range(3, 12)))
        self.assertEqual(rejects[0]["raw"]["latitude"], "abc")  # la valeur d'origine est conservee dans le journal

    def test_champ_optionnel_illisible_marque_indisponible(self):
        df = frame(MODIS_HEADER, ["-0.5,12.0,311.7,1.2,1.1,2023-01-10,1305,Aqua,MODIS,65,61.03,293.2,,D,0"])
        out, rejects, warnings, _ = validate_and_normalize(df, "MODIS", 0, "modis_test.csv")
        self.assertEqual(len(out), 1)
        self.assertTrue(np.isnan(out.iloc[0]["frp"]))  # pas de zero invente
        self.assertEqual(warnings[0]["field"], "frp")

    def test_colonne_manquante_arrete_l_import(self):
        df = frame("latitude,longitude", ["-0.5,12.0"])
        with self.assertRaises(ValueError):
            validate_and_normalize(df, "MODIS", 0, "incomplet.csv")

    def test_classes_de_confiance_modis(self):
        from hotspot.ingest import confidence_class_modis

        self.assertEqual(list(confidence_class_modis(np.array([0, 29, 30, 79, 80, 100]))), [0, 0, 1, 1, 2, 2])


class GeoTests(unittest.TestCase):
    def test_cellule_de_la_grille(self):
        idx = cell_index(np.array([8.5, 8.549, 8.55, 14.69, 20.0]), np.array([-4.0, -4.0, -3.95, 2.49, 0.0]), GRID)
        self.assertEqual(list(idx[:3]), [0, 0, GRID.ncols + 1])
        self.assertEqual(idx[3], (GRID.nrows - 1) * GRID.ncols + GRID.ncols - 1)
        self.assertEqual(idx[4], -1)  # hors grille

    def test_point_dans_polygone_avec_trou(self):
        geometry = {
            "type": "Polygon",
            "coordinates": [
                [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
                [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
            ],
        }
        inside = points_in_geometry(np.array([1.0, 5.0, 11.0, 9.5]), np.array([1.0, 5.0, 5.0, 9.5]), geometry)
        self.assertEqual(list(inside), [True, False, False, True])


class HarmonizationTests(unittest.TestCase):
    def test_cellule_jour_compte_une_seule_fois(self):
        day = np.array([0, 0, 0, 1, 1])
        cell = np.array([7, 7, 8, 7, 7])
        mask = np.ones(5, dtype=bool)
        self.assertEqual(list(hz.daily_cell_days(day, cell, mask, 2, 100)), [2.0, 1.0])
        self.assertEqual(list(hz.daily_counts(day, mask, 2)), [3.0, 2.0])

    def test_facteur_retrouve_un_rapport_connu(self):
        month = np.tile(np.arange(1, 13), 6)
        year = np.repeat(np.arange(2012, 2018), 12)
        source = np.random.default_rng(1).uniform(50, 200, size=72)
        reference = 3.0 * source
        self.assertTrue(np.allclose(hz.fit_factors("global", month, source, reference), 3.0))
        result = hz.cross_validate("global", year, month, source, reference)
        self.assertLess(result["monthly_median_abs_pct_error"], 1e-9)
        self.assertAlmostEqual(result["annual_ratio_min"], 1.0)

    def test_modele_simple_prefere_sans_gain_net(self):
        results = {"global": {"monthly_median_abs_pct_error": 0.150}, "season": {"monthly_median_abs_pct_error": 0.145}, "month": {"monthly_median_abs_pct_error": 0.120}}
        self.assertEqual(hz.select_model(results), "month")
        results["month"]["monthly_median_abs_pct_error"] = 0.142
        self.assertEqual(hz.select_model(results), "global")

    def test_interruption_signalee_seulement_si_le_temoin_a_vu_quelque_chose(self):
        n = 400
        _, _ = hz.calendar_arrays(n)
        cal_month, _ = hz.calendar_arrays(n)
        counts = {s.code: np.full(n, 50.0) for s in SATELLITES}
        counts[2][100:110] = 0  # Suomi-NPP muet dix jours, NOAA-20 voit toujours des feux : interruption
        counts[2][200:210] = 0  # Suomi-NPP muet...
        counts[3][200:210] = 0  # ...et NOAA-20 aussi : nuages probables, pas une interruption
        first = {s.code: 0 for s in SATELLITES}
        gaps = [g for g in hz.find_gaps(counts, first, n - 1, cal_month) if g["satellite"] == "snpp"]
        self.assertEqual([(g["start_day"], g["end_day"]) for g in gaps], [(100, 109)])

    def test_relais_un_seul_capteur_par_jour(self):
        n = 10
        valid = {c: np.zeros(n, dtype=bool) for c in ("T", "A", "TA", "S", "N")}
        valid["T"][:] = True
        valid["TA"][3:] = True
        valid["A"][3:] = True
        valid["S"][6:] = True
        valid["S"][8] = False
        valid["N"][7:] = True
        source = hz.relay_sources(valid, n)
        names = [hz.RELAY_PRIORITY[i] for i in source]
        self.assertEqual(names, ["T", "T", "T", "TA", "TA", "TA", "S", "S", "N", "S"])


if __name__ == "__main__":
    unittest.main()
