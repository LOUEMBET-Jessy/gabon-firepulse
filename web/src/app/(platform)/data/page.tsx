import type { Metadata } from "next";

import { DataView } from "./view";

export const metadata: Metadata = { title: "Données et sources" };

export default function Page() {
  return <DataView />;
}
