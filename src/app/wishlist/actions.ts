"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type WishlistState = { wished: boolean } | null;

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
    revalidatePath("/wishlist");
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
  revalidatePath("/wishlist");
  return { wished: true };
}

export async function removeFromWishlist(formData: FormData): Promise<void> {
  const id = String(formData.get("wish_id") ?? "").trim();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("wishlist").delete().eq("id", id);
  revalidatePath("/wishlist");
}
