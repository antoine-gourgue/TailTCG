import type { Metadata } from "next";
import { Instrument_Sans, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const sans = Instrument_Sans({
  variable: "--font-sans-var",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tailtcg.vercel.app"),
  title: {
    default: "TailTCG — Ta collection Pokémon, enfin à sa hauteur",
    template: "%s",
  },
  description:
    "Suis tes cartes Pokémon, leur état et leur valeur. Pré-grade-les toi-même sur tes photos (centrage mesuré au barème PSA), range-les en classeurs stylés et partage ta vitrine d'un lien. Gratuit, sans pub.",
  keywords: [
    "collection cartes Pokémon",
    "classeur Pokémon",
    "valeur cartes Pokémon",
    "pré-gradation PSA",
    "gestion collection TCG",
  ],
  openGraph: {
    type: "website",
    locale: "fr_FR",
    siteName: "TailTCG",
    title: "TailTCG — Ta collection Pokémon, enfin à sa hauteur",
    description:
      "Suivi de collection, valorisation, pré-gradation sur tes photos, classeurs stylés et vitrine partageable. Gratuit, fait par un collectionneur.",
  },
  twitter: {
    card: "summary_large_image",
  },
  appleWebApp: {
    capable: true,
    title: "TailTCG",
    statusBarStyle: "black-translucent",
  },
};

export const viewport = {
  themeColor: "#131215",
};

// Applique thème (sombre par défaut) et état de la sidebar avant le premier
// rendu, pour éviter tout flash
const bootScript = `(function(){try{var t=localStorage.getItem("theme");document.documentElement.dataset.theme=(t==="light")?"light":"dark";var s=localStorage.getItem("sidebar");if(s==="rail"){document.documentElement.dataset.sidebar="rail"}}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      data-theme="dark"
      suppressHydrationWarning
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="relative min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
