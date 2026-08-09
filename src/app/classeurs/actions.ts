"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createBinder(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binders")
    .insert({ name })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Création impossible");

  revalidatePath("/classeurs");
  redirect(`/classeurs/${data.id}`);
}

export async function renameBinder(formData: FormData) {
  const binderId = String(formData.get("binder_id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!binderId || !name) return;

  const supabase = await createClient();
  await supabase.from("binders").update({ name }).eq("id", binderId);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
}

export async function deleteBinder(formData: FormData) {
  const binderId = String(formData.get("binder_id") ?? "");
  if (!binderId) return;

  const supabase = await createClient();
  await supabase.from("binders").delete().eq("id", binderId);

  revalidatePath("/classeurs");
  redirect("/classeurs");
}

export async function addItemsToBinder(binderId: string, itemIds: string[]) {
  if (!binderId || itemIds.length === 0) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase.from("binder_items").upsert(
    itemIds.map((item_id) => ({ binder_id: binderId, item_id })),
    { onConflict: "binder_id,item_id", ignoreDuplicates: true }
  );

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

export async function createBinderAndAdd(name: string, itemIds: string[]) {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Nom manquant" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("binders")
    .insert({ name: trimmed })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Création impossible" };

  if (itemIds.length > 0) {
    await supabase
      .from("binder_items")
      .insert(itemIds.map((item_id) => ({ binder_id: data.id, item_id })));
  }

  revalidatePath("/classeurs");
  return { error: null, binderId: data.id };
}

export async function removeItemsFromBinder(binderId: string, itemIds: string[]) {
  if (!binderId || itemIds.length === 0) return { error: null };

  const supabase = await createClient();
  const { error } = await supabase
    .from("binder_items")
    .delete()
    .eq("binder_id", binderId)
    .in("item_id", itemIds);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

/** Ordre manuel des classeurs (glisser-déposer sur la page Classeurs) */
export async function reorderBinders(binderIds: string[]) {
  if (binderIds.length === 0) return { error: null };
  const supabase = await createClient();
  const results = await Promise.all(
    binderIds.map((id, i) =>
      supabase.from("binders").update({ position: i }).eq("id", id)
    )
  );
  revalidatePath("/classeurs");
  return { error: results.find((r) => r.error)?.error?.message ?? null };
}

/** Ordre manuel des cartes dans un classeur */
export async function reorderBinderItems(binderId: string, itemIds: string[]) {
  if (!binderId || itemIds.length === 0) return { error: null };
  const supabase = await createClient();
  const results = await Promise.all(
    itemIds.map((itemId, i) =>
      supabase
        .from("binder_items")
        .update({ position: i })
        .eq("binder_id", binderId)
        .eq("item_id", itemId)
    )
  );
  revalidatePath(`/classeurs/${binderId}`);
  return { error: results.find((r) => r.error)?.error?.message ?? null };
}

/** Apparence du classeur : couleur de tranche + cartes de couverture */
export async function updateBinderStyle(
  binderId: string,
  color: string | null,
  coverItemIds: string[],
  style: string
) {
  if (!binderId) return { error: "Classeur manquant" };
  const { BINDER_COLORS } = await import("@/lib/binder-colors");
  const { binderStyle, binderStyleCovers } = await import("@/lib/binder-styles");
  const safeColor =
    color && BINDER_COLORS.some((c) => c.code === color) ? color : null;
  const safeStyle = binderStyle(style);

  const supabase = await createClient();
  // Seules les cartes réellement dans le classeur peuvent servir de couverture
  const { data: links } = await supabase
    .from("binder_items")
    .select("item_id")
    .eq("binder_id", binderId);
  const memberIds = new Set((links ?? []).map((l) => l.item_id));
  const covers = coverItemIds
    .filter((id) => memberIds.has(id))
    .slice(0, binderStyleCovers(safeStyle));

  const { error } = await supabase
    .from("binders")
    .update({
      color: safeColor,
      cover_item_ids: covers.length ? covers : null,
      style: safeStyle,
    })
    .eq("id", binderId);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

/** Fiche carte : remplace l'appartenance de l'exemplaire par la sélection */
export async function setItemBinders(itemId: string, binderIds: string[]) {
  if (!itemId) return { error: "Carte manquante" };

  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("binder_items")
    .delete()
    .eq("item_id", itemId);
  if (delError) return { error: delError.message };

  if (binderIds.length > 0) {
    const { error } = await supabase
      .from("binder_items")
      .insert(binderIds.map((binder_id) => ({ binder_id, item_id: itemId })));
    if (error) return { error: error.message };
  }

  revalidatePath("/classeurs");
  revalidatePath(`/carte/${itemId}`);
  return { error: null };
}
