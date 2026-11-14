"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import type { ZoneSpec } from "@/lib/types";

/**
 * Zone et periode selectionnees, partagees par tous les ecrans.
 * La periode par defaut est la derniere annee civile entierement couverte par les donnees.
 */
export interface FiltersState {
  zone: ZoneSpec;
  from: string;
  to: string;
}

export interface Coverage {
  /** Premiere et derniere dates presentes dans les donnees chargees. */
  first: string;
  last: string;
}

interface FiltersContext extends FiltersState {
  coverage: Coverage;
  setZone: (zone: ZoneSpec) => void;
  setPeriod: (from: string, to: string) => void;
}

/** Derniere annee civile entierement couverte par les donnees. */
export function defaultPeriod(coverage: Coverage): { from: string; to: string } {
  const lastYear = Number(coverage.last.slice(0, 4));
  const year = coverage.last.slice(5) === "12-31" ? lastYear : lastYear - 1;
  const from = `${year}-01-01`;
  return { from: from < coverage.first ? coverage.first : from, to: `${year}-12-31` };
}

const STORAGE_KEY = "hotspot.filters.v1";
const Context = createContext<FiltersContext | null>(null);

function isValid(value: unknown, coverage: Coverage): value is FiltersState {
  if (!value || typeof value !== "object") return false;
  const v = value as FiltersState;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(v.from) || !iso.test(v.to) || v.from > v.to || v.from < coverage.first || v.to > coverage.last) return false;
  if (!v.zone || !["country", "province", "bbox"].includes(v.zone.kind)) return false;
  if (v.zone.kind === "bbox" && (!Array.isArray(v.zone.bbox) || v.zone.bbox.length !== 4)) return false;
  return true;
}

export function FiltersProvider({ coverage, children }: { coverage: Coverage; children: React.ReactNode }) {
  const [state, setState] = useState<FiltersState>(() => ({ zone: { kind: "country" }, ...defaultPeriod(coverage) }));
  const [restored, setRestored] = useState(false);

  // Restauration apres le premier rendu : le HTML initial reste identique cote serveur et cote client.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronisation unique avec le stockage du navigateur
        if (isValid(parsed, coverage)) setState(parsed);
      }
    } catch {
      /* stockage indisponible : on garde les valeurs par defaut */
    }
    setRestored(true);
  }, [coverage]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* stockage indisponible */
    }
  }, [state, restored]);

  const setZone = useCallback((zone: ZoneSpec) => setState((s) => ({ ...s, zone })), []);
  const setPeriod = useCallback(
    (from: string, to: string) => {
      // La periode est bornee a la couverture reelle des donnees.
      const a = from < coverage.first ? coverage.first : from;
      const b = to > coverage.last ? coverage.last : to;
      if (a <= b) setState((s) => ({ ...s, from: a, to: b }));
    },
    [coverage],
  );

  const value = useMemo(() => ({ ...state, coverage, setZone, setPeriod }), [state, coverage, setZone, setPeriod]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFilters(): FiltersContext {
  const value = useContext(Context);
  if (!value) throw new Error("useFilters doit être utilisé dans FiltersProvider");
  return value;
}
