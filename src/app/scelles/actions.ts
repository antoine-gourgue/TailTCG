"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AddSealedState = { ok: true; name: string } | { ok: false; error: string } | null;

/** Ajoute un lot d'un produit scellé à la collection (quantité, prix et date d'achat) */
export async function addSealedItem(_prev: AddSealedState, formData: FormData): Promise<AddSealedState> {
  const product_id = Number(formData.get("product_id"));
  const quantity = Math.max(1, Math.floor(Number(formData.get("quantity") || 1)));
  const priceRaw = String(formData.get("purchase_price") ?? "").replace(",", ".").trim();
  const purchase_price = priceRaw ? Number(priceRaw) : null;
  const purchase_date = String(formData.get("purchase_date") ?? "").trim() || null;

  if (!Number.isInteger(product_id) || product_id <= 0) return { ok: false, error: "Produit invalide." };
  if (purchase_price != null && (!Number.isFinite(purchase_price) || purchase_price < 0)) {
    return { ok: false, error: "Prix d'achat invalide." };
  }

  const supabase = await createClient();
  const { data: product } = await supabase.from("sealed_products").select("name").eq("id", product_id).maybeSingle();
  if (!product) return { ok: false, error: "Produit introuvable." };

  const { error } = await supabase.from("sealed_items").insert({ product_id, quantity, purchase_price, purchase_date });
  if (error) return { ok: false, error: "Ajout impossible, réessaie." };

  revalidatePath("/scelles");
  return { ok: true, name: product.name };
}

/** Retire un lot de la collection */
export async function removeSealedItem(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("sealed_items").delete().eq("id", id);
  revalidatePath("/scelles");
}
