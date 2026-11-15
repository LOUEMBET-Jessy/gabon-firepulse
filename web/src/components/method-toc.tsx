"use client";

import { useEffect, useState } from "react";

import { cx } from "@/components/ui";

/**
 * Sommaire de la page Methode. Sur ordinateur, il reste a cote du texte et suit la lecture
 * (section visible surlignee) ; sur telephone, c'est un ruban de liens qui defile horizontalement.
 */
export function MethodToc({ sections }: { sections: readonly (readonly [string, string])[] }) {
  const [active, setActive] = useState(sections[0]?.[0] ?? "");

  useEffect(() => {
    const targets = sections.map(([id]) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    // Une section devient active quand son haut passe dans le tiers superieur de l'ecran.
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -60% 0px" },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Sections de la page" className="no-print">
      {/* Telephone et tablette : ruban */}
      <ul className="no-scrollbar fade-x -mx-4 flex gap-1.5 overflow-x-auto px-4 xl:hidden">
        {sections.map(([id, label]) => (
          <li key={id} className="shrink-0">
            <a
              href={`#${id}`}
              className={cx(
                "block rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                active === id ? "border-accent/60 bg-accent/10 text-ink" : "border-line-strong bg-surface-2 text-ink-2 hover:text-ink",
              )}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
      {/* Ordinateur : sommaire fixe qui suit la lecture */}
      <ul className="sticky top-24 hidden flex-col border-l border-line xl:flex">
        <li className="pb-2 pl-4 text-[11.5px] font-medium text-ink-3">Sur cette page</li>
        {sections.map(([id, label]) => (
          <li key={id}>
            <a
              href={`#${id}`}
              aria-current={active === id ? "location" : undefined}
              className={cx(
                "-ml-px block border-l-2 py-1.5 pl-4 text-[13px] leading-snug transition-colors duration-200",
                active === id ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:border-line-strong hover:text-ink-2",
              )}
            >
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
