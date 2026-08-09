"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";
import {
  CONDITION_CODES,
  SOURCE_KIND_VALUES,
  GEOCODED_KINDS,
  type ConditionCode,
  type SourceKind,
} from "@/lib/domain";
import type { Database } from "@/lib/database.types";

type ItemInsert = Database["public"]["Tables"]["items"]["Insert"];

export type ItemFormState = { message: string } | null;

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function strOrNull(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === "" ? null : v;
}

function parseItemFields(formData: FormData): {
  fields?: Omit<ItemInsert, "tcgdex_id" | "card_name" | "set_name" | "set_id" | "local_id" | "image_url">;
  error?: string;
} {
  const condition = str(formData, "condition");
  if (!CONDITION_CODES.includes(condition as ConditionCode)) {
    return { error: "Choisis un état." };
  }

  const quantity = Number.parseInt(str(formData, "quantity") || "1", 10);
  if (!Number.isInteger(quantity) || quantity < 1) {
    return { error: "La quantité doit être un entier ≥ 1." };
  }

  const priceRaw = str(formData, "purchase_price").replace(",", ".");
  const purchase_price = priceRaw === "" ? null : Number.parseFloat(priceRaw);
  if (purchase_price !== null && (Number.isNaN(purchase_price) || purchase_price < 0)) {
    return { error: "Prix payé invalide." };
  }

  const manualRaw = str(formData, "manual_price").replace(",", ".");
  const manual_price = manualRaw === "" ? null : Number.parseFloat(manualRaw);
  if (manual_price !== null && (Number.isNaN(manual_price) || manual_price < 0)) {
    return { error: "Cote perso invalide." };
  }

  return {
    fields: {
      condition,
      quantity,
      purchase_price,
      manual_price,
      purchase_date: strOrNull(formData, "purchase_date"),
      card_type: strOrNull(formData, "card_type"),
      language: str(formData, "language") || "FR",
      source_id: strOrNull(formData, "source_id"),
      cardmarket_url: strOrNull(formData, "cardmarket_url"),
      graded: formData.get("graded") === "on",
      grade: strOrNull(formData, "grade"),
      notes: strOrNull(formData, "notes"),
    },
  };
}

export async function createItem(
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const { fields, error } = parseItemFields(formData);
  if (error || !fields) return { message: error ?? "Formulaire invalide." };

  const tcgdex_id = str(formData, "tcgdex_id");
  const set_id = str(formData, "set_id");
  const image_url = str(formData, "image_url");
  const card_name = str(formData, "card_name");
  const set_name = str(formData, "set_name");
  const local_id = str(formData, "local_id");
  if (!tcgdex_id || !card_name || !set_id || !set_name || !local_id) {
    return { message: "Données de carte manquantes, repasse par la recherche." };
  }

  const supabase = await createClient();

  // Un visuel « storage: » ne peut référencer qu'une carte perso de
  // l'appelant (audit — sinon signature d'un fichier d'un autre compte)
  if (image_url.startsWith("storage:")) {
    const { data: own } = await supabase
      .from("custom_cards")
      .select("id")
      .eq("image_path", image_url.slice("storage:".length))
      .maybeSingle();
    if (!own) return { message: "Visuel invalide." };
  }

  const { data: created, error: dbError } = await supabase
    .from("items")
    .insert({
      ...fields,
      tcgdex_id,
      card_name,
      set_id,
      set_name,
      local_id,
      image_url,
    })
    .select("id")
    .single();

  if (dbError || !created) {
    console.error("createItem:", dbError?.message);
    return { message: "Enregistrement impossible, réessaie." };
  }

  if (fields.manual_price != null) {
    await recordValue(supabase, created.id, fields.manual_price);
  }

  // Trouvée ! Elle sort automatiquement des recherchées
  await supabase.from("wishlist").delete().eq("tcgdex_id", tcgdex_id);

  revalidatePath("/");
  revalidatePath("/wishlist");
  redirect("/");
}

// Historise la valeur estimée du jour (la dernière saisie du jour gagne)
async function recordValue(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string,
  value: number
) {
  await supabase.from("item_value_history").upsert(
    {
      item_id: itemId,
      value,
      recorded_at: new Date().toISOString().slice(0, 10),
    },
    { onConflict: "item_id,recorded_at" }
  );
}

export async function updateItem(
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const id = str(formData, "item_id");
  if (!id) return { message: "Exemplaire introuvable." };

  const { fields, error } = parseItemFields(formData);
  if (error || !fields) return { message: error ?? "Formulaire invalide." };

  // Cartes manuelles : nom/set/numéro également éditables
  const card_name = strOrNull(formData, "card_name");
  const metaFields =
    card_name != null
      ? {
          card_name,
          set_name: str(formData, "set_name") || "—",
          local_id: str(formData, "local_id") || "—",
        }
      : {};

  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from("items")
    .update({ ...fields, ...metaFields })
    .eq("id", id);

  if (dbError) {
    console.error("updateItem:", dbError.message);
    return { message: "Mise à jour impossible, réessaie." };
  }

  if (fields.manual_price != null) {
    await recordValue(supabase, id, fields.manual_price);
  }

  revalidatePath("/");
  revalidatePath(`/carte/${id}`);
  redirect(`/carte/${id}`);
}

export type QuickValueState = { ok: boolean; message?: string } | null;

// Actualisation rapide de la valeur estimée depuis la fiche (point daté)
export async function updateItemValue(
  _prev: QuickValueState,
  formData: FormData
): Promise<QuickValueState> {
  const id = str(formData, "item_id");
  if (!id) return { ok: false, message: "Exemplaire introuvable." };

  const raw = str(formData, "value").replace(",", ".");
  const value = Number.parseFloat(raw);
  if (Number.isNaN(value) || value < 0) {
    return { ok: false, message: "Valeur invalide." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ manual_price: value })
    .eq("id", id);
  if (error) {
    console.error("updateItemValue:", error.message);
    return { ok: false, message: "Impossible, réessaie." };
  }

  await recordValue(supabase, id, value);

  revalidatePath("/");
  revalidatePath(`/carte/${id}`);
  return { ok: true };
}

export type SellState = { ok: boolean; message?: string } | null;

// Marque un exemplaire vendu (il sort de la collection active)
export async function markItemSold(
  _prev: SellState,
  formData: FormData
): Promise<SellState> {
  const id = str(formData, "item_id");
  if (!id) return { ok: false, message: "Exemplaire introuvable." };

  const raw = str(formData, "sold_price").replace(",", ".");
  const sold_price = Number.parseFloat(raw);
  if (Number.isNaN(sold_price) || sold_price < 0) {
    return { ok: false, message: "Prix de vente invalide." };
  }
  const sold_at =
    strOrNull(formData, "sold_at") ?? new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ sold_price, sold_at })
    .eq("id", id);
  if (error) {
    console.error("markItemSold:", error.message);
    return { ok: false, message: "Impossible, réessaie." };
  }

  revalidatePath("/");
  revalidatePath(`/carte/${id}`);
  return { ok: true };
}

// Annule une vente : l'exemplaire revient dans la collection active
export async function cancelSale(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase
    .from("items")
    .update({ sold_price: null, sold_at: null })
    .eq("id", id);
  revalidatePath("/");
  revalidatePath(`/carte/${id}`);
}

// Supprime un relevé de valeur erroné et recale la valeur actuelle de la
// carte sur le dernier relevé restant
export async function deleteValuePoint(formData: FormData): Promise<void> {
  const pointId = str(formData, "point_id");
  if (!pointId) return;

  const supabase = await createClient();
  // La RLS garantit que le relevé m'appartient
  const { data: point } = await supabase
    .from("item_value_history")
    .select("id, item_id")
    .eq("id", pointId)
    .single();
  if (!point) return;

  await supabase.from("item_value_history").delete().eq("id", pointId);

  const { data: latest } = await supabase
    .from("item_value_history")
    .select("value")
    .eq("item_id", point.item_id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase
    .from("items")
    .update({ manual_price: latest?.value ?? null })
    .eq("id", point.item_id);

  revalidatePath("/");
  revalidatePath(`/carte/${point.item_id}`);
}

// Suppression douce : l'exemplaire part à la corbeille (Paramètres),
// restaurable pendant 30 jours avant purge automatique par le cron
export async function deleteItem(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/");
  redirect(`/?deleted=${id}`);
}

export async function restoreItem(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("items").update({ deleted_at: null }).eq("id", id);

  revalidatePath("/");
  revalidatePath("/parametres");
}

/** Corbeille : suppression définitive (photos et historique compris) */
export async function purgeItem(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("items").delete().eq("id", id).not("deleted_at", "is", null);

  revalidatePath("/parametres");
}

/** Enregistre une pré-gradation (atelier guidé de la fiche carte).
 * FormData pour transporter le visuel redressé (calque carte). */
export async function saveGrading(formData: FormData) {
  const itemId = str(formData, "item_id");
  if (!itemId) return { error: "Carte manquante" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  // L'exemplaire doit appartenir à l'appelant avant tout upload (audit)
  const { data: owned } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .maybeSingle();
  if (!owned) return { error: "Exemplaire introuvable" };

  const num = (k: string) => Number.parseInt(str(formData, k), 10);

  // Visuels redressés (recto/verso) : bucket privé, comme les photos perso.
  // Chemin en UUID aléatoire (pas d'itemId brut), taille et type validés.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  async function uploadRectified(field: string): Promise<string | null> {
    const file = formData.get(field);
    if (!(file instanceof File) || file.size === 0) return null;
    if (file.size > 5_000_000 || !file.type.startsWith("image/")) return null;
    const path = `${user!.id}/gradings/${randomUUID()}.jpg`;
    const { error: upError } = await admin.storage
      .from("card-photos")
      .upload(path, file, { contentType: "image/jpeg" });
    return upError ? null : path;
  }

  const rectified_path = await uploadRectified("rectified");
  const rectified_verso_path = await uploadRectified("rectified_verso");

  const { error } = await supabase.from("item_gradings").insert({
    item_id: itemId,
    centering: num("centering"),
    corners: num("corners"),
    edges: num("edges"),
    surface: num("surface"),
    grade: num("grade"),
    ratios: JSON.parse(str(formData, "ratios") || "null"),
    details: JSON.parse(str(formData, "details") || "null"),
    rectified_path,
    rectified_verso_path,
  });

  revalidatePath(`/carte/${itemId}`);
  revalidatePath("/pregrades");
  return { error: error?.message ?? null };
}

export type SourceOption = {
  id: string;
  name: string;
  kind: SourceKind;
  city: string | null;
  url: string | null;
};

export async function createSource(input: {
  name: string;
  kind: SourceKind;
  address?: string;
  city?: string;
  url?: string;
}): Promise<{ source?: SourceOption; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Le nom est obligatoire." };
  if (!SOURCE_KIND_VALUES.includes(input.kind)) {
    return { error: "Type de source invalide." };
  }

  const address = input.address?.trim() || null;
  const city = input.city?.trim() || null;

  // Boutique physique : géocodée à l'enregistrement (Nominatim, 1 requête)
  const coords =
    GEOCODED_KINDS.includes(input.kind) ? await geocodeAddress(address, city) : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sources")
    .insert({
      name,
      kind: input.kind,
      address,
      city,
      url: input.url?.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    })
    .select("id, name, kind, city, url")
    .single();

  if (error || !data) {
    return { error: `Création impossible : ${error?.message ?? "inconnue"}` };
  }

  return { source: data as SourceOption };
}
