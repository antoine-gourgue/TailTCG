import { renderCollectionOg, OG_SIZE } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "TailTCG — Ta collection Pokémon, enfin à sa hauteur";

// Aperçu riche par défaut du site (la vitrine /v a le sien)
export default function Image() {
  return renderCollectionOg({
    title: "Ta collection Pokémon, enfin à sa hauteur.",
    subtitle: "Suivi, valeur, pré-gradation, classeurs, vitrine",
    cta: "Créer ma collection — gratuit",
    cardUrls: [
      "https://assets.tcgdex.net/fr/base/base1/2/high.png",
      "https://assets.tcgdex.net/fr/base/base1/4/high.png",
      "https://assets.tcgdex.net/fr/base/base1/15/high.png",
    ],
  });
}
