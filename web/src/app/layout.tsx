import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gabon FirePulse", template: "%s · Gabon FirePulse" },
  description:
    "Calendrier harmonisé de l'activité des feux au Gabon, de 2000 à 2025, à partir des détections MODIS et VIIRS de NASA FIRMS. Projet NASA Space Apps Challenge 2026.",
};

export const viewport: Viewport = { themeColor: "#080d18", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
