import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
