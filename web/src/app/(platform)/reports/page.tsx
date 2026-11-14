import type { Metadata } from "next";

import { ReportsView } from "./view";

export const metadata: Metadata = { title: "Rapports et exports" };

export default function Page() {
  return <ReportsView />;
}
