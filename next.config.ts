import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Anciennes adresses (QR codes, vitrines partagées, favoris) : redirigées pour de bon
  async redirects() {
    return [
      { source: "/login", destination: "/connexion", permanent: true },
      { source: "/wishlist", destination: "/recherchees", permanent: true },
      { source: "/recherche", destination: "/catalogue", permanent: true },
      { source: "/scan", destination: "/scanner", permanent: true },
      { source: "/scan/:id", destination: "/scanner/:id", permanent: true },
      { source: "/v/:token", destination: "/vitrine/:token", permanent: true },
      { source: "/v/:token/c/:id", destination: "/vitrine/:token/carte/:id", permanent: true },
      { source: "/stats", destination: "/collection", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      // Upload des photos compressées (limite Vercel : 4,5 Mo par requête)
      bodySizeLimit: "4mb",
    },
  },
  // Le traçage des fichiers n'embarque de @img/sharp-libvips-* que index.js,
  // package.json et versions.json : sans la bibliothèque native (lib/*.so),
  // toute route qui importe sharp plante au chargement sur Vercel
  // (« Could not load the sharp module using the linux-x64 runtime »).
  // Clés = routes (segments dynamiques échappés), valeurs = globs depuis la racine.
  outputFileTracingIncludes: {
    "/api/scan/match": ["node_modules/@img/sharp-libvips-*/**/*"],
    "/api/pokedex/print/\\[id\\]": ["node_modules/@img/sharp-libvips-*/**/*"],
  },
};

export default nextConfig;
