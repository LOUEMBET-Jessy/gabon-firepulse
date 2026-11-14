import { calendar } from "@/lib/server/engine";
import { BadRequest, handle, parseDetectionFilter } from "@/lib/server/http";
import { detectionDetail, matchingRows } from "@/lib/server/queries";
import { dayToIso, type Store } from "@/lib/server/store";
import { parseZone, zoneKey } from "@/lib/server/zone";

const GEOJSON_CAP = 100_000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(header: string[], rows: Iterable<unknown[]>): string {
  const lines = [header.join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function download(body: string, type: string, filename: string): Response {
  return new Response(body, {
    headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" },
  });
}

const slug = (text: string) => text.replace(/[^a-zA-Z0-9.-]+/g, "_");

function* detectionRows(params: URLSearchParams, store: Store): Generator<unknown[]> {
  const filter = parseDetectionFilter(params, store);
  for (const row of matchingRows(filter, store)) {
    const d = detectionDetail(row, store)!;
    yield [
      d.source.recordId, d.sensor, d.platform, d.version, d.acqDatetimeUtc, d.lat, d.lon, d.confidenceNative.split(" ")[0], d.confidenceClass,
      d.frp, d.brightness, d.brightness2, d.scan, d.track, d.night ? "N" : "D", d.type, d.eligible ? 1 : 0, d.cell.index, d.province,
      d.source.file, d.source.line, d.source.url, d.source.accessedAt,
    ];
  }
}

const DETECTION_HEADER = [
  "source_record_id", "sensor", "platform", "version_native", "acq_datetime_utc", "latitude", "longitude", "confidence_native", "confidence_class",
  "frp_mw", "brightness_k", "brightness2_k", "scan_km", "track_km", "daynight", "type", "in_harmonized_index", "grid_cell", "province",
  "source_file", "source_line", "source_url", "accessed_at_utc",
];

/** Export des donnees filtrees. kind = detections | monthly | anomalies ; format = csv | geojson. */
export function GET(request: Request) {
  return handle(request, (params, store) => {
    const kind = params.get("kind") ?? "detections";
    const format = params.get("format") ?? "csv";
    const zone = parseZone(params.get("zone"), store);
    const zoneSlug = slug(zoneKey(zone));

    if (kind === "detections") {
      const filter = parseDetectionFilter(params, store);
      const span = `${dayToIso(store, filter.first)}_${dayToIso(store, filter.last)}`;
      if (format === "csv") {
        return download(csv(DETECTION_HEADER, detectionRows(params, store)), "text/csv", `firepulse_detections_${zoneSlug}_${span}.csv`);
      }
      if (format === "geojson") {
        const features = [];
        for (const row of matchingRows(filter, store)) {
          if (features.length >= GEOJSON_CAP) {
            throw new BadRequest(`Plus de ${GEOJSON_CAP.toLocaleString("fr-FR")} détections : réduisez la période ou la zone, ou exportez en CSV.`);
          }
          const d = detectionDetail(row, store)!;
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [d.lon, d.lat] },
            properties: {
              source_record_id: d.source.recordId, sensor: d.sensor, platform: d.platform, acq_datetime_utc: d.acqDatetimeUtc,
              confidence_native: d.confidenceNative.split(" ")[0], confidence_class: d.confidenceClass, frp_mw: d.frp,
              daynight: d.night ? "N" : "D", type: d.type, in_harmonized_index: d.eligible, source_file: d.source.file, source_line: d.source.line,
            },
          });
        }
        const body = JSON.stringify({
          type: "FeatureCollection",
          metadata: {
            source: "NASA FIRMS, archives annuelles par pays (Gabon)",
            accessed_at_utc: store.metadata.firms.accessed_last,
            note: "Chaque point est le centre d'un pixel signalé comme contenant une anomalie thermique. Ce n'est ni un incendie confirmé ni une surface brûlée.",
          },
          features,
        });
        return download(body, "application/geo+json", `firepulse_detections_${zoneSlug}_${span}.geojson`);
      }
      throw new BadRequest("Format invalide : csv ou geojson.");
    }

    if (format !== "csv") throw new BadRequest("Ce jeu n'est disponible qu'en CSV.");
    const result = calendar(zone, store);

    if (kind === "monthly") {
      const header = [
        "zone", "year", "month", "harmonized_cell_days_snpp_equivalent", "low_10pct", "high_90pct", "origin", "complete", "days", "unobserved_days",
        "estimated_share", "reference_median", "reference_years", "robust_score", "percentile", "status", "reliability",
        "cell_days_terra", "cell_days_aqua", "cell_days_terra_aqua", "cell_days_snpp", "cell_days_noaa20",
        "detections_terra", "detections_aqua", "detections_snpp", "detections_noaa20", "data_accessed_at_utc",
      ];
      const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
      const rows = result.months.map((m) => [
        result.zone.label, m.year, m.month, r2(m.harmonized), r2(m.low), r2(m.high), m.kind, m.complete ? 1 : 0, m.days, m.unobservedDays,
        r2(m.estimatedShare), r2(m.assessment.median), m.assessment.referenceCount, r2(m.assessment.robustZ), r2(m.assessment.percentile),
        m.assessment.status, m.assessment.reliability, m.cellDays.T, m.cellDays.A, m.cellDays.TA, m.cellDays.S, m.cellDays.N,
        m.detections.terra, m.detections.aqua, m.detections.snpp, m.detections.noaa20, result.provenance.accessedAt,
      ]);
      return download(csv(header, rows), "text/csv", `firepulse_calendrier_mensuel_${zoneSlug}.csv`);
    }

    if (kind === "anomalies") {
      const header = [
        "zone", "year", "month", "status", "observed", "reference_median", "reference_q25", "reference_q75", "reference_years", "robust_score",
        "classic_z", "percentile", "ratio_to_median", "reliability", "origin", "caveats",
      ];
      const r2 = (v: number | null) => (v === null ? null : Math.round(v * 100) / 100);
      const rows = result.months
        .filter((m) => ["strong_high", "high", "low"].includes(m.assessment.status))
        .map((m) => {
          const a = m.assessment;
          return [
            result.zone.label, m.year, m.month, a.status, r2(a.value), r2(a.median), r2(a.q25), r2(a.q75), a.referenceCount, r2(a.robustZ),
            r2(a.classicZ), r2(a.percentile), r2(a.ratioToMedian), a.reliability, m.kind, a.caveats.join(" | "),
          ];
        });
      return download(csv(header, rows), "text/csv", `firepulse_periodes_inhabituelles_${zoneSlug}.csv`);
    }
    throw new BadRequest("Jeu inconnu : detections, monthly ou anomalies.");
  });
}
