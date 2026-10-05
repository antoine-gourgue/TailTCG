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

export type SealedValueState = { ok: true } | { ok: false; error: string } | null;

/**
 * « Ma valeur » : prix unitaire que je fixe moi-même pour mes exemplaires d'un
 * produit, à la place de la cote (`manual_price` sur chacun de mes lots).
 * Vide, ou `clear=1` : retour à la cote. La RLS limite la mise à jour à mes lots.
 */
export async function setSealedValue(_prev: SealedValueState, formData: FormData): Promise<SealedValueState> {
  const product_id = Number(formData.get("product_id"));
  const raw = String(formData.get("value") ?? "").replace(",", ".").trim();
  const clear = formData.get("clear") === "1";
  const value = clear || !raw ? null : Number(raw);

  if (!Number.isInteger(product_id) || product_id <= 0) return { ok: false, error: "Produit invalide." };
  if (value != null && (!Number.isFinite(value) || value < 0)) return { ok: false, error: "Valeur invalide." };

  const supabase = await createClient();
  const { error } = await supabase.from("sealed_items").update({ manual_price: value }).eq("product_id", product_id);
  if (error) return { ok: false, error: "Enregistrement impossible, réessaie." };

  revalidatePath("/scelles");
  revalidatePath(`/scelles/produit/${product_id}`);
  revalidatePath("/collection");
  return { ok: true };
}
