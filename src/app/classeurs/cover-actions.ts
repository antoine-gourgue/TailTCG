"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { coverItemIds, coverLayout, coverStoragePaths } from "@/lib/binder-cover";

// Couverture sur mesure : images dans le bucket privé sous
// `<owner>/covers/<classeur>/`, mise en page validée avant enregistrement.

const BUCKET = "card-photos";
const MAX_SIZE = 3 * 1024 * 1024; // aligné sur la limite du bucket
const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CoverUploadResult =
  | { ok: true; path: string; url: string }
  | { ok: false; message: string };

/** Envoie une image de couverture, renvoie son chemin et une URL signée 1 h */
export async function uploadCoverImage(formData: FormData): Promise<CoverUploadResult> {
  const binderId = String(formData.get("binder_id") ?? "");
  const file = formData.get("image");
  if (!UUID_RE.test(binderId) || !(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Aucune image à envoyer." };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, message: `Format non accepté : ${file.type}` };
  }
  if (file.size > MAX_SIZE) {
    return { ok: false, message: "Image trop lourde après compression (max 3 Mo)." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non connecté." };
  // La RLS garantit que le classeur m'appartient
  const { data: binder } = await supabase
    .from("binders")
    .select("id")
    .eq("id", binderId)
    .maybeSingle();
  if (!binder) return { ok: false, message: "Classeur introuvable." };

  const ext = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg";
  const path = `${user.id}/covers/${binderId}/${randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type });
  if (error) {
    console.error("uploadCoverImage:", error.message);
    return { ok: false, message: "Envoi impossible, réessaie." };
  }
  const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(path, 3600);
  return { ok: true, path, url: signed?.signedUrl ?? "" };
}

/** Enregistre la mise en page et passe le classeur en couverture sur mesure */
export async function saveBinderCover(binderId: string, raw: unknown) {
  if (!UUID_RE.test(binderId)) return { error: "Classeur invalide" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const layout = coverLayout(raw);
  // Seuls mes fichiers et mes exemplaires peuvent figurer sur la couverture
  const foreign = coverStoragePaths(layout).some(
    (p) => !p.startsWith(`${user.id}/covers/${binderId}/`)
  );
  if (foreign) return { error: "Image non autorisée" };
  const itemIds = coverItemIds(layout);
  if (itemIds.length > 0) {
    const { data: mine } = await supabase.from("items").select("id").in("id", itemIds);
    if ((mine ?? []).length !== itemIds.length) return { error: "Carte non autorisée" };
  }

  const { error } = await supabase
    .from("binders")
    .update({ cover: layout, style: "custom" })
    .eq("id", binderId);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  revalidatePath(`/classeurs/${binderId}/couverture`);
  return { error: error?.message ?? null };
}

/** Supprime une image de couverture devenue inutile */
export async function deleteCoverImage(binderId: string, path: string) {
  if (!UUID_RE.test(binderId)) return { error: "Classeur invalide" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  if (!path.startsWith(`${user.id}/covers/${binderId}/`)) return { error: "Image non autorisée" };
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([path]);
  return { error: error?.message ?? null };
}
