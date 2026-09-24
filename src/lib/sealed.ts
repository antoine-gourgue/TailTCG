/**
 * Produits scellés : constantes et libellés partagés client/serveur (aucune
 * dépendance serveur ici — ce module est importé par des composants client).
 * Les types sont déduits du nom par scripts/sealed-catalog.mjs ; la cote €
 * est calculée côté serveur dans sealed-prices.ts.
 */
export const KIND_LABEL: Record<string, string> = {
  etb: "Coffret Dresseur d'Élite",
  display: "Display",
  booster: "Booster",
  box_set: "Coffret",
  tin: "Tin",
  blister: "Blister",
  theme_deck: "Deck",
  trainer_kit: "Kit du Dresseur",
  autre: "Autre",
};
export const KIND_ORDER = ["etb", "display", "booster", "box_set", "tin", "blister", "theme_deck", "trainer_kit", "autre"];
export const kindLabel = (kind: string | null | undefined): string => KIND_LABEL[kind ?? ""] ?? "Autre";

/** Nom d'extension à afficher : FR (TCGdex) si apparié, sinon EN (TCGplayer) */
export const sealedSetName = (p: { set_name_fr: string | null; set_name: string }): string => p.set_name_fr || p.set_name;
