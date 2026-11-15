"use client";

/**
 * Chiffre qui se compte a son apparition : la valeur finale est rendue cote serveur (lisible sans JavaScript,
 * par les lecteurs d'ecran et les moteurs), l'animation ne fait que la rejouer. Statique si les animations sont limitees.
 */

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

const FORMAT = new Intl.NumberFormat("fr-FR");

export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || reduce) return;
    const controls = animate(0, value, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => (node.textContent = FORMAT.format(Math.round(v))),
    });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return (
    <span ref={ref} className={className}>
      {FORMAT.format(value)}
    </span>
  );
}
