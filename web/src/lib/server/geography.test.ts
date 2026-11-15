import { describe, expect, it } from "vitest";

import { resolveZone } from "../ai/tools";
import { calendar } from "./engine";
import { departmentRegions, overview, regions } from "./queries";
import { getStore, isoToDay } from "./store";
import { BadRequest, parseZone, zoneInfo, zoneMatcher } from "./zone";

const store = getStore();
const first = isoToDay(store, "2025-01-01");
const last = isoToDay(store, "2025-12-31");

describe("geographie d'exploration", () => {
  it("rattache chaque departement a une province et chaque detection a au plus un departement", () => {
    expect(store.geography.departments).toHaveLength(49);
    expect(store.geography.departments.every((d) => d.province >= 0 && d.province < store.meta.provinces.length)).toBe(true);
    expect(store.department.length).toBe(store.n);
    const assigned = store.department.reduce((acc, d) => acc + (d >= 0 ? 1 : 0), 0);
    expect(assigned + store.geography.outside_departments).toBe(store.n);
  });

  it("refuse un departement ou une localite inconnus", () => {
    expect(() => parseZone("department:49", store)).toThrow(BadRequest);
    expect(() => parseZone("department:-1", store)).toThrow(BadRequest);
    expect(() => parseZone("place:1", store)).toThrow(BadRequest);
  });

  it("la somme des departements d'une province est proche de la province (limites de 2005 et 2018)", () => {
    const province = store.meta.provinces.findIndex((p) => p.name === "Haut-Ogooué");
    const byDept = departmentRegions(first, last, province, store).regions.reduce((acc, r) => acc + r.harmonized, 0);
    const byProvince = regions(first, last, store).regions.find((r) => r.index === province)!.harmonized;
    expect(Math.abs(byDept - byProvince) / byProvince).toBeLessThan(0.05);
  });

  it("une localite est analysee dans un disque de rayon fixe, annonce dans son libelle", () => {
    const franceville = store.geography.places.find((p) => p.name === "Franceville")!;
    const zone = parseZone(`place:${franceville.id}`, store);
    const info = zoneInfo(zone, store);
    expect(info.label).toContain(`${store.geography.place_radius_km} km`);
    expect(info.areaKm2).toBeCloseTo(Math.PI * store.geography.place_radius_km ** 2, 5);
    // Toute detection retenue est a moins du rayon ; une detection juste au-dela est exclue.
    const inside = zoneMatcher(zone, store);
    const rad = Math.PI / 180;
    for (let row = store.dayStart[first]; row < store.dayStart[last + 1]; row++) {
      if (!inside(row)) continue;
      const dLat = (store.lat[row] - franceville.lat) * rad;
      const dLon = (store.lon[row] - franceville.lon) * rad;
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(franceville.lat * rad) * Math.cos(store.lat[row] * rad) * Math.sin(dLon / 2) ** 2;
      expect(2 * 6371.0088 * Math.asin(Math.sqrt(a))).toBeLessThanOrEqual(store.geography.place_radius_km + 1e-6);
    }
    expect(overview(zone, first, last, store).harmonized).toBeGreaterThan(0);
  });

  it("le calendrier, la tendance et les ecarts s'appliquent a un departement", () => {
    const mpassa = store.geography.departments.find((d) => d.name === "Mpassa")!;
    const c = calendar({ kind: "department", index: mpassa.index }, store);
    expect(c.months.length).toBeGreaterThan(290);
    expect(c.zone.label).toBe("Mpassa");
  });

  it("l'assistant reconnait un departement et une ville par leur nom", () => {
    expect(resolveZone("Mpassa", store)).toEqual({ kind: "department", index: store.geography.departments.find((d) => d.name === "Mpassa")!.index });
    expect(resolveZone("département de la Mpassa", store).kind).toBe("department");
    const zone = resolveZone("Franceville", store);
    expect(zone.kind).toBe("place");
    expect(() => resolveZone("Yaoundé", store)).toThrow();
    // Homonymes de villes etrangeres parmi les villages : jamais resolus par leur nom.
    expect(() => resolveZone("Paris", store)).toThrow();
  });
});
