import type { Metadata } from "next";

import { UnderstandView } from "./view";

export const metadata: Metadata = { title: "Comprendre les données" };

export default function Page() {
  return <UnderstandView />;
}
