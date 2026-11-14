import type { Metadata } from "next";

import { MapView } from "./view";

export const metadata: Metadata = { title: "Carte des détections" };

export default function Page() {
  return <MapView />;
}
