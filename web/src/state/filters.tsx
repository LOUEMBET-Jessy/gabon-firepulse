"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { setApiCountry } from "@/lib/api";
import { FILTERS_COOKIE, clampPeriod, initialFilters, type Coverage, type Coverages, type FiltersState } from "@/lib/filters-shared";
import type { ZoneSpec } from "@/lib/types";

export { defaultPeriod, type Coverage, type FiltersState } from "@/lib/filters-shared";

/**
 * Pays, zone et periode selectionnes, partages par tous les ecrans.
 * L'etat initial vient du cookie de session lu par le serveur : le premier rendu est le meme des deux cotes.
 */
interface FiltersContext extends FiltersState {
  coverage: Coverage;
  /** Toujours vrai : la selection est connue des le premier rendu (conserve pour les ecrans qui l'attendent). */
  restored: boolean;
  setZone: (zone: ZoneSpec) => void;
  setPeriod: (from: string, to: string) => void;
  /** Change de pays : la zone revient au pays entier (les provinces et departements ne se correspondent pas). */
  setCountry: (country: "GAB" | "FRA") => void;
}

const Context = createContext<FiltersContext | null>(null);

export function FiltersProvider({ coverages, initial, children }: { coverages: Coverages; initial?: unknown; children: React.ReactNode }) {
  const [state, setState] = useState<FiltersState>(() => initialFilters(initial, coverages));
  const coverage: Coverage = coverages[state.country];
  // Le pays est transmis aux adresses d'API avant le rendu des ecrans.
  setApiCountry(state.country);

  // Cookie de session : le prochain chargement de page est rendu par le serveur avec cette selection.
  useEffect(() => {
    try {
      document.cookie = `${FILTERS_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; path=/; SameSite=Lax`;
    } catch {
      /* cookies indisponibles : la selection vaut pour cette page seulement */
    }
  }, [state]);

  const setZone = useCallback((zone: ZoneSpec) => setState((s) => ({ ...s, zone })), []);
  // Changer de pays garde la periode si elle existe dans l'autre archive, sinon la borne a sa couverture.
  const setCountry = useCallback(
    (country: "GAB" | "FRA") => setState((s) => (s.country === country ? s : { ...s, country, zone: { kind: "country" }, ...clampPeriod(s.from, s.to, coverages[country]) })),
    [coverages],
  );
  const setPeriod = useCallback(
    (from: string, to: string) => {
      // La periode est bornee a la couverture reelle des donnees.
      const a = from < coverage.first ? coverage.first : from;
      const b = to > coverage.last ? coverage.last : to;
      if (a <= b) setState((s) => ({ ...s, from: a, to: b }));
    },
    [coverage],
  );

  const value = useMemo(() => ({ ...state, coverage, restored: true, setZone, setPeriod, setCountry }), [state, coverage, setZone, setPeriod, setCountry]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFilters(): FiltersContext {
  const value = useContext(Context);
  if (!value) throw new Error("useFilters doit être utilisé dans FiltersProvider");
  return value;
}
