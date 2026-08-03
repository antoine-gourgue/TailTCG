"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { geocodeAddress } from "@/lib/geocode";
import { CONDITION_CODES, type ConditionCode } from "@/lib/domain";
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
  const card_name = str(formData, "card_name");
  const set_id = str(formData, "set_id");
  const set_name = str(formData, "set_name");
  const local_id = str(formData, "local_id");
  const image_url = str(formData, "image_url");
  if (!tcgdex_id || !card_name || !set_id || !set_name || !local_id) {
    return { message: "Données de carte manquantes, repasse par la recherche." };
  }

  const supabase = await createClient();
  const { error: dbError } = await supabase.from("items").insert({
    ...fields,
    tcgdex_id,
    card_name,
    set_id,
    set_name,
    local_id,
    image_url,
  });

  if (dbError) return { message: `Enregistrement impossible : ${dbError.message}` };

  revalidatePath("/");
  redirect("/");
}

export async function updateItem(
  _prev: ItemFormState,
  formData: FormData
): Promise<ItemFormState> {
  const id = str(formData, "item_id");
  if (!id) return { message: "Exemplaire introuvable." };

  const { fields, error } = parseItemFields(formData);
  if (error || !fields) return { message: error ?? "Formulaire invalide." };

  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from("items")
    .update(fields)
    .eq("id", id);

  if (dbError) return { message: `Mise à jour impossible : ${dbError.message}` };

  revalidatePath("/");
  revalidatePath(`/carte/${id}`);
  redirect(`/carte/${id}`);
}

export async function deleteItem(formData: FormData): Promise<void> {
  const id = str(formData, "item_id");
  if (!id) return;

  const supabase = await createClient();
  await supabase.from("items").delete().eq("id", id);

  revalidatePath("/");
  redirect("/");
}

export type SourceOption = {
  id: string;
  name: string;
  kind: "shop" | "web";
  city: string | null;
  url: string | null;
};

export async function createSource(input: {
  name: string;
  kind: "shop" | "web";
  address?: string;
  city?: string;
  url?: string;
}): Promise<{ source?: SourceOption; error?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Le nom est obligatoire." };
  if (input.kind !== "shop" && input.kind !== "web") {
    return { error: "Type de source invalide." };
  }

  const address = input.address?.trim() || null;
  const city = input.city?.trim() || null;

  // Boutique physique : géocodée à l'enregistrement (Nominatim, 1 requête)
  const coords =
    input.kind === "shop" ? await geocodeAddress(address, city) : null;

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
