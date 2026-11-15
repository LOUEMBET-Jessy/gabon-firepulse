import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hot-Spots · Observer. Comprendre. Préserver.", template: "%s · Hot-Spots" },
  description:
    "Hot-Spots rend lisibles les détections de feux des satellites MODIS et VIIRS de la NASA depuis 2000, au Gabon et en France : carte, calendrier harmonisé, tendances, périodes inhabituelles, et un assistant IA pour guider l'exploration.",
};

export const viewport: Viewport = { themeColor: "#0b1830", colorScheme: "dark" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
