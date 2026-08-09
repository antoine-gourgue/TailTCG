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
  title: "TailTCG",
  description: "Ta collection de cartes Pokémon, organisée et valorisée.",
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
