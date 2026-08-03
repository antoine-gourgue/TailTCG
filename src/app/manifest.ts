import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TailTCG",
    short_name: "TailTCG",
    description: "Ta collection de cartes Pokémon, organisée et valorisée.",
    start_url: "/",
    display: "standalone",
    background_color: "#131215",
    theme_color: "#131215",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
