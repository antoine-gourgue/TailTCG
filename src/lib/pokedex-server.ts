import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { PocketItem } from "@/components/binder-pages";
import {
  artworkUrl,
  dexNumber,
  pokedexIdOf,
  POKEDEX_SET_NAME,
  type PokedexEntry,
} from "@/lib/pokedex";

type Db = SupabaseClient<Database>;

/** Tout le Pokédex, dans l'ordre national (par pages de 1000, plafond PostgREST) */
export async function loadPokedex(db: Db): Promise<PokedexEntry[]> {
  const PAGE = 1000;
  const out: PokedexEntry[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await db
      .from("pokedex")
      .select("id, name_fr, types, generation")
      .order("id")
      .range(from, from + PAGE - 1);
    for (const r of data ?? []) {
      out.push({ id: r.id, name: r.name_fr, types: r.types ?? [], generation: r.generation });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export type PlaceholderRow = {
  id: string;
  tcgdex_id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string | null;
  position: number;
  created_at: string | null;
};

/**
 * Pochettes des cartes hors collection d'un classeur : cartes du catalogue
 * (kind « wanted ») et Pokémon du Pokédex (kind « pokemon », avec ses types
 * pour le rendu de la carte).
 */
export async function placeholderPockets(db: Db, rows: PlaceholderRow[]): Promise<PocketItem[]> {
  const dexIds = [...new Set(rows.map((w) => pokedexIdOf(w.tcgdex_id)).filter((n): n is number => n != null))];
  const types = new Map<number, string[]>();
  if (dexIds.length > 0) {
    const { data } = await db.from("pokedex").select("id, types").in("id", dexIds);
    for (const p of data ?? []) types.set(p.id, p.types ?? []);
  }
  return rows.map((w) => {
    const dex = pokedexIdOf(w.tcgdex_id);
    if (dex != null) {
      return {
        id: `w:${w.id}`,
        kind: "pokemon" as const,
        card_name: w.card_name,
        set_name: POKEDEX_SET_NAME,
        local_id: dexNumber(dex),
        tcgdex_id: w.tcgdex_id,
        image_url: artworkUrl(dex),
        quantity: 1,
        position: w.position,
        created_at: w.created_at ?? "",
        pokemon: { id: dex, types: types.get(dex) ?? [] },
      };
    }
    return {
      id: `w:${w.id}`,
      kind: "wanted" as const,
      card_name: w.card_name,
      set_name: w.set_name,
      local_id: w.local_id,
      tcgdex_id: w.tcgdex_id,
      image_url: w.image_url ?? "",
      quantity: 1,
      position: w.position,
      created_at: w.created_at ?? "",
    };
  });
}
