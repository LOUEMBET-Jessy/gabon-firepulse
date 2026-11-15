import type { Metadata } from "next";

import { StatisticsView } from "./view";

export const metadata: Metadata = { title: "Statistiques détaillées" };

export default function Page() {
  return <StatisticsView />;
}