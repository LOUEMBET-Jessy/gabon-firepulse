"use client";

import { Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { useSyncExternalStore } from "react";

import { cx } from "@/lib/classes";
import { currentTheme, setTheme, subscribeTheme } from "@/lib/theme";

/**
 * Bascule clair / sombre. Le rendu serveur ne connait pas le theme : il affiche un bouton neutre,
 * le libelle exact apparait apres l'hydratation (aucun ecart d'hydratation).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const next = theme === "dark" ? "light" : "dark";
  const label = theme === null ? "Changer de thème" : theme === "dark" ? "Passer au thème clair" : "Passer au thème sombre";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={label}
      title={label}
      className={cx(
        "flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-surface text-ink-2 transition-colors hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {theme === "dark" ? <Sun size={17} weight="bold" /> : <Moon size={17} weight="bold" />}
    </button>
  );
}
