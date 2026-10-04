import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { PLAYABLE_BY_ID, type PlayableSet } from "@/lib/game-sets";

/**
 * Chiffres de la page d'accueil : taille du catalogue, nombre d'extensions,
 * produits scellés suivis. Ce sont des agrégats publics (aucune donnée
 * d'utilisateur), lus avec le client service role parce que les tables du
 * catalogue ne sont lisibles qu'une fois connecté. Recalculés une fois par
 * jour ; en cas de pépin, des ordres de grandeur connus.
 */
export type LandingStats = {
  cards: number;
  sets: number;
  jaSets: number;
  sealed: number;
  /** Sets jouables dans les boosters */
  playable: number;
};

const FALLBACK: LandingStats = { cards: 43_000, sets: 516, jaSets: 329, sealed: 2_669, playable: PLAYABLE_BY_ID.size };

export const landingStats = unstable_cache(
  async (): Promise<LandingStats> => {
    try {
      const db = createAdminClient();
      const [cards, sets, jaSets, sealed] = await Promise.all([
        db.from("catalog_cards").select("*", { count: "exact", head: true }),
        db.from("catalog_sets").select("*", { count: "exact", head: true }),
        db.from("catalog_sets").select("*", { count: "exact", head: true }).eq("lang", "ja"),
        db.from("sealed_products").select("*", { count: "exact", head: true }),
      ]);
      return {
        cards: cards.count || FALLBACK.cards,
        sets: sets.count || FALLBACK.sets,
        jaSets: jaSets.count || FALLBACK.jaSets,
        sealed: sealed.count || FALLBACK.sealed,
        playable: PLAYABLE_BY_ID.size,
      };
    } catch {
      return FALLBACK;
    }
  },
  ["landing-stats"],
  { revalidate: 86_400 }
);

/** Les trois paquets illustrés sur l'accueil : Chaos Ascendant, Nuit Noire au centre, 151 */
export function landingPacks(): PlayableSet[] {
  const wanted = ["me04", "me05", "sv03.5"].map((id) => PLAYABLE_BY_ID.get(id)).filter((s): s is PlayableSet => !!s);
  if (wanted.length === 3) return wanted;
  return [...PLAYABLE_BY_ID.values()].slice(0, 3);
}
