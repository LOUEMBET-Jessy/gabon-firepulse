import { cookies } from "next/headers";
import { Suspense } from "react";

import { Shell } from "@/components/shell/shell";
import { FILTERS_COOKIE, type Coverages } from "@/lib/filters-shared";
import { dayToIso, getStore } from "@/lib/server/store";
import { FiltersProvider } from "@/state/filters";

/** Selection de la session (pays, zone, periode), lue dans le cookie : le serveur rend directement le bon ecran. */
async function WithFilters({ coverages, children }: { coverages: Coverages; children: React.ReactNode }) {
  const raw = (await cookies()).get(FILTERS_COOKIE)?.value;
  let initial: unknown = null;
  try {
    initial = raw ? JSON.parse(decodeURIComponent(raw)) : null;
  } catch {
    initial = null;
  }
  return (
    <FiltersProvider coverages={coverages} initial={initial}>
      <Shell>{children}</Shell>
    </FiltersProvider>
  );
}

/** Espace d'analyse : la couverture des donnees est lue une fois cote serveur et borne les selecteurs. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const coverageOf = (country: "GAB" | "FRA") => {
    const store = getStore(country);
    return { first: dayToIso(store, store.firstDay), last: dayToIso(store, store.lastDay) };
  };
  const coverages: Coverages = { GAB: coverageOf("GAB"), FRA: coverageOf("FRA") };
  return (
    <Suspense fallback={<div className="min-h-[100dvh] bg-bg" aria-busy="true" />}>
      <WithFilters coverages={coverages}>{children}</WithFilters>
    </Suspense>
  );
}
