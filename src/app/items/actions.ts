"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let tcgdex_id = str(formData, "tcgdex_id");
  let set_id = str(formData, "set_id");
  let image_url = str(formData, "image_url");
  const card_name = str(formData, "card_name");
  const set_name = str(formData, "set_name");
  const local_id = str(formData, "local_id");

  if (!card_name || !set_name || !local_id) {
    return { message: "Nom, set et numéro sont obligatoires." };
  }
  // Ajout manuel (carte absente de TCGdex, ex. promos japonaises) :
  // identifiant interne, pas d'image officielle — les photos perso font foi
  const isCustom = !tcgdex_id;
  const photos = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (isCustom) {
    if (photos.length === 0) {
      return { message: "Ajoute au moins une photo de ta carte." };
    }
    tcgdex_id = `custom:${randomUUID()}`;
    set_id = "custom";
    image_url = "";
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Non connecté." };

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
    return { message: `Enregistrement impossible : ${dbError?.message}` };
  }

  // Photos jointes (déjà compressées côté navigateur)
  if (photos.length > 0) {
    const admin = createAdminClient();
    for (const [index, file] of photos.slice(0, 3).entries()) {
      if (!["image/webp", "image/jpeg", "image/png"].includes(file.type)) continue;
      if (file.size > 3 * 1024 * 1024) continue;
      const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
      const path = `${user.id}/${created.id}/${randomUUID()}.${ext}`;
      const { error: upErr } = await admin.storage
        .from("card-photos")
        .upload(path, file, { contentType: file.type });
      if (!upErr) {
        await supabase.from("item_photos").insert({
          item_id: created.id,
          path,
          label: null,
          position: index,
        });
      }
    }
  }

  revalidatePath("/");
  redirect(isCustom ? `/carte/${created.id}` : "/");
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
