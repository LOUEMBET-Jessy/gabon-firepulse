import type { Metadata } from "next";
import { Suspense } from "react";

import { AnomaliesView } from "./view";

export const metadata: Metadata = { title: "Périodes inhabituelles" };

export default function Page() {
  // Le mois a ouvrir peut venir de l'adresse (?m=2024-1) : la lecture des parametres est differee.
  return (
    <Suspense fallback={<div className="skeleton h-[420px] w-full rounded-panel" role="status" aria-label="Chargement" />}>
      <AnomaliesView />
    </Suspense>
  );
}
