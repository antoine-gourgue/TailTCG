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
  /** Enrichie carte par carte sur les pages de set (absente des briefs) */
  rarity?: string;
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

/** Ids des sets Pokémon Pocket (appli mobile), à exclure du catalogue */
export async function pocketSetIds(): Promise<Set<string>> {
  try {
    const r = await fetch(`${TCGDEX_BASE}/series/tcgp`, {
      next: { revalidate: DAY_SECONDS },
    });
    if (!r.ok) return new Set();
    const d = (await r.json()) as { sets?: { id: string }[] };
    return new Set((d.sets ?? []).map((s) => s.id));
  } catch {
    return new Set();
  }
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
  hp?: number;
  types?: string[];
  stage?: string;
  variants?: {
    normal?: boolean;
    holo?: boolean;
    reverse?: boolean;
    firstEdition?: boolean;
    wPromo?: boolean;
  };
  pricing?: { cardmarket?: CardmarketPricing };
};

/** Langues tentées dans l'ordre quand l'image FR manque */
const FALLBACK_LANGS = ["en", "de", "es", "it", "ja"] as const;

/** Cherche l'image d'une carte dans les autres langues, première trouvée */
async function findImageInOtherLangs(cardId: string): Promise<string | null> {
  for (const lang of FALLBACK_LANGS) {
    try {
      const res = await fetch(
        `https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(cardId)}`,
        { next: { revalidate: DAY_SECONDS } }
      );
      if (!res.ok) continue;
      const c: TcgdexCardBrief = await res.json();
      if (c.image) return c.image;
    } catch {
      // langue suivante
    }
  }
  return null;
}

/** Catalogues navigables : international (fr) et japonais (ja) */
export type CatalogLang = "fr" | "ja";

const langBase = (lang: CatalogLang) => `https://api.tcgdex.net/v2/${lang}`;

export async function getCard(
  id: string,
  lang: CatalogLang = "fr"
): Promise<TcgdexCard | null> {
  const res = await fetch(`${langBase(lang)}/cards/${encodeURIComponent(id)}`, {
    next: { revalidate: DAY_SECONDS },
  });
  if (!res.ok) return null;
  const card: TcgdexCard = await res.json();
  if (!card.image) {
    card.image = (await findImageInOtherLangs(id)) ?? undefined;
  }
  if (!card.image && card.set?.id) {
    // Dernier recours : l'URL d'asset par convention (série via le set)
    try {
      const setRes = await fetch(
        `${langBase(lang)}/sets/${encodeURIComponent(card.set.id)}`,
        { next: { revalidate: DAY_SECONDS } }
      );
      if (setRes.ok) {
        const set: TcgdexSetDetail = await setRes.json();
        if (set.serie?.id) {
          card.image = guessAssetBase(set.serie.id, card.set.id, card.localId);
        }
      }
    } catch {
      // placeholder côté client
    }
  }
  return card;
}

export type CatalogSet = {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  cardCount?: { total: number; official: number };
};

export type SerieWithSets = {
  id: string;
  name: string;
  logo: string | null;
  releaseDate: string | null;
  sets: CatalogSet[];
};

/** Toutes les séries avec leurs sets (logos inclus), plus récentes d'abord */
export async function fetchSeriesWithSets(
  lang: CatalogLang
): Promise<SerieWithSets[]> {
  const res = await fetch(`${langBase(lang)}/series`, {
    next: { revalidate: DAY_SECONDS },
  });
  if (!res.ok) return [];
  const raw: { id: string; name: string }[] = await res.json();
  // Exclut Pokémon Pocket (cartes de l'appli mobile, pas des cartes physiques)
  const list = raw.filter(
    (s) => s.id !== "tcgp" && !/pocket/i.test(s.name)
  );

  const details = await Promise.all(
    list.map(async (s) => {
      try {
        const r = await fetch(
          `${langBase(lang)}/series/${encodeURIComponent(s.id)}`,
          { next: { revalidate: DAY_SECONDS } }
        );
        if (!r.ok) return null;
        return (await r.json()) as {
          id: string;
          name: string;
          logo?: string;
          releaseDate?: string;
          sets?: CatalogSet[];
        };
      } catch {
        return null;
      }
    })
  );

  return details
    .filter((d): d is NonNullable<typeof d> => d != null)
    .map((d) => ({
      id: d.id,
      name: d.name,
      logo: d.logo ?? null,
      releaseDate: d.releaseDate ?? null,
      sets: d.sets ?? [],
    }))
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

export type TcgdexSetDetail = {
  id: string;
  name: string;
  logo?: string;
  symbol?: string;
  releaseDate?: string;
  cardCount?: { total: number; official: number };
  serie?: { id: string; name: string };
  cards: TcgdexCardBrief[];
};

/**
 * L'API omet parfois des images pourtant présentes sur le CDN (ex. promos
 * MEP) : on construit l'URL par convention assets/{lang}/{série}/{set}/{n°},
 * le repli client (cascade de langues → placeholder) tranche les vrais 404.
 */
function guessAssetBase(
  serieId: string,
  setId: string,
  localId: string
): string {
  return `https://assets.tcgdex.net/en/${serieId.toLowerCase()}/${setId.toLowerCase()}/${localId}`;
}

export async function getSet(
  id: string,
  lang: CatalogLang
): Promise<TcgdexSetDetail | null> {
  const res = await fetch(`${langBase(lang)}/sets/${encodeURIComponent(id)}`, {
    next: { revalidate: DAY_SECONDS },
  });
  if (!res.ok) return null;
  const set: TcgdexSetDetail = await res.json();

  if (set.serie?.id) {
    for (const card of set.cards ?? []) {
      if (!card.image) {
        card.image = guessAssetBase(set.serie.id, set.id, card.localId);
      }
    }
  }

  // Rareté par carte (absente des briefs) : fiches détaillées par lots,
  // chacune cachée 24 h — seul le premier affichage du set paie le coût
  const cards = set.cards ?? [];
  const CHUNK = 25;
  for (let i = 0; i < cards.length; i += CHUNK) {
    await Promise.all(
      cards.slice(i, i + CHUNK).map(async (card) => {
        try {
          const r = await fetch(
            `${langBase(lang)}/cards/${encodeURIComponent(card.id)}`,
            { next: { revalidate: DAY_SECONDS } }
          );
          if (!r.ok) return;
          const detail: { rarity?: string } = await r.json();
          card.rarity = detail.rarity;
        } catch {
          // rareté inconnue : la carte reste visible dans tous les filtres
        }
      })
    );
  }

  return set;
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

async function fetchCardBriefs(queryString: string): Promise<TcgdexCardBrief[]> {
  const res = await fetch(`${TCGDEX_BASE}/cards${queryString}`, {
    next: { revalidate: DAY_SECONDS },
  });
  if (!res.ok) throw new Error(`TCGdex a répondu ${res.status}`);
  return res.json();
}

/** "027" et "27" désignent le même numéro */
function sameLocalId(a: string, b: string): boolean {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return a.toLowerCase() === b.toLowerCase();
}

export async function searchCards(query: string): Promise<CardSearchResult[]> {
  const q = query.trim();

  // « pikachu ex 764/742 », « pikachu 27 » ou « 241 » tout seul :
  // un numéro en fin de requête devient un filtre sur localId
  const numMatch = q.match(/^(.*?)\s*(\d+)(?:\s*\/\s*\d+)?$/);
  const name = numMatch ? numMatch[1].trim() : q;
  const localId = numMatch ? numMatch[2] : null;

  const [setsIndex, pocket] = await Promise.all([
    fetchSetsIndex(),
    pocketSetIds(),
  ]);
  let cards: TcgdexCardBrief[] = [];

  if (localId && name) {
    cards = (
      await fetchCardBriefs(
        `?name=like:${encodeURIComponent(name)}&localId=like:${encodeURIComponent(localId)}`
      )
    ).filter((c) => sameLocalId(c.localId, localId));

    if (cards.length === 0 && name.includes(" ")) {
      // Nom composé (« pikachu ex ») : les noms officiels utilisent parfois
      // un tiret (« Pikachu-ex ») — premier mot côté API, le reste en filtre
      const first = name.split(/\s+/)[0];
      const tokens = name.toLowerCase().split(/\s+/);
      const raw = await fetchCardBriefs(
        `?name=like:${encodeURIComponent(first)}&localId=like:${encodeURIComponent(localId)}`
      );
      cards = raw.filter((c) => {
        const n = c.name.toLowerCase().replace(/[-–]/g, " ");
        return tokens.every((t) => n.includes(t)) && sameLocalId(c.localId, localId);
      });
    }

    if (cards.length === 0) {
      // Repli : la requête entière comme nom (ex. « Porygon2 »)
      cards = await fetchCardBriefs(`?name=like:${encodeURIComponent(q)}`);
    }
  } else if (localId && !name) {
    cards = (
      await fetchCardBriefs(`?localId=like:${encodeURIComponent(localId)}`)
    ).filter((c) => sameLocalId(c.localId, localId));
  } else {
    cards = await fetchCardBriefs(`?name=like:${encodeURIComponent(name)}`);
  }

  const results = cards
    .filter((c) => !pocket.has(setIdFromCardId(c.id)))
    .map((c) => {
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

  // Certaines cartes n'ont pas d'image française : cascade sur les autres
  // langues (fiches mises en cache 24 h, 20 cartes max par recherche)
  const missing = results.filter((r) => !r.image).slice(0, 20);
  await Promise.all(
    missing.map(async (r) => {
      r.image = await findImageInOtherLangs(r.id);
    })
  );

  return results;
}
