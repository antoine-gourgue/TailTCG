/**
 * Produits scellés : constantes, libellés et arbre de navigation, partagés
 * client/serveur (aucune dépendance serveur ici — ce module est importé par
 * des composants client). Les types sont déduits du nom par
 * scripts/sealed-catalog.mjs ; la cote € est calculée dans sealed-prices.ts.
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
const kindRank = (k: string) => {
  const i = KIND_ORDER.indexOf(k);
  return i === -1 ? KIND_ORDER.length : i;
};

/** Nom d'extension à afficher : FR (TCGdex) si apparié, sinon EN (TCGplayer) */
export const sealedSetName = (p: { set_name_fr: string | null; set_name: string }): string => p.set_name_fr || p.set_name;

/** Arbre du catalogue : séries → extensions → produits (récents en premier) */
export type CatalogProduct = {
  id: number;
  name: string;
  kind: string;
  image: string;
  cote: number | null;
  setKey: string;
  setName: string;
};
export type CatalogSet = { key: string; name: string; logo: string | null; released: string; products: CatalogProduct[] };
export type CatalogSerie = { id: string; name: string; logo: string | null; sets: CatalogSet[] };

export type SealedTreeRow = {
  id: number;
  name: string;
  kind: string;
  set_name: string;
  set_name_fr: string | null;
  set_id: string | null;
  set_logo: string | null;
  serie: string | null;
  serie_id: string | null;
  serie_logo: string | null;
  released_on: string | null;
  image: string;
};

const desc = (a: string, b: string) => (b > a ? 1 : b < a ? -1 : 0);
const AUTRES = "autres";
/** Chronologie officielle des séries (TCGdex), de la plus récente à la plus ancienne ; les hors-série à la fin */
const SERIE_ORDER = ["me", "sv", "swsh", "sm", "xy", "bw", "col", "hgss", "pl", "dp", "ex", "ecard", "neo", "base", "tk", "pop", "mc", "misc"];
const serieRank = (id: string) => (id === AUTRES ? SERIE_ORDER.length + 1 : SERIE_ORDER.indexOf(id) === -1 ? SERIE_ORDER.length : SERIE_ORDER.indexOf(id));

/** Construit l'arbre à partir des lignes du catalogue et des cotes (clé : id produit). « Autres » toujours en dernier. */
export function buildSealedTree(rows: SealedTreeRow[], cotes: Map<number, { value: number }>): CatalogSerie[] {
  type SetAcc = CatalogSet;
  type SerieAcc = { id: string; name: string; logo: string | null; latest: string; sets: Map<string, SetAcc> };
  const series = new Map<string, SerieAcc>();
  for (const p of rows) {
    const serieId = p.serie_id || AUTRES;
    const setKey = p.set_id ?? `tp:${p.set_name}`;
    const released = p.released_on ?? "";
    const s = series.get(serieId) ?? { id: serieId, name: p.serie || "Autres", logo: p.serie_logo, latest: "", sets: new Map() };
    if (released > s.latest) s.latest = released;
    if (!s.logo && p.serie_logo) s.logo = p.serie_logo;
    const st = s.sets.get(setKey) ?? { key: setKey, name: sealedSetName(p), logo: p.set_logo, released, products: [] };
    if (released > st.released) st.released = released;
    st.products.push({ id: p.id, name: p.name, kind: p.kind, image: p.image, cote: cotes.get(p.id)?.value ?? null, setKey, setName: st.name });
    s.sets.set(setKey, st);
    series.set(serieId, s);
  }
  return [...series.values()]
    .sort((a, b) => serieRank(a.id) - serieRank(b.id) || desc(a.latest, b.latest) || a.name.localeCompare(b.name))
    .map((s) => ({
      id: s.id,
      name: s.name,
      logo: s.logo,
      sets: [...s.sets.values()]
        .sort((a, b) => desc(a.released, b.released) || a.name.localeCompare(b.name))
        .map((st) => ({ ...st, products: st.products.sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name)) })),
    }));
}
