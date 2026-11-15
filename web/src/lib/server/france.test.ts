import { describe, expect, it } from "vitest";

import { resolveZone, validateContext } from "../ai/tools";
import { calendar } from "./engine";
import { overview, regions } from "./queries";
import { getStore, isoToDay } from "./store";
import { BadRequest, parseZone } from "./zone";

const fra = getStore("FRA");
const gab = getStore("GAB");

describe("archive de la France metropolitaine", () => {
  it("charge une archive propre, avec ses regions, departements et villes", () => {
    expect(fra.country).toBe("FRA");
    expect(fra.countryName).toBe("France métropolitaine");
    expect(fra.meta.provinces).toHaveLength(13);
    expect(fra.geography.departments).toHaveLength(96);
    expect(fra.geography.departments.every((d) => d.province >= 0 && d.province < 13)).toBe(true);
    expect(fra.n).toBeGreaterThan(300_000);
    // Les sources industrielles (type 2) sont nombreuses en France : l'indice n'en garde aucune.
    let eligibleStatic = 0;
    for (let row = 0; row < fra.n; row++) if (fra.eligible[row] && fra.type[row] !== 0) eligibleStatic++;
    expect(eligibleStatic).toBe(0);
  });

  it("ne melange jamais les deux pays, meme pour la meme zone « pays entier »", () => {
    const first = isoToDay(fra, "2025-01-01");
    const last = isoToDay(fra, "2025-12-31");
    const a = overview({ kind: "country" }, first, last, fra);
    const b = overview({ kind: "country" }, isoToDay(gab, "2025-01-01"), isoToDay(gab, "2025-12-31"), gab);
    expect(a.zone.label).toBe("France métropolitaine");
    expect(b.zone.label).toBe("Gabon");
    expect(a.harmonized).not.toBe(b.harmonized);
    expect(calendar({ kind: "country" }, fra).zone.label).toBe("France métropolitaine");
    expect(calendar({ kind: "country" }, gab).zone.label).toBe("Gabon");
  });

  it("calcule un calage MODIS vers VIIRS valide hors echantillon", () => {
    const ta = fra.harmonization.calibration.TA!;
    expect(ta.validation.annual_mean_abs_pct_error).toBeLessThan(0.25);
    expect(ta.overlap_first_year).toBe(2012);
  });

  it("repere l'ete 2022 en Gironde comme tres superieur a la reference", () => {
    const gironde = fra.geography.departments.find((d) => d.name === "Gironde")!;
    const o = overview({ kind: "department", index: gironde.index }, isoToDay(fra, "2022-06-01"), isoToDay(fra, "2022-09-30"), fra);
    expect(o.window?.status).toBe("strong_high");
    const r = regions(isoToDay(fra, "2022-06-01"), isoToDay(fra, "2022-09-30"), fra);
    expect(r.regions.map((x) => x.name)).toContain("Nouvelle-Aquitaine");
  });

  it("valide les zones dans l'archive du bon pays", () => {
    expect(() => parseZone("department:96", fra)).toThrow(BadRequest);
    expect(() => parseZone("province:13", fra)).toThrow(BadRequest);
    expect(parseZone("department:95", fra)).toEqual({ kind: "department", index: 95 });
  });

  it("l'assistant lit le pays du contexte et reconnait les noms francais", () => {
    const ctx = validateContext({ page: "dashboard", country: "FRA", zone: { kind: "department", index: 30 }, from: "2022-06-01", to: "2022-09-30" });
    expect(ctx.country).toBe("FRA");
    expect(ctx.zone).toEqual({ kind: "department", index: 30 });
    expect(resolveZone("Gironde", fra).kind).toBe("department");
    expect(resolveZone("Bordeaux", fra).kind).toBe("place");
    expect(resolveZone("France", fra)).toEqual({ kind: "country" });
    expect(() => resolveZone("Gironde", gab)).toThrow();
  });
});
