import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Gabon FirePulse", template: "%s · Gabon FirePulse" },
  description:
    "Calendrier harmonisé de l'activité des feux au Gabon, de 2000 à 2025, à partir des détections MODIS et VIIRS de NASA FIRMS. Projet NASA Space Apps Challenge 2026.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#080d18" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fa" },
  ],
  colorScheme: "dark light",
};

/**
 * Applique le theme avant le premier rendu (pas de flash) : choix memorise, sinon preference du systeme.
 * Valeurs memorisees : "light" (defaut, palette bleu et blanc), "dark" ou "system".
 */
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("firepulse.theme")||"light";var d=p==="dark"||(p==="system"&&!matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=d?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}})();`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" data-theme="light" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}>
      <body className="min-h-[100dvh]">
        {/* En tete du body plutot que dans head : certains antivirus injectent leurs scripts dans head et faussent l'hydratation. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
