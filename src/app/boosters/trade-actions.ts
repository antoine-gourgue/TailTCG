"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Result = { error: string } | { ok: true };

async function me() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/** Met (ou retire) une carte sur la place d'échange */
export async function setForTrade(cardId: string, on: boolean): Promise<Result> {
  if (!UUID.test(cardId)) return { error: "Carte invalide" };
  const uid = await me();
  if (!uid) return { error: "Non connecté" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_cards")
    .update({ for_trade: on })
    .eq("id", cardId)
    .eq("owner_id", uid);
  if (error) return { error: "Enregistrement impossible" };
  revalidatePath("/boosters/echanges");
  return { ok: true };
}

/** Met (ou retire) plusieurs cartes sur la place d'échange d'un coup */
export async function setForTradeMany(cardIds: string[], on: boolean): Promise<Result> {
  const ids = [...new Set(cardIds)].filter((id) => UUID.test(id)).slice(0, 500);
  if (ids.length === 0) return { error: "Aucune carte" };
  const uid = await me();
  if (!uid) return { error: "Non connecté" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_cards")
    .update({ for_trade: on })
    .in("id", ids)
    .eq("owner_id", uid);
  if (error) return { error: "Enregistrement impossible" };
  revalidatePath("/boosters/echanges");
  return { ok: true };
}

/** Propose sa carte (from) contre une carte à échanger d'un autre (to) */
export async function proposeTrade(fromCardId: string, toCardId: string): Promise<Result> {
  if (!UUID.test(fromCardId) || !UUID.test(toCardId) || fromCardId === toCardId) {
    return { error: "Cartes invalides" };
  }
  const uid = await me();
  if (!uid) return { error: "Non connecté" };
  const admin = createAdminClient();
  const { data: cards } = await admin
    .from("game_cards")
    .select("id, owner_id, tier, for_trade")
    .in("id", [fromCardId, toCardId]);
  const from = cards?.find((c) => c.id === fromCardId);
  const to = cards?.find((c) => c.id === toCardId);
  if (!from || !to) return { error: "Carte introuvable" };
  if (from.owner_id !== uid) return { error: "Cette carte n'est pas la tienne" };
  if (to.owner_id === uid) return { error: "Cette carte est déjà à toi" };
  if (!to.for_trade) return { error: "Cette carte n'est plus à échanger" };
  if (from.tier !== to.tier) return { error: "Les deux cartes doivent être de même rareté" };

  // Pas deux fois la même proposition en attente
  const { data: dup } = await admin
    .from("game_trades")
    .select("id")
    .eq("from_owner", uid)
    .eq("from_card_id", fromCardId)
    .eq("to_card_id", toCardId)
    .eq("status", "pending")
    .maybeSingle();
  if (dup) return { error: "Proposition déjà envoyée" };

  const { error } = await admin.from("game_trades").insert({
    from_owner: uid,
    to_owner: to.owner_id,
    from_card_id: fromCardId,
    to_card_id: toCardId,
    tier: to.tier,
  });
  if (error) return { error: "Proposition impossible, réessaie." };
  revalidatePath("/boosters/echanges");
  return { ok: true };
}

/** Le destinataire accepte (échange atomique) ou refuse une proposition */
export async function respondTrade(tradeId: string, accept: boolean): Promise<Result> {
  if (!UUID.test(tradeId)) return { error: "Échange invalide" };
  const uid = await me();
  if (!uid) return { error: "Non connecté" };
  const admin = createAdminClient();
  if (accept) {
    const { data, error } = await admin.rpc("accept_game_trade", { p_trade: tradeId, p_user: uid });
    if (error) return { error: "Échange impossible, réessaie." };
    if (data !== "ok") {
      return {
        error:
          data === "indisponible"
            ? "Une des cartes n'est plus disponible."
            : data === "traité"
              ? "Cet échange a déjà été traité."
              : "Échange impossible.",
      };
    }
  } else {
    const { error } = await admin
      .from("game_trades")
      .update({ status: "declined", resolved_at: new Date().toISOString() })
      .eq("id", tradeId)
      .eq("to_owner", uid)
      .eq("status", "pending");
    if (error) return { error: "Action impossible" };
  }
  revalidatePath("/boosters/echanges");
  revalidatePath("/boosters/collection");
  return { ok: true };
}

/** Le proposant annule sa proposition en attente */
export async function cancelTrade(tradeId: string): Promise<Result> {
  if (!UUID.test(tradeId)) return { error: "Échange invalide" };
  const uid = await me();
  if (!uid) return { error: "Non connecté" };
  const admin = createAdminClient();
  const { error } = await admin
    .from("game_trades")
    .update({ status: "cancelled", resolved_at: new Date().toISOString() })
    .eq("id", tradeId)
    .eq("from_owner", uid)
    .eq("status", "pending");
  if (error) return { error: "Annulation impossible" };
  revalidatePath("/boosters/echanges");
  return { ok: true };
}
