import type { Metadata } from "next";

import { CompareView } from "./view";

export const metadata: Metadata = { title: "Comparaison MODIS et VIIRS" };

export default function Page() {
  return <CompareView />;
}
