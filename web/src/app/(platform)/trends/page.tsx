import type { Metadata } from "next";

import { TrendsView } from "./view";

export const metadata: Metadata = { title: "Tendances" };

export default function Page() {
  return <TrendsView />;
}
