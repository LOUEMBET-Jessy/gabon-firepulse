import type { Metadata } from "next";

import { CompareView } from "./view";

export const metadata: Metadata = { title: "Comparer deux zones" };

export default function Page() {
  return <CompareView />;
}
