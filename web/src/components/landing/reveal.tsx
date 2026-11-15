"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Apparition a l'entree dans la fenetre : guide la lecture section par section.
 * Le rendu serveur et le premier rendu client sont identiques (etat initial masque) ; si l'utilisateur limite
 * les animations, l'apparition est instantanee (duree nulle) au lieu d'etre supprimee, ce qui evite tout ecart d'hydratation.
 */
export function Reveal({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={reduce ? { duration: 0 } : { duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
