"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "card-photos";
const MAX_SIZE = 3 * 1024 * 1024; // aligné sur la limite du bucket
const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];

export type PhotoActionState = { ok: boolean; message: string } | null;

export async function uploadItemPhotos(
  _prev: PhotoActionState,
  formData: FormData
): Promise<PhotoActionState> {
  const itemId = String(formData.get("item_id") ?? "");
  const files = formData
    .getAll("photos")
    .filter((f): f is File => f instanceof File && f.size > 0);

  if (!itemId || files.length === 0) {
    return { ok: false, message: "Aucune photo à envoyer." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non connecté." };

  // La RLS garantit que l'exemplaire m'appartient
  const { data: item } = await supabase
    .from("items")
    .select("id")
    .eq("id", itemId)
    .single();
  if (!item) return { ok: false, message: "Exemplaire introuvable." };

  const { count } = await supabase
    .from("item_photos")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);

  const admin = createAdminClient();
  let uploaded = 0;

  for (const [index, file] of files.entries()) {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return { ok: false, message: `Format non accepté : ${file.type}` };
    }
    if (file.size > MAX_SIZE) {
      return {
        ok: false,
        message: "Photo trop lourde après compression (max 3 Mo).",
      };
    }

    const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
    const path = `${user.id}/${itemId}/${randomUUID()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      return { ok: false, message: `Upload impossible : ${uploadError.message}` };
    }

    const { error: dbError } = await supabase.from("item_photos").insert({
      item_id: itemId,
      path,
      label: null,
      position: (count ?? 0) + index,
    });
    if (dbError) {
      await admin.storage.from(BUCKET).remove([path]);
      return { ok: false, message: `Enregistrement impossible : ${dbError.message}` };
    }
    uploaded++;
  }

  revalidatePath(`/carte/${itemId}`);
  return {
    ok: true,
    message: `${uploaded} photo${uploaded > 1 ? "s" : ""} ajoutée${uploaded > 1 ? "s" : ""}.`,
  };
}

export async function deleteItemPhoto(formData: FormData): Promise<void> {
  const photoId = String(formData.get("photo_id") ?? "");
  if (!photoId) return;

  const supabase = await createClient();
  // Lecture via RLS : si la photo n'est pas à moi, data est null
  const { data: photo } = await supabase
    .from("item_photos")
    .select("id, path, item_id")
    .eq("id", photoId)
    .single();
  if (!photo) return;

  const admin = createAdminClient();
  await admin.storage.from(BUCKET).remove([photo.path]);
  await supabase.from("item_photos").delete().eq("id", photoId);

  revalidatePath(`/carte/${photo.item_id}`);
}
