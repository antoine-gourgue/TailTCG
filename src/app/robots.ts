import type { MetadataRoute } from "next";

// Les vitrines partagées (/v) reposent sur un lien secret : jamais indexées
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/v/", "/carte/", "/classeurs/", "/parametres"],
    },
  };
}
