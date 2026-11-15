import { Shell } from "@/components/shell/shell";
import { dayToIso, getStore } from "@/lib/server/store";
import { FiltersProvider } from "@/state/filters";

/** Espace d'analyse : la couverture des donnees est lue une fois cote serveur et borne les selecteurs. */
export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const store = getStore();
  const coverage = { first: dayToIso(store, store.firstDay), last: dayToIso(store, store.lastDay) };
  return (
    <FiltersProvider coverage={coverage}>
      <Shell>{children}</Shell>
    </FiltersProvider>
  );
}
