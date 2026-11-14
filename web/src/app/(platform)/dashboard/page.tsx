import type { Metadata } from "next";

import { DashboardView } from "./view";

export const metadata: Metadata = { title: "Vue d'ensemble" };

export default function Page() {
  return <DashboardView />;
}
