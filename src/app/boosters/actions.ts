"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSet } from "@/lib/tcgdex";
import {
  drawPack,
  formatCountdown,
  MAX_STOCK,
  PACK_SIZE,
  settleStock,
  tierOf,
  type Profile,
  type Tier,
} from "@/lib/game";

export type DrawnCard = {
  id: string;
  tcgdex_id: string;
  name: string;
  local_id: string;
  image: string | null;
  rarity: string | null;
  tier: Tier;
  /** Première fois que cette carte entre dans la collection virtuelle */
  isNew: boolean;
};

export type OpenResult =
  | { error: string }
  | { cards: DrawnCard[]; profile: Profile; setId: string; setName: string };

const rand = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32;

/**
 * Ouvre un booster d'un set : débite la réserve, tire 5 cartes côté serveur
 * et les ajoute à la collection virtuelle du joueur. Tout passe par le
 * service role après vérification de l'utilisateur.
 */
export async function openBooster(setId: string): Promise<OpenResult> {
  if (!setId || setId.length > 40) return { error: "Set invalide" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const admin = createAdminClient();
  const { data: prof } = await admin
    .from("game_profiles")
    .select("boosters, refill_at, opened")
    .eq("owner_id", user.id)
    .maybeSingle();
  const now = Date.now();
  const profile: Profile = prof ?? { boosters: MAX_STOCK, refill_at: new Date(now).toISOString() };
  const s = settleStock(profile, now);
  if (s.stock < 1) {
    return { error: `Plus de booster : le prochain arrive dans ${formatCountdown((s.nextAt ?? now) - now)}.` };
  }

  const set = await getSet(setId, "fr");
  if (!set) return { error: "Set introuvable" };
  const pool = (set.cards ?? [])
    .filter((c) => !!c.image)
    .map((c) => ({ ...c, tier: tierOf(c.rarity) }));
  if (pool.length < PACK_SIZE) return { error: "Ce set n'a pas assez de cartes." };
  const drawn = drawPack(pool, rand);

  // Cartes déjà possédées dans ce set → badge « Nouvelle » sur les autres
  const { data: owned } = await admin
    .from("game_cards")
    .select("tcgdex_id")
    .eq("owner_id", user.id)
    .eq("set_id", set.id);
  const ownedIds = new Set((owned ?? []).map((o) => o.tcgdex_id));

  const { data: inserted, error } = await admin
    .from("game_cards")
    .insert(
      drawn.map((c) => ({
        owner_id: user.id,
        tcgdex_id: c.id,
        set_id: set.id,
        set_name: set.name,
        card_name: c.name,
        local_id: c.localId,
        image_url: c.image ?? null,
        rarity: c.rarity ?? null,
        tier: c.tier,
        source: "booster",
      }))
    )
    .select("id");
  if (error || !inserted) return { error: "Ouverture impossible, réessaie." };

  const nextProfile: Profile = {
    boosters: s.stock - 1,
    // Réserve pleine avant l'ouverture : le compteur repart maintenant
    refill_at: new Date(s.stock >= MAX_STOCK ? now : s.refillAt).toISOString(),
  };
  await Promise.all([
    admin
      .from("game_profiles")
      .upsert({ owner_id: user.id, ...nextProfile, opened: (prof?.opened ?? 0) + 1 }),
    admin
      .from("game_openings")
      .insert({ owner_id: user.id, set_id: set.id, tcgdex_ids: drawn.map((c) => c.id) }),
  ]);

  revalidatePath("/boosters");
  revalidatePath("/boosters/collection");
  return {
    setId: set.id,
    setName: set.name,
    profile: nextProfile,
    cards: drawn.map((c, i) => ({
      id: inserted[i]?.id ?? `${c.id}-${i}`,
      tcgdex_id: c.id,
      name: c.name,
      local_id: c.localId,
      image: c.image ?? null,
      rarity: c.rarity ?? null,
      tier: c.tier,
      isNew: !ownedIds.has(c.id) && drawn.findIndex((d) => d.id === c.id) === i,
    })),
  };
}
