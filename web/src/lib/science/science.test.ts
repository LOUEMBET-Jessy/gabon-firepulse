import { describe, expect, it } from "vitest";

import { ANOMALY_SETTINGS, assess, criticalMonths } from "./anomaly";
import { mad, median, percentileRank, quantile, theilSenMannKendall } from "./stats";

describe("statistiques robustes", () => {
  it("calcule mediane, quantiles et MAD", () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(quantile([0, 10], 0.25)).toBe(2.5);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
    expect(Number.isNaN(median([]))).toBe(true);
  });

  it("calcule le rang centile avec ex aequo", () => {
    expect(percentileRank([1, 2, 3, 4], 5)).toBe(100);
    expect(percentileRank([1, 2, 3, 4], 0)).toBe(0);
    expect(percentileRank([1, 2, 2, 3], 2)).toBe(50);
  });

  it("detecte une tendance monotone et ignore une serie plate", () => {
    const years = Array.from({ length: 12 }, (_, i) => 2010 + i);
    const up = theilSenMannKendall(years, years.map((y) => (y - 2010) * 10 + 100))!;
    expect(up.slope).toBeCloseTo(10, 9);
    expect(up.tau).toBe(1);
    expect(up.pValue).toBeLessThan(0.001);
    const flat = theilSenMannKendall(years, years.map(() => 50))!;
    expect(flat.slope).toBe(0);
    expect(flat.pValue).toBeGreaterThan(0.9);
    expect(theilSenMannKendall([2020, 2021], [1, 2])).toBeNull();
  });
});

describe("evaluation d'une periode", () => {
  const reference = [100, 110, 90, 105, 95, 102, 98, 107, 93, 101, 99, 104];
  const base = { reference, complete: true, estimatedShare: 0, terraOnlyShare: 0 };

  it("classe une valeur proche de la mediane comme normale", () => {
    const a = assess({ ...base, value: 103 });
    expect(a.status).toBe("normal");
    expect(a.median).toBe(100.5);
    expect(a.reliability).toBe("high");
  });

  it("signale une activite tres superieure a la reference", () => {
    const a = assess({ ...base, value: 200 });
    expect(a.status).toBe("strong_high");
    expect(a.robustZ!).toBeGreaterThan(ANOMALY_SETTINGS.thresholdStrong);
    expect(a.percentile).toBe(100);
    expect(a.ratioToMedian).toBeCloseTo(200 / 100.5, 9);
  });

  it("signale une activite inferieure avec la reserve sur les nuages", () => {
    const a = assess({ ...base, value: 40 });
    expect(a.status).toBe("low");
    expect(a.caveats.join(" ")).toMatch(/nuageuse/);
  });

  it("refuse de conclure avec trop peu d'annees", () => {
    const a = assess({ ...base, reference: [100, 110, 90], value: 500 });
    expect(a.status).toBe("insufficient");
    expect(a.robustZ).toBeNull();
  });

  it("refuse d'evaluer une periode incomplete", () => {
    expect(assess({ ...base, value: 500, complete: false }).status).toBe("incomplete");
  });

  it("ne qualifie pas une activite negligeable", () => {
    const a = assess({ ...base, reference: reference.map(() => 1), value: 3 });
    expect(a.status).toBe("low_activity");
  });

  it("gere une reference sans dispersion", () => {
    const zeros = reference.map(() => 0);
    expect(assess({ ...base, reference: zeros, value: 12 }).status).toBe("high");
    expect(assess({ ...base, reference: zeros, value: 12 }).robustZ).toBeNull();
    const mostlyFlat = [10, 10, 10, 10, 10, 10, 10, 10, 10, 30, 40, 50];
    const a = assess({ ...base, reference: mostlyFlat, value: 80 });
    expect(a.scaleSource).toBe("iqr");
  });

  it("abaisse la fiabilite d'une estimation MODIS", () => {
    expect(assess({ ...base, value: 200, estimatedShare: 1 }).reliability).toBe("moderate");
    expect(assess({ ...base, value: 200, estimatedShare: 1, terraOnlyShare: 1 }).reliability).toBe("low");
  });
});

describe("mois critiques", () => {
  it("retient le plus petit ensemble de mois couvrant 80 % de l'activite", () => {
    expect(criticalMonths([1, 1, 1, 1, 1, 10, 40, 40, 5, 0, 0, 0])).toEqual([7, 8]);
    expect(criticalMonths(new Array(12).fill(0))).toEqual([]);
  });
});
