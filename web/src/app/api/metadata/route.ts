import { ANOMALY_SETTINGS } from "@/lib/science/anomaly";
import { handle } from "@/lib/server/http";
import { COUNTRIES, dayToIso } from "@/lib/server/store";
import type { MetadataResponse } from "@/lib/types";

/** Sources, dates disponibles, produits, bilan qualite et parametres de la methode. */
export function GET(request: Request) {
  return handle(request, (_params, store): MetadataResponse => {
    const h = store.harmonization;
    return {
      dataKind: store.metadata.data_kind,
      dataKindLabel: store.metadata.data_kind_label,
      builtAt: store.metadata.built_at,
      country: store.metadata.country,
      countryCode: store.country,
      countryName: store.countryName,
      geoUrl: COUNTRIES[store.country].geoUrl,
      level1: store.country === "FRA" ? { one: "région", many: "régions" } : { one: "province", many: "provinces" },
      coverage: { firstDate: dayToIso(store, store.firstDay), lastDate: dayToIso(store, store.lastDay) },
      rows: store.metadata.rows,
      satellites: store.meta.satellites,
      provinces: store.meta.provinces.map((p) => ({ ...p, areaKm2: store.provinceAreaKm2[p.index] })),
      countryAreaKm2: store.countryAreaKm2,
      departments: store.geography.departments.map((d) => ({ ...d, areaKm2: store.departmentAreaKm2[d.index] })),
      towns: store.geography.towns.map((id) => store.placeById.get(id)!),
      placeRadiusKm: store.geography.place_radius_km,
      geography: { sources: store.geography.sources, outsideDepartments: store.geography.outside_departments },
      versions: store.meta.versions,
      sources: store.meta.sources,
      missingYears: store.metadata.firms.missing_years,
      accessed: { first: store.metadata.firms.accessed_first, last: store.metadata.firms.accessed_last },
      boundaries: store.metadata.boundaries,
      quality: { rejects: store.quality.rejects, warnings: store.quality.warnings },
      harmonization: {
        unit: h.unit,
        grid: h.grid,
        eligibility: h.eligibility,
        configs: h.configs,
        referenceConfig: h.reference_config,
        relayPriority: h.relay_priority,
        gapRules: h.gap_rules,
        gaps: h.gaps,
        relaySegments: h.relay_segments,
        calibration: h.calibration,
        settings: h.calibration_settings,
        diagnostics: h.diagnostics,
      },
      anomalySettings: ANOMALY_SETTINGS,
    };
  });
}
