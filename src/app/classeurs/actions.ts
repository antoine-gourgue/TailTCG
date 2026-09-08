"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  // Chaque nouvelle carte prend la pochette suivante ; celles déjà rangées
  // gardent la leur
  const { data: links } = await supabase
    .from("binder_items")
    .select("item_id, position")
    .eq("binder_id", binderId);
  const present = new Set((links ?? []).map((l) => l.item_id));
  let pocket =
    Math.max(-1, ...(links ?? []).map((l) => l.position ?? -1)) + 1;
  const fresh = [...new Set(itemIds)].filter((id) => !present.has(id));
  if (fresh.length === 0) return { error: null };

  const { error } = await supabase.from("binder_items").insert(
    fresh.map((item_id) => ({ binder_id: binderId, item_id, position: pocket++ }))
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
    await supabase.from("binder_items").insert(
      itemIds.map((item_id, i) => ({ binder_id: data.id, item_id, position: i }))
    );
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

/**
 * Ordre manuel des cartes dans un classeur (ancienne grille réordonnable).
 * Compacte les positions : à ne plus utiliser sur un classeur en pages,
 * où `position` est un numéro de pochette avec des trous.
 */
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
    // La carte prend la pochette suivante dans chacun des classeurs
    const { data: links } = await supabase
      .from("binder_items")
      .select("binder_id, position")
      .in("binder_id", binderIds);
    const last = new Map<string, number>();
    for (const l of links ?? []) {
      last.set(l.binder_id, Math.max(last.get(l.binder_id) ?? -1, l.position ?? -1));
    }
    const { error } = await supabase.from("binder_items").insert(
      binderIds.map((binder_id) => ({
        binder_id,
        item_id: itemId,
        position: (last.get(binder_id) ?? -1) + 1,
      }))
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/classeurs");
  revalidatePath(`/carte/${itemId}`);
  return { error: null };
}

/** Pages : format des feuilles du classeur (3x3, 4x3…) */
export async function updateBinderPageGrid(binderId: string, code: string) {
  if (!UUID_RE.test(binderId)) return { error: "Classeur invalide" };
  const { pageGrid } = await import("@/lib/binder-pages");
  const grid = pageGrid(code);
  if (grid.code !== code) return { error: "Format inconnu" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("binders")
    .update({ page_grid: grid.code })
    .eq("id", binderId);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  return { error: error?.message ?? null };
}

/** Pages : range une carte de la collection dans une pochette libre (ou l'y déplace) */
export async function placeItemInPocket(
  binderId: string,
  itemId: string,
  pocket: number
) {
  if (!UUID_RE.test(binderId) || !UUID_RE.test(itemId)) {
    return { error: "Classeur ou carte invalide" };
  }
  if (!Number.isInteger(pocket) || pocket < 0) {
    return { error: "Pochette invalide" };
  }

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("binder_items")
    .select("item_id, position")
    .eq("binder_id", binderId)
    .or(`item_id.eq.${itemId},position.eq.${pocket}`);
  if (readError) return { error: readError.message };
  if (rows?.some((r) => r.item_id !== itemId && r.position === pocket)) {
    return { error: "Pochette occupée" };
  }

  const already = rows?.some((r) => r.item_id === itemId);
  const { error } = already
    ? await supabase
        .from("binder_items")
        .update({ position: pocket })
        .eq("binder_id", binderId)
        .eq("item_id", itemId)
    : await supabase
        .from("binder_items")
        .insert({ binder_id: binderId, item_id: itemId, position: pocket });

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  revalidatePath(`/carte/${itemId}`);
  return { error: error?.message ?? null };
}

/** Pages : déplace une carte vers une pochette — échange si elle est occupée */
export async function moveBinderItem(
  binderId: string,
  itemId: string,
  toPocket: number
) {
  if (!UUID_RE.test(binderId) || !UUID_RE.test(itemId)) {
    return { error: "Classeur ou carte invalide" };
  }
  if (!Number.isInteger(toPocket) || toPocket < 0) {
    return { error: "Pochette invalide" };
  }

  const supabase = await createClient();
  const { data: rows, error: readError } = await supabase
    .from("binder_items")
    .select("item_id, position")
    .eq("binder_id", binderId)
    .or(`item_id.eq.${itemId},position.eq.${toPocket}`);
  if (readError) return { error: readError.message };

  const mover = rows?.find((r) => r.item_id === itemId);
  if (!mover) return { error: "Carte absente du classeur" };
  const occupant = rows?.find(
    (r) => r.item_id !== itemId && r.position === toPocket
  );
  if (occupant && mover.position == null) return { error: "Pochette occupée" };

  const updates = [
    supabase
      .from("binder_items")
      .update({ position: toPocket })
      .eq("binder_id", binderId)
      .eq("item_id", itemId),
  ];
  if (occupant) {
    updates.push(
      supabase
        .from("binder_items")
        .update({ position: mover.position })
        .eq("binder_id", binderId)
        .eq("item_id", occupant.item_id)
    );
  }
  const results = await Promise.all(updates);

  revalidatePath(`/classeurs/${binderId}`);
  return { error: results.find((r) => r.error)?.error?.message ?? null };
}
