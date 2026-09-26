/**
 * Libellés de rareté (TCGdex) harmonisés pour les répartitions : les cartes
 * anglaises et japonaises reviennent avec des libellés différents pour la
 * même rareté — on les ramène au libellé français quand il est connu, et on
 * fusionne les variantes de casse.
 */
export const UNKNOWN_RARITY = "Non renseignée";

const ALIASES: Record<string, string> = {
  common: "Commune",
  uncommon: "Peu commune",
  rare: "Rare",
  "rare holo": "Rare Holo",
  "holo rare": "Rare Holo",
  "double rare": "Double rare",
  "ultra rare": "Ultra Rare",
  "illustration rare": "Illustration rare",
  "special illustration rare": "Illustration spéciale rare",
  "hyper rare": "Hyper rare",
  "secret rare": "Secrète",
  "rare secret": "Secrète",
  "shiny rare": "Chromatique rare",
  "shiny ultra rare": "Chromatique ultra rare",
  "art rare": "Illustration rare",
  "special art rare": "Illustration spéciale rare",
  "super rare": "Super rare",
  "amazing rare": "Magnifique",
  "radiant rare": "Radieuse rare",
  promo: "Promo",
  none: "Sans Rareté",
  "sans rareté": "Sans Rareté",
};

/** Libellé d'affichage d'une rareté brute ; « Non renseignée » si absente */
export function rarityLabel(raw: string | null | undefined): string {
  const r = (raw ?? "").trim();
  if (!r) return UNKNOWN_RARITY;
  const alias = ALIASES[r.toLowerCase()];
  return alias ?? r;
}

/** Ordre d'affichage des raretés TCGdex (inconnues à la fin) */
export const RARITY_ORDER = [
  "Commune",
  "Peu Commune",
  "Rare",
  "Rare Holo",
  "Rare Holo EX",
  "Rare Holo LV.X",
  "Rare Prime",
  "LÉGENDE",
  "Ultra Rare",
  "Magnifique rare",
  "Double rare",
  "Illustration rare",
  "Illustration spéciale rare",
  "Hyper rare",
  "Chromatique rare",
  "Chromatique ultra rare",
  "Rare Secrète",
  "Secrète",
  "Promo",
];

const RARITY_SYMBOLS: Record<string, string> = {
  Commune: "●",
  "Peu Commune": "◆",
  "Peu commune": "◆",
  Rare: "★",
  "Rare Holo": "✦",
  "Rare Holo EX": "✦",
  "Rare Holo LV.X": "✦",
  "Rare Prime": "✹",
  LÉGENDE: "▞",
  "Ultra Rare": "✸",
  "Double rare": "★★",
  "Illustration rare": "✧",
  "Illustration spéciale rare": "✧✧",
  "Hyper rare": "🟊",
  "Rare Secrète": "✪",
  Secrète: "✪",
  Promo: "◈",
};

export function rarityRank(r: string): number {
  const i = RARITY_ORDER.indexOf(r);
  return i === -1 ? 999 : i;
}

/** Symbole de la rareté (libellé brut ou harmonisé), null si aucun */
export function raritySymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return RARITY_SYMBOLS[raw] ?? RARITY_SYMBOLS[rarityLabel(raw)] ?? null;
}
