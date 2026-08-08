"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CustomCardState = { message: string } | null;

// Crée une CARTE au catalogue perso (pas un exemplaire) : identité + photo.
// Elle s'ajoute ensuite à la collection par le flux normal, comme une carte
// TCGdex, autant de fois que d'exemplaires possédés.
export async function createCustomCard(
  _prev: CustomCardState,
  formData: FormData
): Promise<CustomCardState> {
  const name = String(formData.get("name") ?? "").trim();
  const set_name = String(formData.get("set_name") ?? "").trim();
  const local_id = String(formData.get("local_id") ?? "").trim();
  const photo = formData.get("photo");

  if (!name || !set_name || !local_id) {
    return { message: "Nom, set et numéro sont obligatoires." };
  }
  if (!(photo instanceof File) || photo.size === 0) {
    return { message: "La photo de la carte est obligatoire." };
  }
  if (!["image/webp", "image/jpeg", "image/png"].includes(photo.type)) {
    return { message: `Format non accepté : ${photo.type}` };
  }
  if (photo.size > 3 * 1024 * 1024) {
    return { message: "Photo trop lourde (max 3 Mo après compression)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Non connecté." };

  const ext =
    photo.type === "image/webp" ? "webp" : photo.type === "image/png" ? "png" : "jpg";
  const image_path = `${user.id}/custom-cards/${randomUUID()}.${ext}`;

  const admin = createAdminClient();
  const { error: upError } = await admin.storage
    .from("card-photos")
    .upload(image_path, photo, { contentType: photo.type });
  if (upError) {
    return { message: `Upload impossible : ${upError.message}` };
  }

  const { data: created, error: dbError } = await supabase
    .from("custom_cards")
    .insert({ name, set_name, local_id, image_path })
    .select("id")
    .single();

  if (dbError || !created) {
    await admin.storage.from("card-photos").remove([image_path]);
    return { message: `Création impossible : ${dbError?.message}` };
  }

  redirect(`/ajouter?card=custom:${created.id}`);
}

// Supprime une carte hors catalogue ET tout ce qui s'y rattache :
// exemplaires en collection, photos d'exemplaires, photo de la carte
export async function deleteCustomCard(formData: FormData): Promise<void> {
  const cardId = String(formData.get("card_id") ?? "");
  if (!cardId) return;

  const supabase = await createClient();
  const { data: card } = await supabase
    .from("custom_cards")
    .select("id, image_path")
    .eq("id", cardId)
    .single();
  if (!card) return;

  const admin = createAdminClient();
  const tcgdexId = `custom:${card.id}`;

  // Photos des exemplaires liés (fichiers du bucket)
  const { data: items } = await supabase
    .from("items")
    .select("id")
    .eq("tcgdex_id", tcgdexId);
  if (items && items.length > 0) {
    const { data: photos } = await supabase
      .from("item_photos")
      .select("path")
      .in(
        "item_id",
        items.map((i) => i.id)
      );
    if (photos && photos.length > 0) {
      await admin.storage
        .from("card-photos")
        .remove(photos.map((p) => p.path));
    }
    await supabase.from("items").delete().eq("tcgdex_id", tcgdexId);
  }

  await admin.storage.from("card-photos").remove([card.image_path]);
  await supabase.from("custom_cards").delete().eq("id", card.id);

  revalidatePath("/recherche");
  revalidatePath("/");
}
