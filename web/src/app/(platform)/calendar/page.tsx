import type { Metadata } from "next";

import { CalendarView } from "./view";

export const metadata: Metadata = { title: "Calendrier d'activité" };

export default function Page() {
  return <CalendarView />;
}
