"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

// Tables portant un owner_id, purgées à la suppression d'un compte
const OWNED_TABLES = [
  "item_value_history",
  "item_photos",
  "item_gradings",
  "binder_items",
  "binders",
  "wishlist",
  "custom_cards",
  "sources",
  "items",
  "user_settings",
] as const;

/** Coupe le partage public d'un compte (révoque son jeton) */
export async function adminDisableShare(userId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db
    .from("user_settings")
    .update({ share_token: null })
    .eq("owner_id", userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${userId}`);
  return { ok: true };
}

/** Suspend ou réactive un compte (bannissement GoTrue) */
export async function adminSetBanned(
  userId: string,
  banned: boolean
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876000h" : "none",
  });
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${userId}`);
  return { ok: true };
}

/** Génère un lien de réinitialisation de mot de passe à transmettre */
export async function adminRecoveryLink(email: string): Promise<Result<{ link: string }>> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const h = await headers();
  const origin = `https://${h.get("host")}`;
  const { data, error } = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error || !data?.properties?.action_link) {
    return { ok: false, message: error?.message ?? "Lien indisponible" };
  }
  return { ok: true, link: data.properties.action_link };
}

/** Supprime définitivement un compte et toutes ses données */
export async function adminDeleteUser(userId: string): Promise<Result> {
  const me = await requireAdmin();
  if (!me) return { ok: false, message: "Non autorisé" };
  if (me.id === userId)
    return { ok: false, message: "Impossible de supprimer ton propre compte ici." };

  const db = createAdminClient();
  for (const table of OWNED_TABLES) {
    const { error } = await db.from(table).delete().eq("owner_id", userId);
    if (error) return { ok: false, message: `${table}: ${error.message}` };
  }
  // Fichiers du bucket (best-effort : dossier <userId>/…)
  try {
    const { data: top } = await db.storage.from("card-photos").list(userId);
    for (const entry of top ?? []) {
      const { data: sub } = await db.storage
        .from("card-photos")
        .list(`${userId}/${entry.name}`);
      const paths = (sub ?? []).map((f) => `${userId}/${entry.name}/${f.name}`);
      if (paths.length) await db.storage.from("card-photos").remove(paths);
    }
  } catch {
    // sans blocage : les fichiers privés orphelins restent inaccessibles
  }
  const { error } = await db.auth.admin.deleteUser(userId);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin/utilisateurs");
  return { ok: true };
}

/** Carte : envoie à la corbeille / restaure / supprime définitivement */
export async function adminSoftDeleteItem(itemId: string, ownerId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db
    .from("items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  return { ok: true };
}

export async function adminRestoreItem(itemId: string, ownerId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db.from("items").update({ deleted_at: null }).eq("id", itemId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  return { ok: true };
}

export async function adminHardDeleteItem(itemId: string, ownerId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db.from("items").delete().eq("id", itemId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  return { ok: true };
}

/** Édite les champs d'un exemplaire (admin) */
export async function adminUpdateItem(
  itemId: string,
  ownerId: string,
  fields: {
    condition: string;
    quantity: number;
    purchase_price: number | null;
    manual_price: number | null;
    language: string;
    card_type: string | null;
    graded: boolean;
    grade: string | null;
    source_id: string | null;
    notes: string | null;
  }
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db.from("items").update(fields).eq("id", itemId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  revalidatePath(`/admin/utilisateurs/${ownerId}/carte/${itemId}`);
  return { ok: true };
}

/** Renomme un classeur (admin) */
export async function adminRenameBinder(
  binderId: string,
  ownerId: string,
  name: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Nom vide" };
  const db = createAdminClient();
  const { error } = await db.from("binders").update({ name: trimmed }).eq("id", binderId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}/classeur/${binderId}`);
  return { ok: true };
}

/** Édite une source (admin) */
export async function adminUpdateSource(
  sourceId: string,
  ownerId: string,
  fields: { name: string; kind: string; city: string | null; url: string | null }
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  if (!fields.name.trim()) return { ok: false, message: "Nom vide" };
  const db = createAdminClient();
  const { error } = await db.from("sources").update(fields).eq("id", sourceId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}/boutique/${sourceId}`);
  return { ok: true };
}

/** Retire une carte d'un classeur (admin) */
export async function adminRemoveFromBinder(
  binderId: string,
  itemId: string,
  ownerId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db
    .from("binder_items")
    .delete()
    .eq("binder_id", binderId)
    .eq("item_id", itemId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}/classeur/${binderId}`);
  return { ok: true };
}

/** Ajoute des cartes à un classeur (admin) */
export async function adminAddToBinder(
  binderId: string,
  itemIds: string[],
  ownerId: string
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  if (itemIds.length === 0) return { ok: true };
  const db = createAdminClient();
  const { error } = await db.from("binder_items").upsert(
    itemIds.map((item_id) => ({ binder_id: binderId, item_id, owner_id: ownerId })),
    { onConflict: "binder_id,item_id", ignoreDuplicates: true }
  );
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}/classeur/${binderId}`);
  return { ok: true };
}

/** Supprime un classeur (les cartes restent dans la collection) */
export async function adminDeleteBinder(binderId: string, ownerId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db.from("binders").delete().eq("id", binderId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  return { ok: true };
}

/** Supprime une source (les cartes liées gardent source_id à null) */
export async function adminDeleteSource(sourceId: string, ownerId: string): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db.from("sources").delete().eq("id", sourceId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  return { ok: true };
}

/** Vide la corbeille de tous les comptes (suppression définitive) */
export async function adminPurgeTrash(): Promise<Result<{ count: number }>> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { data, error } = await db
    .from("items")
    .delete()
    .not("deleted_at", "is", null)
    .select("id");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin");
  return { ok: true, count: data?.length ?? 0 };
}

/** Déclenche le cron des cotes manuellement */
export async function adminRunCron(): Promise<Result<{ summary: string }>> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  if (!process.env.CRON_SECRET)
    return { ok: false, message: "CRON_SECRET non configuré." };
  const h = await headers();
  const origin = `https://${h.get("host")}`;
  try {
    const res = await fetch(`${origin}/api/cron/prices`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: "no-store",
    });
    const json = await res.json().catch(() => ({}));
    revalidatePath("/admin/systeme");
    if (!res.ok) return { ok: false, message: json?.error ?? `HTTP ${res.status}` };
    return {
      ok: true,
      summary: `${json.updated ?? 0} mises à jour, ${json.skipped ?? 0} ignorées`,
    };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}
