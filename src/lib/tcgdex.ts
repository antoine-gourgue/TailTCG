// Client serveur de l'API TCGdex (français, sans clé).
// Ne jamais appeler TCGdex depuis le navigateur : passer par /api/tcgdex/*.

const TCGDEX_BASE = "https://api.tcgdex.net/v2/fr";
const DAY_SECONDS = 86400;

/** Réponse brute de GET /cards?name=like:… */
export type TcgdexCardBrief = {
  id: string;
  localId: string;
  name: string;
  /** URL de base SANS extension (ajouter /low.webp ou /high.png), absente si pas d'image */
  image?: string;
};

export type TcgdexSetBrief = {
  id: string;
  name: string;
  cardCount?: { total: number; official: number };
};

/** Résultat de recherche enrichi renvoyé par notre API */
export type CardSearchResult = {
  id: string;
  localId: string;
  name: string;
  image: string | null;
  setId: string;
  setName: string;
};

/** "ex15-2" → "ex15" (le localId est après le dernier tiret) */
export function setIdFromCardId(cardId: string): string {
  const i = cardId.lastIndexOf("-");
  return i === -1 ? cardId : cardId.slice(0, i);
}

export function cardImageUrl(
  base: string,
  quality: "low" | "high",
  format: "webp" | "png"
): string {
  return `${base}/${quality}.${format}`;
}

export async function fetchSetsIndex(): Promise<Map<string, TcgdexSetBrief>> {
  const res = await fetch(`${TCGDEX_BASE}/sets`, {
    next: { revalidate: DAY_SECONDS },
  });
  if (!res.ok) return new Map();
  const sets: TcgdexSetBrief[] = await res.json();
  return new Map(sets.map((s) => [s.id, s]));
}

/** Prix Cardmarket d'une fiche complète — toute clé peut manquer */
export type CardmarketPricing = {
  updated?: string;
  unit?: string;
  idProduct?: number;
  trend?: number | null;
  low?: number | null;
  avg?: number | null;
  avg7?: number | null;
  avg30?: number | null;
  "trend-holo"?: number | null;
  "avg30-holo"?: number | null;
  "low-holo"?: number | null;
};

export type TcgdexCard = {
  id: string;
  localId: string;
  name: string;
  image?: string;
  set: { id: string; name: string; cardCount?: { total: number; official: number } };
  rarity?: string;
  category?: string;
  illustrator?: string;
  variants?: {
    normal?: boolean;
    holo?: boolean;
    reverse?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  };
  pricing?: { cardmarket?: CardmarketPricing };
};

export async function getCard(id: string): Promise<TcgdexCard | null> {
  const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(id)}`, {
    next: { revalidate: DAY_SECONDS },
  });
  if (!res.ok) return null;
  return res.json();
}

/** L'API ne fournit pas d'URL Cardmarket : lien de recherche pré-rempli, éditable */
export function cardmarketSearchUrl(cardName: string): string {
  return `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(cardName)}`;
}

/**
 * URL produit complète via l'idProduct TCGdex : Cardmarket redirige
 * ?idProduct=… vers la page produit en conservant les filtres.
 * Attention : le mapping TCGdex→Cardmarket est parfois erroné (mauvaise
 * variante) — l'URL reste éditable dans le formulaire.
 */
export function cardmarketProductUrl(idProduct: number): string {
  return `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${idProduct}`;
}

export async function searchCards(query: string): Promise<CardSearchResult[]> {
  const [cardsRes, setsIndex] = await Promise.all([
    fetch(`${TCGDEX_BASE}/cards?name=like:${encodeURIComponent(query)}`, {
      next: { revalidate: DAY_SECONDS },
    }),
    fetchSetsIndex(),
  ]);

  if (!cardsRes.ok) {
    throw new Error(`TCGdex a répondu ${cardsRes.status}`);
  }

  const cards: TcgdexCardBrief[] = await cardsRes.json();

  return cards.map((c) => {
    const setId = setIdFromCardId(c.id);
    return {
      id: c.id,
      localId: c.localId,
      name: c.name,
      image: c.image ?? null,
      setId,
      setName: setsIndex.get(setId)?.name ?? setId,
    };
  });
}
