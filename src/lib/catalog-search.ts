import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { pocketSetIds, sameLocalId, type CatalogLang, type CatalogSearchResult } from "@/lib/tcgdex";
import { displayLocalId } from "@/lib/set-merge";

type Db = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["catalog_cards"]["Row"];
const MAX = 120;

/** Échappe les jokers de LIKE dans ce que tape l'utilisateur */
const like = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);
/** Sans accents ni majuscules, tirets comme espaces, pour comparer des noms */
const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/-/g, " ")
    .trim();

/** Noms FR/EN des espèces du Pokédex, une fois par jour */
const pokedexNames = unstable_cache(
  async () => {
    const db = createAdminClient();
    const out: { fr: string; en: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await db.from("pokedex").select("name_fr, name_en").range(from, from + 999);
      for (const r of data ?? []) if (r.name_fr && r.name_en) out.push({ fr: r.name_fr, en: r.name_en });
      if (!data || data.length < 1000) break;
    }
    return out;
  },
  ["pokedex-names"],
  { revalidate: 86_400 },
);

/** Une suite de mots figure-t-elle, contiguë, dans une autre ? */
function containsWords(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) {
    if (needle.every((w, j) => hay[i + j] === w)) return true;
  }
  return false;
}

/**
 * Autres noms à essayer pour la même requête : « evoli » → « Eevee » (les
 * cartes japonaises portent un nom anglais), « eevee » → « Évoli » (les
 * cartes françaises n'ont que leur nom français).
 */
async function aliasesOf(name: string): Promise<string[]> {
  const words = fold(name).split(/\s+/).filter(Boolean);
  const alts = new Set<string>();
  for (const p of await pokedexNames()) {
    const fr = fold(p.fr).split(/\s+/);
    const en = fold(p.en).split(/\s+/);
    if (containsWords(words, fr) && fold(p.en) !== fold(p.fr)) alts.add(p.en);
    if (containsWords(words, en) && fold(p.fr) !== fold(p.en)) alts.add(p.fr);
    if (alts.size >= 3) break;
  }
  return [...alts];
}

/**
 * Recherche dans le catalogue TailTCG (tables catalog_cards / catalog_sets :
 * TCGdex FR et JA, Limitless, pokemontcg) — nom FR, EN ou JP, avec un
 * numéro en fin de requête comme filtre (« pikachu 27 », « 241 »). Les
 * cartes françaises viennent d'abord, puis les japonaises, sets récents en tête.
 */
export async function searchCatalog(db: Db, query: string): Promise<CatalogSearchResult[]> {
  const q = query.trim();
  const numMatch = q.match(/^(.*?)\s*(\d+)(?:\s*\/\s*\d+)?$/);
  const name = numMatch ? numMatch[1].trim() : q;
  const localId = numMatch ? numMatch[2] : null;

  let rows: Row[] = [];
  if (name) {
    const cap = localId ? 600 : MAX;
    const terms = [name, ...(await aliasesOf(name))];
    const found = await Promise.all(terms.map((t) => db.rpc("search_catalog", { q: like(t), max_rows: cap })));
    const seen = new Set<string>();
    for (const { data } of found) {
      for (const r of (data ?? []) as Row[]) {
        const k = `${r.lang}/${r.id}`;
        if (!seen.has(k)) {
          seen.add(k);
          rows.push(r);
        }
      }
    }
    if (localId) {
      const byNo = rows.filter((r) => sameLocalId(r.local_id, localId));
      if (byNo.length > 0) rows = byNo;
      else {
        // Repli : la requête entière comme nom (« Porygon2 »)
        const { data: whole } = await db.rpc("search_catalog", { q: like(q), max_rows: MAX });
        rows = (whole ?? []) as Row[];
      }
    }
  } else if (localId) {
    const n = String(Number.parseInt(localId, 10));
    const { data } = await db
      .from("catalog_cards")
      .select("*")
      .in("local_id", [...new Set([localId, n, n.padStart(2, "0"), n.padStart(3, "0")])])
      .limit(MAX);
    rows = (data ?? []) as Row[];
  }
  if (rows.length === 0) return [];

  const pocket = await pocketSetIds();
  rows = rows.filter((r) => !pocket.has(r.set_id));

  // Noms et dates des sets concernés (une requête)
  const setIds = [...new Set(rows.map((r) => r.set_id))];
  const { data: sets } = await db.from("catalog_sets").select("lang, id, name, release_date").in("id", setIds);
  const setOf = new Map((sets ?? []).map((s) => [`${s.lang}/${s.id}`, s]));

  const langRank = (l: string) => (l === "fr" ? 0 : l === "ja" ? 1 : 2);
  rows.sort((a, b) => {
    const dl = langRank(a.lang) - langRank(b.lang);
    if (dl !== 0) return dl;
    const da = setOf.get(`${a.lang}/${a.set_id}`)?.release_date ?? "";
    const dbb = setOf.get(`${b.lang}/${b.set_id}`)?.release_date ?? "";
    if (da !== dbb) return da < dbb ? 1 : -1;
    return a.local_id.localeCompare(b.local_id, undefined, { numeric: true });
  });

  return rows.slice(0, MAX).map((r) => ({
    id: r.id,
    localId: displayLocalId(r.id, r.local_id),
    name: r.name,
    image: r.image ?? null,
    setId: r.set_id,
    setName: setOf.get(`${r.lang}/${r.set_id}`)?.name ?? r.set_id,
    lang: r.lang as CatalogLang,
    source: (r.source as CatalogSearchResult["source"]) ?? "tcgdex",
  }));
}
