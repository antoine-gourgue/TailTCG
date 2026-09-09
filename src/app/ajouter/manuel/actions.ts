"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CustomCardState = { message: string } | null;

const ALLOWED = ["image/webp", "image/jpeg", "image/png"];
const MAX_BYTES = 3 * 1024 * 1024;
const extOf = (t: string) => (t === "image/webp" ? "webp" : t === "image/png" ? "png" : "jpg");

/** Télécharge une image depuis un lien : type image accepté, 3 Mo max, 8 s */
async function fetchImage(url: string): Promise<{ buffer: Buffer; type: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const normalized = type === "image/jpg" ? "image/jpeg" : type;
    if (!ALLOWED.includes(normalized)) return null;
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;
    return { buffer, type: normalized };
  } catch {
    return null;
  }
}

/**
 * Ajoute plusieurs cartes hors catalogue d'un coup : pour chacune, crée la
 * fiche (custom_cards) + un exemplaire dans la collection marqué « à
 * compléter » (état, prix… à renseigner ensuite via la fiche). Redirige vers
 * la collection.
 */
export async function createCustomCards(
  _prev: CustomCardState,
  formData: FormData
): Promise<CustomCardState> {
  const count = Number(formData.get("count") ?? 0);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    return { message: "Nombre de cartes invalide." };
  }
  const { LANGUAGES } = await import("@/lib/domain");
  const langOf = (raw: unknown) => {
    const v = String(raw ?? "");
    return (LANGUAGES as readonly string[]).includes(v) ? v : "JP";
  };

  // Chaque carte apporte sa photo : un fichier (compressé côté client) ou un
  // lien, que l'on télécharge ici (pas de CORS, taille et type contrôlés)
  type Row = {
    name: string;
    set_name: string;
    local_id: string;
    language: string;
    photo: File | null;
    url: string;
  };
  const rows: Row[] = [];
  for (let i = 0; i < count; i++) {
    const name = String(formData.get(`name_${i}`) ?? "").trim();
    const set_name = String(formData.get(`set_name_${i}`) ?? "").trim();
    const local_id = String(formData.get(`local_id_${i}`) ?? "").trim();
    const language = langOf(formData.get(`language_${i}`) ?? formData.get("language"));
    const photoRaw = formData.get(`photo_${i}`);
    const photo = photoRaw instanceof File && photoRaw.size > 0 ? photoRaw : null;
    const url = String(formData.get(`image_url_${i}`) ?? "").trim();
    if (!name || !set_name || !local_id) {
      return { message: `Carte ${i + 1} : nom, set et numéro sont obligatoires.` };
    }
    if (!photo && !url) {
      return { message: `Carte ${i + 1} : ajoute une photo (fichier ou lien).` };
    }
    if (photo) {
      if (!ALLOWED.includes(photo.type)) {
        return { message: `Carte ${i + 1} : format non accepté (${photo.type}).` };
      }
      if (photo.size > MAX_BYTES) {
        return { message: `Carte ${i + 1} : photo trop lourde (max 3 Mo).` };
      }
    } else if (!/^https?:\/\//i.test(url)) {
      return { message: `Carte ${i + 1} : le lien doit commencer par http(s)://.` };
    }
    rows.push({ name, set_name, local_id, language, photo, url });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { message: "Non connecté." };
  const admin = createAdminClient();

  const uploaded: string[] = [];
  const rollback = async () => {
    if (uploaded.length > 0) await admin.storage.from("card-photos").remove(uploaded);
  };
  for (const [i, row] of rows.entries()) {
    let body: File | Buffer;
    let type: string;
    if (row.photo) {
      body = row.photo;
      type = row.photo.type;
    } else {
      const got = await fetchImage(row.url);
      if (!got) {
        await rollback();
        return { message: `Carte ${i + 1} : impossible de récupérer l'image du lien (image, max 3 Mo).` };
      }
      body = got.buffer;
      type = got.type;
    }
    const image_path = `${user.id}/custom-cards/${randomUUID()}.${extOf(type)}`;
    const { error: upError } = await admin.storage
      .from("card-photos")
      .upload(image_path, body, { contentType: type });
    if (upError) {
      await rollback();
      return { message: "Envoi d'une image impossible, réessaie." };
    }
    uploaded.push(image_path);

    const { data: card, error: cardErr } = await supabase
      .from("custom_cards")
      .insert({ name: row.name, set_name: row.set_name, local_id: row.local_id, image_path })
      .select("id")
      .single();
    if (cardErr || !card) {
      await rollback();
      return { message: "Création impossible, réessaie." };
    }

    const { error: itemErr } = await supabase.from("items").insert({
      tcgdex_id: `custom:${card.id}`,
      card_name: row.name,
      set_id: "custom",
      set_name: row.set_name,
      local_id: row.local_id,
      image_url: `storage:${image_path}`,
      condition: "NM",
      language: row.language,
      quantity: 1,
      needs_review: true,
    });
    if (itemErr) {
      await rollback();
      return { message: "Ajout à la collection impossible, réessaie." };
    }
  }

  revalidatePath("/");
  revalidatePath("/recherche");
  redirect(`/?added=${rows.length}`);
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
