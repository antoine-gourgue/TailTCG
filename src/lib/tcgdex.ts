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
