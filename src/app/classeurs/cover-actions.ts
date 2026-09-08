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

/**
 * Éditeur unifié : enregistre tout le design du classeur en une fois —
 * style, couleur, cartes de couverture, format des pages, options de design
 * et composition de couverture sur mesure.
 */
export async function saveBinderEditor(
  binderId: string,
  input: {
    style: string;
    color: string | null;
    coverIds: string[];
    pageGrid: string;
    design: unknown;
    cover: unknown;
  }
) {
  if (!UUID_RE.test(binderId)) return { error: "Classeur invalide" };
  const [{ BINDER_COLORS }, { binderStyle, binderStyleCovers }, { pageGrid }, { binderDesign }] =
    await Promise.all([
      import("@/lib/binder-colors"),
      import("@/lib/binder-styles"),
      import("@/lib/binder-pages"),
      import("@/lib/binder-design"),
    ]);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const style = binderStyle(input.style);
  const color =
    input.color && BINDER_COLORS.some((c) => c.code === input.color) ? input.color : null;
  const design = binderDesign(input.design);
  const grid = pageGrid(input.pageGrid).code;
  const layout = coverLayout(input.cover);

  // Couverture sur mesure : seuls mes fichiers et mes exemplaires sont admis
  const foreign = coverStoragePaths(layout).some(
    (p) => !p.startsWith(`${user.id}/covers/${binderId}/`)
  );
  if (foreign) return { error: "Image non autorisée" };
  const coverCards = coverItemIds(layout);
  if (coverCards.length > 0) {
    const { data: mine } = await supabase.from("items").select("id").in("id", coverCards);
    if ((mine ?? []).length !== coverCards.length) return { error: "Carte non autorisée" };
  }

  // Cartes de couverture (styles modèles) : bornées aux cartes du classeur
  let cover_item_ids: string[] | null = null;
  const maxCovers = binderStyleCovers(style);
  if (maxCovers > 0 && input.coverIds.length > 0) {
    const { data: links } = await supabase
      .from("binder_items")
      .select("item_id")
      .eq("binder_id", binderId);
    const members = new Set((links ?? []).map((l) => l.item_id));
    const chosen = input.coverIds.filter((id) => members.has(id)).slice(0, maxCovers);
    cover_item_ids = chosen.length > 0 ? chosen : null;
  }

  const { error } = await supabase
    .from("binders")
    .update({
      style,
      color,
      cover_item_ids,
      page_grid: grid,
      design,
      cover: layout,
    })
    .eq("id", binderId);

  revalidatePath("/classeurs");
  revalidatePath(`/classeurs/${binderId}`);
  revalidatePath(`/classeurs/${binderId}/editeur`);
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
