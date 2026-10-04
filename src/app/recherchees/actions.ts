"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WishlistState = { wished: boolean } | null;
export type WishPriority = "high" | "normal" | "low";

export type WishInput = {
  tcgdex_id: string;
  card_name: string;
  set_id: string;
  set_name: string;
  local_id: string;
  image_url: string;
};

// Ajoute/retire une carte des recherchées
export async function toggleWishlist(
  _prev: WishlistState,
  formData: FormData
): Promise<WishlistState> {
  const tcgdex_id = String(formData.get("tcgdex_id") ?? "").trim();
  if (!tcgdex_id) return null;

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("wishlist")
    .select("id")
    .eq("tcgdex_id", tcgdex_id)
    .maybeSingle();

  if (existing) {
    await supabase.from("wishlist").delete().eq("id", existing.id);
    revalidatePath("/recherchees");
    return { wished: false };
  }

  await supabase.from("wishlist").insert({
    tcgdex_id,
    card_name: String(formData.get("card_name") ?? "").trim(),
    set_name: String(formData.get("set_name") ?? "").trim(),
    set_id: String(formData.get("set_id") ?? "").trim(),
    local_id: String(formData.get("local_id") ?? "").trim(),
    image_url: String(formData.get("image_url") ?? "").trim(),
  });
  revalidatePath("/recherchees");
  return { wished: true };
}

/** Plusieurs cartes d'un coup (celles déjà recherchées sont ignorées) ; renvoie le nombre ajouté */
export async function addManyToWishlist(cards: WishInput[]): Promise<{ added: number; error?: string }> {
  const list = cards.filter((c) => c.tcgdex_id).slice(0, 200);
  if (list.length === 0) return { added: 0 };
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("wishlist")
    .select("tcgdex_id")
    .in("tcgdex_id", list.map((c) => c.tcgdex_id));
  const have = new Set((existing ?? []).map((w) => w.tcgdex_id));
  const rows = list.filter((c) => !have.has(c.tcgdex_id));
  if (rows.length === 0) return { added: 0 };
  const { error } = await supabase.from("wishlist").insert(rows);
  if (error) return { added: 0, error: error.message };
  revalidatePath("/recherchees");
  return { added: rows.length };
}

export async function removeFromWishlist(formData: FormData): Promise<void> {
  const id = String(formData.get("wish_id") ?? "").trim();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("wishlist").delete().eq("id", id);
  revalidatePath("/recherchees");
}

/** Priorité et prix cible d'une carte recherchée */
export async function updateWish(formData: FormData): Promise<void> {
  const id = String(formData.get("wish_id") ?? "").trim();
  if (!id) return;
  const p = String(formData.get("priority") ?? "normal");
  const priority: WishPriority = p === "high" || p === "low" ? p : "normal";
  const raw = String(formData.get("target_price") ?? "").replace(/\s/g, "").replace(",", ".");
  const n = Number(raw);
  const target_price = raw === "" || !Number.isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100;
  const supabase = await createClient();
  await supabase.from("wishlist").update({ priority, target_price }).eq("id", id);
  revalidatePath("/recherchees");
}
