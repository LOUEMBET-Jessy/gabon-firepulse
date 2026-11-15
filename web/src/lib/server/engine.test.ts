import { describe, expect, it } from "vitest";

import { assessWindow, calendar, summarizeRange, zoneDaily } from "./engine";
import { detectionDetail, overview, queryDetections, queryGrid, regions, type DetectionFilter } from "./queries";
import { getStore, isoToDay } from "./store";
import { parseZone, BadRequest } from "./zone";

const store = getStore();
const country = { kind: "country" } as const;

describe("coherence avec le pipeline Python", () => {
  it("reproduit la table mensuelle nationale calculee independamment", () => {
    const months = calendar(country, store).months;
    const reference = store.harmonization.national_monthly;
    expect(months.length).toBe(reference.length);
    let worst = 0;
    for (let i = 0; i < months.length; i++) {
      const a = months[i];
      const b = reference[i];
      expect([a.year, a.month, a.days, a.unobservedDays]).toEqual([b.year, b.month, b.days, b.unobserved_days]);
      expect(a.cellDays).toEqual(b.cell_days);
      expect(a.detections).toEqual(b.detections);
      worst = Math.max(worst, Math.abs(a.harmonized - b.harmonized));
    }
    expect(worst).toBeLessThan(1e-6);
  });

  it("retrouve le nombre total de detections du fichier", () => {
    const daily = zoneDaily(country, store);
    const sum = summarizeRange(daily, store.firstDay, store.lastDay, store);
    const total = Object.values(sum.detections).reduce((a, b) => a + b, 0);
    expect(total).toBe(store.n);
    expect(total).toBe(store.metadata.rows.kept);
  });
});

describe("regles d'harmonisation", () => {
  it("n'alimente chaque jour que par une seule configuration", () => {
    const daily = zoneDaily(country, store);
    for (let d = store.firstDay; d <= store.lastDay; d += 37) {
      const source = store.sourceOfDay[d];
      const expected = source < 0 ? 0 : store.nationalFactors[source][store.monthOfDay[d] - 1] * daily.cellDays[source][d];
      expect(daily.harmonized[d]).toBeCloseTo(expected, 9);
    }
  });

  it("laisse Suomi-NPP intact les jours ou il sert de reference", () => {
    const daily = zoneDaily(country, store);
    const d = isoToDay(store, "2019-08-15");
    expect(store.sourceOfDay[d]).toBe(3); // S
    expect(daily.harmonized[d]).toBe(daily.cellDays[3][d]);
  });

  it("relaie par NOAA-20 pendant l'interruption de Suomi-NPP de 2022", () => {
    const d = isoToDay(store, "2022-08-01");
    expect(store.sourceOfDay[d]).toBe(4); // N
    const august = calendar(country, store).months.find((m) => m.year === 2022 && m.month === 8)!;
    expect(august.kind).toBe("relayed");
    expect(august.complete).toBe(true);
  });

  it("ne compte jamais une cellule deux fois le meme jour", () => {
    const daily = zoneDaily(country, store);
    const cells = store.harmonization.grid.ncols * store.harmonization.grid.nrows;
    for (let d = store.firstDay; d <= store.lastDay; d += 11) {
      for (const series of daily.cellDays) expect(series[d]).toBeLessThanOrEqual(cells);
      // Terra + Aqua ne peut pas depasser la somme des deux, ni etre inferieur au plus grand.
      expect(daily.cellDays[2][d]).toBeLessThanOrEqual(daily.cellDays[0][d] + daily.cellDays[1][d]);
      expect(daily.cellDays[2][d]).toBeGreaterThanOrEqual(Math.max(daily.cellDays[0][d], daily.cellDays[1][d]));
    }
  });

  it("additionne les provinces sans depasser le pays", () => {
    const first = isoToDay(store, "2023-01-01");
    const last = isoToDay(store, "2023-12-31");
    const national = summarizeRange(zoneDaily(country, store), first, last, store).harmonized;
    const r = regions(first, last, store);
    const sum = r.regions.reduce((a, x) => a + x.harmonized, 0);
    // Une cellule a cheval sur deux provinces compte dans chacune : la somme peut depasser legerement.
    expect(sum).toBeGreaterThan(national * 0.9);
    expect(sum).toBeLessThan(national * 1.1);
  });
});

describe("calage ajuste a la zone", () => {
  const first = isoToDay(store, "2012-02-01");
  const last = isoToDay(store, "2025-12-31");

  it("laisse les facteurs nationaux inchanges pour le pays entier", () => {
    const c = calendar(country, store).calibration;
    expect(c.local).toBe(false);
    expect(c.configs.TA!.k).toBe(1);
    expect(c.configs.S).toBeNull();
  });

  it("rapproche MODIS cale de VIIRS dans chaque province, sur la periode commune", () => {
    const national = store.nationalFactors[2];
    for (const p of store.meta.provinces) {
      const zone = { kind: "province", index: p.index } as const;
      const daily = zoneDaily(zone, store);
      const entry = daily.calibration.configs.TA!;
      let ref = 0, before = 0;
      for (let d = first; d <= last; d++) {
        if (!store.operating[0][d] || !store.operating[1][d] || !store.operating[2][d]) continue;
        ref += daily.cellDays[3][d];
        before += national[store.monthOfDay[d] - 1] * daily.cellDays[2][d];
      }
      const after = before * entry.k;
      // L'ecart apres correction est plus petit qu'avant, sans depasser la cible (ajustement partiel).
      expect(Math.abs(after - ref)).toBeLessThan(Math.abs(before - ref) + 1e-9);
      expect(entry.k).toBeGreaterThan(0.5);
      expect(entry.k).toBeLessThan(2.2);
    }
  });

  it("reste proche du facteur national dans une zone presque vide", () => {
    const zone = parseZone("bbox:8.6,1.8,8.9,2.1", store);
    const entry = zoneDaily(zone, store).calibration.configs.TA!;
    expect(entry.referenceCellDays).toBeLessThan(50);
    expect(Math.abs(entry.k - 1)).toBeLessThan(0.25);
    expect(entry.verified).toBe(false);
  });

  it("abaisse la fiabilite des valeurs estimees quand le calage local est inverifiable", () => {
    const zone = parseZone("bbox:8.6,1.8,8.9,2.1", store);
    const estimated = calendar(zone, store).months.filter(
      (m) => m.estimatedShare > 0.5 && m.complete && m.assessment.status !== "insufficient",
    );
    expect(estimated.length).toBeGreaterThan(0);
    expect(estimated.every((m) => m.assessment.reliability === "low")).toBe(true);
  });
});

describe("anomalies", () => {
  it("exclut l'annee evaluee de sa propre reference", () => {
    const months = calendar(country, store).months;
    const m = months.find((x) => x.year === 2024 && x.month === 8)!;
    const sameMonth = months.filter((x) => x.month === 8 && x.complete).length;
    expect(m.assessment.referenceCount).toBe(sameMonth - 1);
  });

  it("n'evalue pas un mois incompletement observe", () => {
    const june2001 = calendar(country, store).months.find((x) => x.year === 2001 && x.month === 6)!;
    expect(june2001.complete).toBe(false);
    expect(june2001.assessment.status).toBe("incomplete");
  });

  it("ne compare pas une fenetre de plus d'un an", () => {
    expect(assessWindow(country, isoToDay(store, "2020-01-01"), isoToDay(store, "2021-06-30"), store)).toBeNull();
  });

  it("compare une fenetre aux memes dates des autres annees", () => {
    const w = assessWindow(country, isoToDay(store, "2024-07-01"), isoToDay(store, "2024-08-31"), store)!;
    expect(w.referenceYears).not.toContain(2024);
    expect(w.referenceCount).toBeGreaterThanOrEqual(20);
  });
});

describe("requetes", () => {
  const first = isoToDay(store, "2025-01-01");
  const last = isoToDay(store, "2025-12-31");
  const all: DetectionFilter = { zone: country, first, last, sats: [true, true, true, true], conf: [true, true, true], types: "all", dayNight: "all" };

  it("filtre par satellite sans melanger les capteurs", () => {
    const viirs = queryDetections({ ...all, sats: [false, false, true, false], conf: [true, true, true] }, store);
    expect(viirs.bySatellite.terra + viirs.bySatellite.aqua + viirs.bySatellite.noaa20).toBe(0);
    expect(viirs.points!.sat.every((s) => s === 2)).toBe(true);
    expect(viirs.total).toBe(store.meta.sources.find((s) => s.file === "viirs-snpp_2025_Gabon.csv")!.rows_kept);
  });

  it("respecte la periode et la zone", () => {
    const zone = parseZone("bbox:13,-2.5,14.5,-1", store);
    const res = queryDetections({ ...all, zone }, store);
    expect(res.total).toBeGreaterThan(0);
    const p = res.points!;
    for (let i = 0; i < p.lon.length; i += 17) {
      expect(p.lon[i]).toBeGreaterThanOrEqual(13);
      expect(p.lon[i]).toBeLessThanOrEqual(14.5);
      expect(p.lat[i]).toBeGreaterThanOrEqual(-2.5);
      expect(p.lat[i]).toBeLessThanOrEqual(-1);
      expect(p.day[i]).toBeGreaterThanOrEqual(first);
      expect(p.day[i]).toBeLessThanOrEqual(last);
    }
  });

  it("refuse d'envoyer plus de points que le plafond, sans echantillonner", () => {
    const res = queryDetections({ ...all, first: store.firstDay, last: store.lastDay }, store);
    expect(res.truncated).toBe(true);
    expect(res.points).toBeNull();
    expect(res.total).toBe(store.n);
  });

  it("rend une fiche qui renvoie a la ligne source", () => {
    const res = queryDetections(all, store);
    const detail = detectionDetail(res.points!.index[0], store)!;
    expect(detail.source.file).toMatch(/_2025_Gabon\.csv$/);
    expect(detail.source.line).toBeGreaterThan(1);
    expect(detail.source.sha256).toHaveLength(64);
    expect(detail.acqDatetimeUtc).toMatch(/^2025-\d\d-\d\dT\d\d:\d\d:00Z$/);
    expect(detectionDetail(-1, store)).toBeNull();
    expect(detectionDetail(store.n, store)).toBeNull();
  });

  it("donne une grille dont la somme egale l'indice de la periode", () => {
    const grid = queryGrid(country, first, last, store);
    const sum = grid.cells.reduce((a, c) => a + c.harmonized, 0);
    const o = overview(country, first, last, store);
    expect(Math.abs(sum - o.harmonized)).toBeLessThan(o.harmonized * 1e-3);
    expect(o.activeCells).toBe(grid.cells.length);
  });

  it("rejette une zone invalide", () => {
    expect(() => parseZone("bbox:10,1,9,2", store)).toThrow(BadRequest);
    expect(() => parseZone("bbox:-50,1,9,2", store)).toThrow(BadRequest);
    expect(() => parseZone("province:99", store)).toThrow(BadRequest);
    expect(() => parseZone("ailleurs", store)).toThrow(BadRequest);
  });
});
