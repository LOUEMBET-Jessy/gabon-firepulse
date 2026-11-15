import { cookies } from "next/headers";
import { Suspense } from "react";

import { Shell } from "@/components/shell/shell";
import { FILTERS_COOKIE } from "@/lib/filters-shared";
import { dayToIso, getStore } from "@/lib/server/store";
import { FiltersProvider } from "@/state/filters";

/** Selection de la session (pays, zone, periode), lue dans le cookie : le serveur rend directement le bon ecran. */
async function WithFilters({ coverage, children }: { coverage: { first: string; last: string }; children: React.ReactNode }) {
  const raw = (await cookies()).get(FILTERS_COOKIE)?.value;
  let initial: unknown = null;
  try {
    initial = raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch {
    initial = null;
  }
  return (
    <FiltersProvider coverage={coverage} initial={initial}>
      <Shell>{children}</Shell>
    </FiltersProvider>
  );
}

/** Espace d'analyse : la couverture des donnees est lue une fois cote serveur et borne les selecteurs. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const store = getStore();
  const coverage = { first: dayToIso(store, store.firstDay), last: dayToIso(store, store.lastDay) };
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-bg" aria-busy="true" />}>
      <WithFilters coverage={coverage}>{children}</WithFilters>
    </Suspense>
  );
}
