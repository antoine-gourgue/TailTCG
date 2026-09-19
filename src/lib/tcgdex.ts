// Client serveur de l'API TCGdex (français, sans clé).
// Ne jamais appeler TCGdex depuis le navigateur : passer par /api/tcgdex/*.

import setLogos from "@/data/set-logos.json";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/fr";

/** Logo auto-hébergé (scripts/set-logos.mjs) pour un set que TCGdex ne fournit pas */
function hostedLogo(lang: CatalogLang, setId: string): string | undefined {
  const table = (setLogos as Record<string, Record<string, string>>)[lang];
  return table?.[setId];
}

/** Tri des cartes par numéro (001, 002, … puis TG01, GG01, SV001…) */
function sortCards<T extends { localId: string }>(cards: T[]): T[] {
  return [...cards].sort((a, b) => a.localId.localeCompare(b.localId, "en", { numeric: true }));
}
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
  /** Prix de référence Cardmarket en euros — enrichi sur les pages de set */
  price?: number | null;
  /** idProduct Cardmarket (pour le lien produit) — enrichi sur les pages de set */
  cmId?: number | null;
  /** Catalogue d'où vient la carte quand ce n'est pas celui demandé (complément anglais d'un set FR incomplet) */
  lang?: CatalogLang;
  /** Origine des données : TCGdex, ou Limitless pour les sets japonais que TCGdex n'a pas */
  source?: "tcgdex" | "limitless";
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
/** Langues des catalogues TCGdex utilisées par l'app (recherche fr/ja, scan toutes) */
export type CatalogLang = "fr" | "en" | "ja" | "de" | "es" | "it";

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
  // Les identifiants japonais (SV9-022) n'existent pas dans les autres langues
  if (!card.image && lang !== "ja") {
    card.image = (await findImageInOtherLangs(id)) ?? undefined;
  }
  if (!card.image && card.set?.id) {
    // Dernier recours : l'URL d'asset par convention (série via le set) ;
    // en japonais, on vérifie qu'elle existe (le CDN a souvent les scans que
    // l'API ne liste pas — Méga, Soleil & Lune… — mais pas les plus anciens)
    try {
      const setRes = await fetch(
        `${langBase(lang)}/sets/${encodeURIComponent(card.set.id)}`,
        { next: { revalidate: DAY_SECONDS } }
      );
      if (setRes.ok) {
        const set: TcgdexSetDetail = await setRes.json();
        if (set.serie?.id) {
          const guess = guessAssetBase(lang, set.serie.id, card.set.id, card.localId);
          if (lang !== "ja" || (await assetExists(guess))) card.image = guess;
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
  releaseDate?: string;
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
      sets: (d.sets ?? []).map((set) => (set.logo ? set : { ...set, logo: hostedLogo(lang, set.id) })),
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
  /** Aucun scan disponible pour ce set (ni dans l'API, ni sur le CDN) */
  scansMissing?: boolean;
};

/**
 * L'API omet parfois des images pourtant présentes sur le CDN (promos MEP,
 * et la plupart des sets japonais : Méga, Soleil & Lune…) : on construit
 * l'URL par convention assets/{lang}/{série}/{set}/{n°}. Chemins
 * internationaux en minuscules (en/sv/sv09/001), japonais tels quels
 * (ja/SV/SV9/001, ja/M/M4/001). Le repli client tranche les vrais 404.
 */
export function guessAssetBase(
  lang: CatalogLang,
  serieId: string,
  setId: string,
  localId: string
): string {
  if (lang === "ja") return `https://assets.tcgdex.net/ja/${serieId}/${setId}/${localId}`;
  return `https://assets.tcgdex.net/en/${serieId.toLowerCase()}/${setId.toLowerCase()}/${localId}`;
}

/** Le CDN a-t-il un scan à cette adresse ? (sonde HEAD, cachée 24 h) */
async function assetExists(base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base}/low.webp`, { method: "HEAD", next: { revalidate: DAY_SECONDS } });
    return r.ok;
  } catch {
    return false;
  }
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
  if (!set.logo) set.logo = hostedLogo(lang, set.id);

  // Catalogue FR incomplet (promos surtout) : les cartes que l'anglais a en
  // plus sont ajoutées, marquées de leur langue (fiche d'ajout en anglais)
  if (lang === "fr") {
    try {
      const enRes = await fetch(`${langBase("en")}/sets/${encodeURIComponent(id)}`, { next: { revalidate: DAY_SECONDS } });
      if (enRes.ok) {
        const en: TcgdexSetDetail = await enRes.json();
        const have = new Set((set.cards ?? []).map((c) => c.localId));
        const extra = (en.cards ?? []).filter((c) => !have.has(c.localId)).map((c) => ({ ...c, lang: "en" as const }));
        if (extra.length) set.cards = [...(set.cards ?? []), ...extra];
      }
    } catch {
      // l'anglais est un bonus
    }
  }
  set.cards = sortCards(set.cards ?? []);

  if (set.serie?.id) {
    const missing = (set.cards ?? []).filter((c) => !c.image);
    // L'API ne liste pas tous les scans (presque jamais en japonais, parfois
    // en international) ; une sonde sur la première carte manquante dit si
    // le CDN les a — sinon on n'inflige pas un 404 par carte au navigateur,
    // et la page signale l'absence de scans
    let fill = false;
    if (missing.length > 0) {
      const first = missing[0];
      fill = await assetExists(guessAssetBase(first.lang ?? lang, set.serie.id, set.id, first.localId));
    }
    if (fill) {
      for (const card of missing) card.image = guessAssetBase(card.lang ?? lang, set.serie.id, set.id, card.localId);
    }
    set.scansMissing = !fill && missing.length === (set.cards ?? []).length && missing.length > 0;
  }

  await enrichCardDetails(set.cards ?? [], lang);

  return set;
}

/**
 * Rareté, cote et idProduct Cardmarket par carte (absents des briefs) :
 * fiches détaillées par lots de 25, chacune cachée 24 h — seul le premier
 * affichage du set paie le coût. Chaque carte est lue dans son catalogue
 * d'origine (`card.lang`), sinon dans `lang`.
 */
export async function enrichCardDetails(cards: TcgdexCardBrief[], lang: CatalogLang): Promise<void> {
  const CHUNK = 25;
  for (let i = 0; i < cards.length; i += CHUNK) {
    await Promise.all(
      cards.slice(i, i + CHUNK).map(async (card) => {
        try {
          const r = await fetch(
            `${langBase(card.lang ?? lang)}/cards/${encodeURIComponent(card.id)}`,
            { next: { revalidate: DAY_SECONDS } }
          );
          if (!r.ok) return;
          const detail: {
            rarity?: string;
            pricing?: { cardmarket?: CardmarketPricing };
            variants?: { normal?: boolean; holo?: boolean };
          } = await r.json();
          card.rarity = detail.rarity;
          card.price = cardmarketReference(detail.pricing?.cardmarket);
          card.cmId = detail.pricing?.cardmarket?.idProduct ?? null;
        } catch {
          // rareté et cote inconnues : la carte reste visible dans tous les filtres
        }
      })
    );
  }

}


/**
 * Prix de référence Cardmarket d'une carte, en euros : première valeur de
 * vente > 0 dans l'ordre `avg30 → avg7 → avg → avg1 → trend`. La moyenne 30 j
 * mène (stable) ; `trend` est en dernier car parfois aberrant (ex. Mentali
 * Prime : trend 17,55 € alors que la moyenne 30 j est 124,40 €). **Jamais
 * `low`** (annonce la plus basse, toutes langues/états). Colonnes normales
 * uniquement (les `*-holo` décrivent la variante reverse-holo).
 */
export const CM_REFERENCE_ORDER = ["avg30", "avg7", "avg", "avg1", "trend"] as const;
export function cardmarketReference(
  cm: CardmarketPricing | null | undefined
): number | null {
  if (!cm) return null;
  // Colonnes normales seulement (les `*-holo` = variante reverse-holo).
  for (const field of CM_REFERENCE_ORDER) {
    const v = cm[field as keyof CardmarketPricing];
    if (typeof v === "number" && v > 0) return v;
  }
  return null;
}

/**
 * Cote Cardmarket d'une carte, en respectant les cartes qui n'existent qu'en
 * holo (Prime, EX…) : leur série « -holo » est la cote pertinente, alors que
 * `trend`/`avg30` mélangent toutes les versions. Renvoie tendance, plus bas
 * prix et moyenne 30 jours (null si absents).
 */
export function pickCardmarket(
  cm: CardmarketPricing | null | undefined,
  variants?: { normal?: boolean; holo?: boolean }
): { trend: number | null; low: number | null; avg30: number | null } {
  const holoOnly = variants?.holo === true && variants?.normal === false;
  const pick = (base: number | null | undefined, holo: number | null | undefined) =>
    (holoOnly ? holo ?? base : base ?? holo) ?? null;
  return {
    trend: pick(cm?.trend, cm?.["trend-holo"]),
    low: pick(cm?.low, cm?.["low-holo"]),
    avg30: pick(cm?.avg30, cm?.["avg30-holo"]),
  };
}

/** Recherche Cardmarket « nom numéro » — repli quand l'idProduct est absent */
export function cardmarketSearchUrl(name: string, localId?: string): string {
  const q = [name, localId].filter(Boolean).join(" ");
  return `https://www.cardmarket.com/fr/Pokemon/Products/Search?searchString=${encodeURIComponent(q)}`;
}

/** Page produit Cardmarket : `?idProduct=` redirige vers la fiche de la carte */
export function cardmarketProductUrl(idProduct: number): string {
  return `https://www.cardmarket.com/fr/Pokemon/Products?idProduct=${idProduct}`;
}

/**
 * Lien Cardmarket vers LA carte : la fiche produit via l'idProduct quand on
 * l'a (atterrit directement sur la carte, cohérent avec le prix affiché qui
 * vient du même produit) ; sinon une recherche « nom numéro ». Attention : le
 * mapping idProduct de TCGdex est parfois faux (issues cards-database
 * #1936/#1939), le lien peut alors pointer sur une variante voisine.
 */
export function cardmarketUrl(opts: {
  idProduct?: number | null;
  name: string;
  localId?: string;
}): string {
  return opts.idProduct != null && Number.isFinite(opts.idProduct)
    ? cardmarketProductUrl(opts.idProduct)
    : cardmarketSearchUrl(opts.name, opts.localId);
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
