// Copie le worker MapLibre dans public/ pour qu'il soit servi depuis la meme origine (fonctionne hors ligne).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/dist/maplibre-gl.css"));
const out = path.join(import.meta.dirname, "..", "public", "vendor");
mkdirSync(out, { recursive: true });
copyFileSync(path.join(dist, "maplibre-gl-worker.mjs"), path.join(out, "maplibre-gl-worker.mjs"));
console.log("worker MapLibre copie dans public/vendor/");
