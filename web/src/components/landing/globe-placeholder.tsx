/** Sphere d'attente du globe de l'accueil : meme place et meme lumiere, en fondu a l'arrivee du vrai globe. */
export function GlobePlaceholder({ visible = true }: { visible?: boolean }) {
  return (
    <div
      aria-hidden
      className={`globe-placeholder absolute left-1/2 top-1/2 aspect-square w-[78%] max-w-[760px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-1000 ${visible ? "opacity-100" : "opacity-0"}`}
    />
  );
}

/** Cellule active du globe : longitude et latitude du centre, intensite relative (0 a 1). */
export type GlowCell = [number, number, number];
