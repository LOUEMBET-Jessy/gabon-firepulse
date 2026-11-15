/**
 * Theme de l'interface : clair par defaut, sombre « vert nuit » en option.
 * Sans choix explicite, la preference du systeme s'applique (CSS prefers-color-scheme).
 * Le choix est garde dans le navigateur (localStorage, toujours dans un try/catch) et pose
 * sur <html data-theme> avant le premier affichage, pour eviter tout clignotement.
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "hotspot.theme";
/** Evenement emis sur window quand le theme change : les cartes et canevas relisent leurs couleurs. */
export const THEME_EVENT = "hotspot:theme";

/** Script en ligne du <head> : applique le choix memorise avant le rendu. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

/** Theme effectivement affiche (choix explicite, sinon preference du systeme). */
export function currentTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "dark" || explicit === "light") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* stockage indisponible : le choix vaut pour cette page seulement */
  }
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: theme }));
}

/** Abonnement aux changements de theme (choix de l'utilisateur ou du systeme). */
export function subscribeTheme(notify: () => void): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", notify);
  window.addEventListener(THEME_EVENT, notify);
  return () => {
    media.removeEventListener("change", notify);
    window.removeEventListener(THEME_EVENT, notify);
  };
}
