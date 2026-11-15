"use client";

import { Desktop, Moon, Sun } from "@phosphor-icons/react/dist/ssr";
import { useCallback, useEffect, useSyncExternalStore } from "react";

import { cx } from "@/components/ui";

export type ThemePref = "light" | "dark" | "system";
const KEY = "firepulse.theme";
const EVENT = "firepulse:theme";

function readPref(): ThemePref {
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "light";
  } catch {
    return "light";
  }
}

function resolve(pref: ThemePref): "light" | "dark" {
  if (pref !== "system") return pref;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function apply(pref: ThemePref, animate: boolean) {
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (animate && !reduce) {
    root.classList.add("theme-switching");
    window.setTimeout(() => root.classList.remove("theme-switching"), 320);
  }
  root.dataset.theme = resolve(pref);
}

function subscribe(notify: () => void) {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
}

/** Bascule clair / sombre / systeme. Le choix est memorise dans ce navigateur. */
export function ThemeToggle() {
  const pref = useSyncExternalStore<ThemePref>(subscribe, readPref, () => "light");

  // Suit la preference du systeme tant que l'utilisateur n'a pas fait de choix explicite.
  useEffect(() => {
    if (pref !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => apply("system", true);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [pref]);

  const choose = useCallback((next: ThemePref) => {
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* stockage indisponible : le theme s'applique pour cette page seulement */
    }
    apply(next, true);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const options: { value: ThemePref; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Thème clair", icon: <Sun size={15} weight="bold" /> },
    { value: "dark", label: "Thème sombre", icon: <Moon size={15} weight="bold" /> },
    { value: "system", label: "Thème du système", icon: <Desktop size={15} weight="bold" /> },
  ];

  return (
    <div role="radiogroup" aria-label="Thème d'affichage" className="hidden h-9 sm:flex items-center rounded-control border border-line-strong bg-surface-2 p-0.5">
      {options.map((o) => {
        const active = pref === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => choose(o.value)}
            className={cx(
              "flex h-7 w-8 items-center justify-center rounded-[6px] transition-colors",
              active ? "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--color-line-strong)]" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
