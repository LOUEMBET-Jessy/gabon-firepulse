/**
 * Controle des contrastes WCAG 2.2 des jetons de couleur (src/app/globals.css), themes clair et sombre.
 * Texte : >= 4,5:1. Elements graphiques (traits de graphiques, points de carte) : >= 3:1.
 * Usage : node scripts/contrast.mjs   (code de sortie 1 si une paire echoue)
 */

import fs from "node:fs";
import path from "node:path";

const css = fs.readFileSync(path.join(import.meta.dirname, "..", "src", "app", "globals.css"), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) out[m[1]] = m[2];
  return out;
}
const light = tokens(css.slice(css.indexOf("@theme"), css.indexOf("@keyframes fade-up")));
const darkBlock = css.slice(css.indexOf(':root[data-theme="dark"] {'));
const dark = { ...light, ...tokens(darkBlock.slice(0, darkBlock.indexOf("}"))) };

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = ["ink", "ink-2", "ink-3", "accent", "leaf-ink", "critical", "warning", "good", "info"];
const SURFACES = ["bg", "surface", "surface-2", "surface-3"];
// Marques graphiques (courbes, points, barres) : toujours dessinees sur les cartes blanches (surface), contour blanc sur les cartes.
const GRAPHIC = ["modis", "snpp", "noaa20", "noaa21", "fire-4", "ember", "lagoon"];
const EXTRA = [
  ["accent-ink", "accent", 4.5],
  ["accent-ink", "accent-strong", 4.5],
  ["forest-ink", "forest", 4.5],
  ["forest-ink-2", "forest", 4.5],
  ["space-ink", "space", 4.5],
  ["space-ink-2", "space", 4.5],
];

let failures = 0;
for (const [name, theme] of [["clair", light], ["sombre", dark]]) {
  const rows = [];
  for (const fg of TEXT) for (const bg of SURFACES) rows.push([fg, bg, 4.5]);
  for (const fg of GRAPHIC) rows.push([fg, "surface", 3]);
  rows.push(...EXTRA);
  console.log(`\nThème ${name}`);
  for (const [fg, bg, min] of rows) {
    if (!theme[fg] || !theme[bg]) continue;
    const r = ratio(theme[fg], theme[bg]);
    const ok = r >= min;
    if (!ok) failures++;
    if (!ok || process.argv.includes("--all")) console.log(`  ${ok ? "ok    " : "ÉCHEC "} ${fg.padEnd(13)} sur ${bg.padEnd(13)} ${r.toFixed(2)}:1 (min ${min})`);
  }
  console.log(`  ${rows.length} paires contrôlées`);
}
console.log(failures ? `\n${failures} paire(s) sous le seuil` : "\nToutes les paires respectent WCAG 2.2 AA");
process.exit(failures ? 1 : 0);
