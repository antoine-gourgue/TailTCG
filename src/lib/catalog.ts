import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MERGED_CHILDREN, MERGED_INTO, displayLocalId } from "@/lib/set-merge";
import {
  enrichCardDetails,
  fetchSeriesWithSets,
  getCard,
  getSet,
  type CatalogLang,
  type SerieWithSets,
  type TcgdexCard,
  type TcgdexCardBrief,
  type TcgdexSetDetail,
} from "@/lib/tcgdex";

/**
 * Catalogue en base (tables catalog_sets / catalog_cards, remplies par
 * scripts/catalog-sync.mjs) : sets et cartes FR et JA complets, y compris
 * les sets japonais que TCGdex n'a pas (Limitless). Chaque fonction lit la
 * base d'abord et retombe sur TCGdex en direct si le catalogue n'est pas
 * synchronisé. Lecture en service role : les tables sont publiques en
 * lecture et ces fonctions servent aussi hors requête (cache).
 */

const sortByNumber = <T extends { localId: string }>(cards: T[]) =>
  [...cards].sort((a, b) => a.localId.localeCompare(b.localId, "en", { numeric: true }));

/** Toutes les séries avec leurs sets, plus récentes d'abord : TCGdex, complété par les sets que seule la base connaît */
export async function catalogSeries(lang: CatalogLang): Promise<SerieWithSets[]> {
  const db = createAdminClient();
  const [live, { data }, { data: extraRows }] = await Promise.all([
    fetchSeriesWithSets(lang).catch(() => [] as SerieWithSets[]),
    db
      .from("catalog_sets")
      .select("id, name, serie_id, serie_name, serie_logo, logo, symbol, release_date, card_count_total, card_count_official")
      .eq("lang", lang),
    // cartes ajoutées depuis pokemontcg.io à des sets TCGdex (comptées dans le total)
    db.from("catalog_cards").select("set_id").eq("lang", lang).eq("source", "pokemontcg"),
  ]);
  const extras = new Map<string, number>();
  for (const r of extraRows ?? []) extras.set(r.set_id, (extras.get(r.set_id) ?? 0) + 1);
  const series = new Map<string, SerieWithSets>(live.map((s) => [s.id, { ...s, sets: [...s.sets] }]));
  const known = new Set(live.flatMap((s) => s.sets.map((x) => x.id)));
  for (const s of data ?? []) {
    if (known.has(s.id)) {
      // TCGdex connaît le set : on ne lui ajoute que le logo qui lui manque
      const target = series.get(s.serie_id)?.sets.find((x) => x.id === s.id);
      if (target && !target.logo && s.logo) target.logo = s.logo;
      continue;
    }
    const serie =
      series.get(s.serie_id) ??
      series.set(s.serie_id, { id: s.serie_id, name: s.serie_name, logo: s.serie_logo, releaseDate: null, sets: [] }).get(s.serie_id)!;
    if (s.release_date && (!serie.releaseDate || s.release_date > serie.releaseDate)) serie.releaseDate = s.release_date;
    serie.sets.push({
      id: s.id,
      name: s.name,
      logo: s.logo ?? undefined,
      symbol: s.symbol ?? undefined,
      cardCount:
        s.card_count_total != null
          ? { total: s.card_count_total, official: s.card_count_official ?? s.card_count_total }
          : undefined,
      releaseDate: s.release_date ?? undefined,
    });
  }
  const all = [...series.values()].flatMap((s) => s.sets);
  for (const x of all) {
    const n = extras.get(x.id);
    if (n && x.cardCount) x.cardCount = { total: x.cardCount.total + n, official: x.cardCount.official };
  }
  // Sets fusionnés : l'enfant disparaît de la liste, ses cartes comptent dans le parent
  for (const [child, parent] of Object.entries(MERGED_INTO)) {
    const c = all.find((x) => x.id === child);
    const p = all.find((x) => x.id === parent);
    if (c && p && p.cardCount && c.cardCount) {
      p.cardCount = { total: p.cardCount.total + c.cardCount.total, official: p.cardCount.official };
    }
  }
  return [...series.values()]
    .map((serie) => ({
      ...serie,
      sets: serie.sets
        .filter((x) => !MERGED_INTO[x.id])
        .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? "")),
    }))
    .filter((serie) => serie.sets.length > 0)
    .sort((a, b) => (b.releaseDate ?? "").localeCompare(a.releaseDate ?? ""));
}

/**
 * Un set et ses cartes : TCGdex d'abord (rareté, cote Cardmarket, visuels),
 * puis la base pour ce qui manque — cartes absentes (Limitless), visuels,
 * logo — ou tout le set si TCGdex ne le connaît pas.
 */
export async function catalogSet(id: string, lang: CatalogLang): Promise<TcgdexSetDetail | null> {
  const set = await catalogSetAlone(id, lang);
  const children = MERGED_CHILDREN[id];
  if (!set || !children) return set;
  // Sets fusionnés : les cartes des enfants à la suite du set, avec leur numéro imprimé
  const extra = (await Promise.all(children.map((child) => catalogSetAlone(child, lang)))).flatMap((c) =>
    sortByNumber(c?.cards ?? []).map((card) => ({ ...card, localId: displayLocalId(card.id, card.localId) })),
  );
  const cards = [...set.cards, ...extra];
  return {
    ...set,
    cards,
    cardCount: set.cardCount ? { total: Math.max(set.cardCount.total + extra.length, cards.length), official: set.cardCount.official } : undefined,
    scansMissing: cards.length > 0 && cards.every((c) => !c.image),
  };
}

async function catalogSetAlone(id: string, lang: CatalogLang): Promise<TcgdexSetDetail | null> {
  const db = createAdminClient();
  const [live, { data: set }, { data: rows }] = await Promise.all([
    getSet(id, lang).catch(() => null),
    db
      .from("catalog_sets")
      .select("id, name, serie_id, serie_name, logo, symbol, release_date, card_count_total, card_count_official, source")
      .eq("lang", lang)
      .eq("id", id)
      .maybeSingle(),
    db
      .from("catalog_cards")
      .select("id, local_id, name, name_en, image, rarity, source, card_lang")
      .eq("lang", lang)
      .eq("set_id", id),
  ]);
  if (!live && !set) return null;
  const stored: TcgdexCardBrief[] = (rows ?? []).map((c) => ({
    id: c.id,
    localId: c.local_id,
    name: c.name,
    image: c.image ?? undefined,
    rarity: c.rarity ?? undefined,
    lang: (c.card_lang as CatalogLang | null) ?? undefined,
    source: c.source as "tcgdex" | "limitless" | "pokemontcg",
  }));

  if (live) {
    const have = new Map(live.cards.map((c) => [c.localId, c]));
    const extra: TcgdexCardBrief[] = [];
    for (const c of stored) {
      const l = have.get(c.localId);
      if (!l) extra.push(c);
      else if (!l.image && c.image) l.image = c.image;
    }
    const cards = sortByNumber([...live.cards, ...extra]);
    return {
      ...live,
      logo: live.logo ?? set?.logo ?? undefined,
      cards,
      scansMissing: cards.length > 0 && cards.every((c) => !c.image),
    };
  }

  const cards = sortByNumber(stored);
  await enrichCardDetails(cards.filter((c) => c.source === "tcgdex" || !c.source), lang);
  return {
    id: set!.id,
    name: set!.name,
    logo: set!.logo ?? undefined,
    symbol: set!.symbol ?? undefined,
    releaseDate: set!.release_date ?? undefined,
    cardCount:
      set!.card_count_total != null
        ? { total: set!.card_count_total, official: set!.card_count_official ?? set!.card_count_total }
        : undefined,
    serie: { id: set!.serie_id, name: set!.serie_name },
    cards,
    scansMissing: cards.length > 0 && cards.every((c) => !c.image),
  };
}

/** Une carte : TCGdex d'abord, sinon le catalogue en base (sets japonais absents de TCGdex) */
export async function catalogCard(id: string, lang: CatalogLang): Promise<TcgdexCard | null> {
  const card = await getCard(id, lang);
  if (card) return { ...card, localId: displayLocalId(card.id, card.localId) };
  const db = createAdminClient();
  const { data: c } = await db
    .from("catalog_cards")
    .select("id, set_id, local_id, name, name_en, image, rarity")
    .eq("lang", lang)
    .eq("id", id)
    .maybeSingle();
  if (!c) return null;
  const { data: s } = await db
    .from("catalog_sets")
    .select("id, name, card_count_total, card_count_official")
    .eq("lang", lang)
    .eq("id", c.set_id)
    .maybeSingle();
  return {
    id: c.id,
    localId: displayLocalId(c.id, c.local_id),
    name: c.name,
    image: c.image ?? undefined,
    rarity: c.rarity ?? undefined,
    set: {
      id: c.set_id,
      name: s?.name ?? c.set_id,
      cardCount:
        s?.card_count_total != null
          ? { total: s.card_count_total, official: s.card_count_official ?? s.card_count_total }
          : undefined,
    },
  };
}
