/**
 * Couleurs fixes de Hot-Spots, hors theme : celles que lisent MapLibre et les canevas (qui ne comprennent
 * pas les variables CSS), et celles qui doivent etre identiques partout (satellites, echelle feu sur les cartes).
 * Les couleurs de l'interface (fonds, textes, etats) sont des jetons CSS dans src/app/globals.css :
 * les composants passent par `token()` ou par les classes Tailwind, jamais par un code couleur.
 */

/** Identite des satellites : carte, legendes, graphiques, globe. Identique dans les deux themes. */
export const SATELLITE_HEX = {
  modis: "#e4572e",
  snpp: "#2f7fd8",
  noaa20: "#13a08a",
  noaa21: "#8e5cd9",
} as const;

/** Echelle sequentielle feu (faible -> fort), pour les cartes ou elle est posee sur l'imagerie satellite. */
export const FIRE_HEX = ["#fff3c4", "#fdd27a", "#f9a03f", "#e8641e", "#c2361a", "#7f1d12"] as const;

/** Sept classes d'activite sur la carte : l'echelle feu, avec un pas intermediaire entre fire-4 et fire-5. */
export const FIRE_CLASSES_HEX = ["#fff3c4", "#fdd27a", "#f9a03f", "#e8641e", "#d24d1b", "#c2361a", "#7f1d12"] as const;

/** Elements poses sur les fonds de carte. */
export const MAP_HEX = {
  /** Contour des points de detection : blanc, pour rester lisible sur l'imagerie. */
  pointStroke: "#ffffff",
  /** Contours administratifs sur l'imagerie satellite (blanc, opacite reglee a part). */
  boundaryOnImagery: "#ffffff",
  /** Contours administratifs sur le plan (vert foret). */
  boundaryOnPlan: "#1f6b45",
  /** Zone selectionnee, surlignage. */
  selection: "#f9d65c",
  /** Halo sombre des etiquettes et des symboles. */
  halo: "#0b1a12",
  /** Fond du plan (sous les tuiles vectorielles) et ombrage du relief. */
  planBackground: "#f2efe6",
  hillshadeShadow: "#1b2a1f",
  hillshadeHighlight: "#ffffff",
  /** Repli hors ligne : ocean et terres si aucune tuile ne repond. */
  fallbackOcean: "#c9dde6",
  fallbackLand: "#e7e3d4",
  fallbackLandFocus: "#d8e6cf",
  fallbackBorder: "#9aa99a",
  /** Ciel et atmosphere du globe (projection globe). */
  sky: "#9fd3f5",
  horizon: "#d7ecfa",
  fog: "#0b1a2c",
  space: "#050b14",
} as const;

/** Valeurs RVB (« r g b ») des couleurs ci-dessus, pour les canevas qui dosent l'opacite. */
export const hexToRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

/** Satellites dessines en orbite (canevas) : etiquettes et corps des engins. */
export const CANVAS_RGB = {
  label: "255 255 255",
  labelMuted: "214 226 218",
} as const;
export const CANVAS_HEX = {
  body: "#23342a",
  panel: "#f4f7f4",
} as const;

/** Lit la valeur courante d'un jeton CSS (theme clair ou sombre) ; repli si on est cote serveur. */
export function token(name: string, fallback = "#000000"): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(`--color-${name}`).trim();
  return value || fallback;
}

/** Reference CSS a un jeton, pour les attributs SVG et les styles en ligne (suit le theme sans re-rendu). */
export const cssVar = (name: string) => `var(--color-${name})`;
