"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSet } from "@/lib/tcgdex";
import { imagedCardIds } from "@/lib/game-sets";
import { loadSetPool, type PoolCard } from "@/lib/game-pool";
import {
  drawPack,
  formatCountdown,
  MAX_STOCK,
  PACK_SIZE,
  rollGrade,
  settleStock,
  tierOf,
  UNLIMITED_BOOSTERS,
  type Grade,
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
  if (!UNLIMITED_BOOSTERS && s.stock < 1) {
    return { error: `Plus de booster : le prochain arrive dans ${formatCountdown((s.nextAt ?? now) - now)}.` };
  }

  // Cartes du set embarquées dans le dépôt ; TCGdex seulement pour un set
  // absent de l'instantané
  let setName: string;
  let cards: PoolCard[];
  const local = await loadSetPool(setId);
  if (local) {
    setName = local.name;
    cards = local.cards;
  } else {
    const [set, imaged] = await Promise.all([getSet(setId, "fr"), imagedCardIds(setId)]);
    if (!set) return { error: "Set introuvable" };
    setName = set.name;
    // Seules les cartes dont le visuel existe vraiment sur le CDN
    cards = (set.cards ?? [])
      .filter((c) => !!c.image && (imaged.size === 0 || imaged.has(c.id)))
      .map((c) => ({ id: c.id, localId: c.localId, name: c.name, image: c.image!, rarity: c.rarity ?? null }));
  }
  const pool = cards.map((c) => ({ ...c, tier: tierOf(c.rarity) }));
  if (pool.length < PACK_SIZE) return { error: "Ce set n'a pas assez de cartes." };
  const drawn = drawPack(pool, rand);

  // Cartes déjà possédées dans ce set → badge « Nouvelle » sur les autres
  const { data: owned } = await admin
    .from("game_cards")
    .select("tcgdex_id")
    .eq("owner_id", user.id)
    .eq("set_id", setId);
  const ownedIds = new Set((owned ?? []).map((o) => o.tcgdex_id));

  const { data: inserted, error } = await admin
    .from("game_cards")
    .insert(
      drawn.map((c) => {
        // Potentiel de gradation caché, figé au tirage
        const g = rollGrade(Math.random);
        return {
          owner_id: user.id,
          tcgdex_id: c.id,
          set_id: setId,
          set_name: setName,
          card_name: c.name,
          local_id: c.localId,
          image_url: c.image ?? null,
          rarity: c.rarity ?? null,
          tier: c.tier,
          source: "booster",
          grade_centering: g.centering,
          grade_corners: g.corners,
          grade_edges: g.edges,
          grade_surface: g.surface,
          grade_overall: g.overall,
        };
      })
    )
    .select("id");
  if (error || !inserted) return { error: "Ouverture impossible, réessaie." };

  const nextProfile: Profile = UNLIMITED_BOOSTERS
    ? { boosters: MAX_STOCK, refill_at: new Date(now).toISOString() }
    : {
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
      .insert({ owner_id: user.id, set_id: setId, tcgdex_ids: drawn.map((c) => c.id) }),
  ]);

  return {
    setId,
    setName,
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

/**
 * Fait « grader » une carte du jeu : révèle son potentiel caché (déjà figé au
 * tirage) et la marque comme gradée. Renvoie les notes.
 */
export async function gradeGameCard(
  cardId: string
): Promise<{ error: string } | { grade: Grade }> {
  if (!cardId) return { error: "Carte invalide" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const admin = createAdminClient();
  const { data: card } = await admin
    .from("game_cards")
    .select("owner_id, graded, grade_centering, grade_corners, grade_edges, grade_surface, grade_overall")
    .eq("id", cardId)
    .maybeSingle();
  if (!card || card.owner_id !== user.id) return { error: "Carte introuvable" };
  if (card.grade_overall == null) return { error: "Cette carte ne peut pas être gradée." };

  if (!card.graded) {
    const { error } = await admin
      .from("game_cards")
      .update({ graded: true, graded_at: new Date().toISOString() })
      .eq("id", cardId);
    if (error) return { error: "Gradation impossible, réessaie." };
  }
  return {
    grade: {
      centering: card.grade_centering ?? 0,
      corners: card.grade_corners ?? 0,
      edges: card.grade_edges ?? 0,
      surface: card.grade_surface ?? 0,
      overall: card.grade_overall,
    },
  };
}

export type GradedResult = { id: string; grade: Grade };

/** Grade plusieurs cartes d'un coup : révèle leur potentiel caché et les
 * marque gradées. Renvoie les notes par carte. */
export async function gradeGameCards(
  ids: string[]
): Promise<{ error: string } | { graded: GradedResult[] }> {
  const clean = [...new Set(ids)].filter(Boolean).slice(0, 200);
  if (clean.length === 0) return { error: "Aucune carte sélectionnée." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("game_cards")
    .select("id, graded, grade_centering, grade_corners, grade_edges, grade_surface, grade_overall")
    .in("id", clean)
    .eq("owner_id", user.id);
  const valid = (rows ?? []).filter((r) => r.grade_overall != null);
  if (valid.length === 0) return { error: "Ces cartes ne peuvent pas être gradées." };

  const toMark = valid.filter((r) => !r.graded).map((r) => r.id);
  if (toMark.length > 0) {
    const { error } = await admin
      .from("game_cards")
      .update({ graded: true, graded_at: new Date().toISOString() })
      .in("id", toMark);
    if (error) return { error: "Gradation impossible, réessaie." };
  }

  return {
    graded: valid.map((r) => ({
      id: r.id,
      grade: {
        centering: r.grade_centering ?? 0,
        corners: r.grade_corners ?? 0,
        edges: r.grade_edges ?? 0,
        surface: r.grade_surface ?? 0,
        overall: r.grade_overall!,
      },
    })),
  };
}
