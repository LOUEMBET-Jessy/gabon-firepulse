// Donnees reelles du film, lues sur le serveur Hot-Spots et dans les fichiers NASA FIRMS d'origine.
// Aucune valeur inventee : series annuelles (detections retenues MODIS et VIIRS Suomi-NPP, indice harmonise),
// comptes de l'archive, et quelques lignes brutes des fichiers CSV FIRMS 2025 du Gabon.
// Usage : node film/tools/data.mjs <sortie.json>   (BASE_URL, defaut http://localhost:3220)
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL ?? "http://localhost:3220";
const get = async (url) => {
  const r = await fetch(base + url);
  if (!r.ok) throw new Error(`${url} : HTTP ${r.status}`);
  return r.json();
};

const cal = await get("/api/calendar?country=GAB&zone=country");
const byYear = new Map();
for (const m of cal.months) {
  const y = byYear.get(m.year) ?? { year: m.year, modis: 0, viirs: 0, months: 0 };
  y.modis += m.eligible.terra + m.eligible.aqua;
  y.viirs += m.eligible.snpp;
  y.months += m.complete ? 1 : 0;
  byYear.set(m.year, y);
}
const years = cal.years
  .filter((y) => y.complete && y.year >= 2003 && y.year <= 2025)
  .map((y) => ({ year: y.year, harmonized: Math.round(y.harmonized), modis: byYear.get(y.year).modis, viirs: byYear.get(y.year).viirs || null }));

const overview = await get("/api/overview?country=GAB&zone=country&from=2025-01-01&to=2025-12-31");
const fra = await get("/api/overview?country=FRA&zone=country&from=2025-01-01&to=2025-12-31");
const metaGab = await get("/api/metadata?country=GAB");
const metaFra = await get("/api/metadata?country=FRA");

// Lignes brutes FIRMS (une ligne sur 40 pour varier les lieux et les heures).
const raw = (file, n) => {
  const lines = fs.readFileSync(path.join("data", "raw", "firms", file), "utf8").split(/\r?\n/).filter(Boolean);
  return { header: lines[0], rows: lines.slice(1).filter((_, i) => i % 40 === 0).slice(0, n) };
};

const out = {
  source: "NASA FIRMS, archives Gabon et France métropolitaine, via le serveur Hot-Spots",
  years,
  gab2025: { harmonized: overview.harmonized, median: Math.round(overview.window?.median ?? 0), detections: overview.detections },
  fra2025: { harmonized: fra.harmonized, detections: fra.detections },
  archive: {
    gab: { rows: metaGab.rows ?? null, first: metaGab.coverage.firstDate, last: metaGab.coverage.lastDate },
    fra: { rows: metaFra.rows ?? null, first: metaFra.coverage.firstDate, last: metaFra.coverage.lastDate },
  },
  rawModis: raw("modis/modis_2025_Gabon.csv", 24),
  rawViirs: raw("viirs-snpp/viirs-snpp_2025_Gabon.csv", 24),
};
fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1));
console.log(`${years.length} années, Gabon 2025 : ${out.gab2025.harmonized} cellules-jour, médiane ${out.gab2025.median}`);
console.log("archive", JSON.stringify(out.archive));
