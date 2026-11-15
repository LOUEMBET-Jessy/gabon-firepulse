import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Fraunces } from "next/font/google";

import { THEME_SCRIPT } from "@/lib/theme";

import "./globals.css";

/** Titre editorial de l'accueil uniquement : ton « nature », poids 600. */
const fraunces = Fraunces({ subsets: ["latin"], weight: "600", variable: "--font-fraunces", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Hot-Spots · Observer. Comprendre. Préserver.", template: "%s · Hot-Spots" },
  description:
    "Hot-Spots rend lisibles les détections de feux des satellites MODIS et VIIRS de la NASA depuis 2000, au Gabon et en France : carte, calendrier harmonisé, tendances, périodes inhabituelles, et un assistant IA pour guider l'exploration.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5ef" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a14" },
  ],
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme est pose avant le premier affichage par le script ci-dessous : l'attribut peut differer du rendu serveur.
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
