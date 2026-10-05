"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { OWNED_TABLES, knownAccountIds } from "@/lib/admin-data";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; message: string };

/** Origine de l'app (http en local, https derrière Vercel) pour appeler ses propres crons */
async function selfOrigin(): Promise<string> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? (h.get("host")?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${h.get("host")}`;
}

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
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = `${proto}://${h.get("host")}`;
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email });
  if (error || !data?.properties?.hashed_token) {
    return { ok: false, message: error?.message ?? "Lien indisponible" };
  }
  // Lien vers notre page dédiée /reinitialiser : le jeton (token_hash) n'y est
  // vérifié qu'à la soumission du nouveau mot de passe. Cliquer le lien
  // n'ouvre donc aucune session — pas de navigation « connectée » dans l'app
  // avant d'avoir redéfini le mot de passe.
  const link = `${origin}/reinitialiser?token_hash=${encodeURIComponent(
    data.properties.hashed_token
  )}&type=recovery`;
  return { ok: true, link };
}

/** Supprime définitivement un compte et toutes ses données */
export async function adminDeleteUser(userId: string): Promise<Result> {
  const me = await requireAdmin();
  if (!me) return { ok: false, message: "Non autorisé" };
  if (me.id === userId)
    return { ok: false, message: "Impossible de supprimer ton propre compte ici." };

  const db = createAdminClient();
  // Échanges du jeu : ils suivent en cascade des cartes, mais un échange peut viser une carte d'un autre compte
  for (const col of ["from_owner", "to_owner"] as const) {
    const { error } = await db.from("game_trades").delete().eq(col, userId);
    if (error) return { ok: false, message: `game_trades: ${error.message}` };
  }
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
  revalidatePath("/admin", "layout");
  return { ok: true, count: data?.length ?? 0 };
}

/** Appelle un cron de l'app avec son secret (jamais renvoyé au navigateur) */
async function callCron(path: string): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; message: string }> {
  if (!process.env.CRON_SECRET) return { ok: false, message: "CRON_SECRET non configuré." };
  try {
    const res = await fetch(`${await selfOrigin()}${path}`, {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    revalidatePath("/admin", "layout");
    if (!res.ok) return { ok: false, message: String(json?.error ?? `HTTP ${res.status}`) };
    return { ok: true, json };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

/** Déclenche le cron des cotes des cartes */
export async function adminRunCron(): Promise<Result<{ summary: string }>> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const r = await callCron("/api/cron/prices");
  if (!r.ok) return r;
  return { ok: true, summary: `${r.json.updated ?? 0} cotes relevées, ${r.json.skipped ?? 0} ignorées` };
}

/** Rafraîchit le miroir du guide Cardmarket */
export async function adminRunGuide(): Promise<Result<{ summary: string }>> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const r = await callCron("/api/cron/cardmarket-guide");
  if (!r.ok) return r;
  const status = r.json.status;
  return { ok: true, summary: status === "not-modified" ? "Fichier inchangé depuis le dernier passage" : `${Number(r.json.rows ?? 0).toLocaleString("fr-FR")} produits rafraîchis` };
}

/** Supprime les sessions de capture téléphone expirées sans avoir abouti (leurs scans suivent en cascade) */
export async function adminPurgeExpiredCaptures(): Promise<Result<{ count: number }>> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { data, error } = await db
    .from("capture_sessions")
    .delete()
    .neq("status", "done")
    .lt("expires_at", new Date().toISOString())
    .select("id");
  if (error) return { ok: false, message: error.message };
  revalidatePath("/admin", "layout");
  return { ok: true, count: data?.length ?? 0 };
}

/**
 * Efface les lignes dont le propriétaire n'existe plus. Garde-fous : la liste
 * des comptes doit être non vide et contenir l'admin qui lance la purge.
 */
export async function adminPurgeOrphans(): Promise<Result<{ count: number }>> {
  const me = await requireAdmin();
  if (!me) return { ok: false, message: "Non autorisé" };
  let ids: string[];
  try {
    ids = await knownAccountIds();
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
  if (!ids.includes(me.id)) return { ok: false, message: "Liste des comptes incohérente, purge annulée." };
  const db = createAdminClient();
  const list = `(${ids.join(",")})`;
  let count = 0;
  for (const t of OWNED_TABLES) {
    const { data, error } = await db.from(t).delete().not("owner_id", "in", list).select("owner_id");
    if (error) return { ok: false, message: `${t}: ${error.message}` };
    count += data?.length ?? 0;
  }
  revalidatePath("/admin", "layout");
  return { ok: true, count };
}

/** Modifie un lot scellé d'un compte (quantité, prix et date d'achat, valeur saisie) */
export async function adminUpdateSealedLot(
  lotId: string,
  ownerId: string,
  productId: number,
  fields: { quantity: number; purchase_price: number | null; purchase_date: string | null; manual_price: number | null },
): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  if (!Number.isInteger(fields.quantity) || fields.quantity < 1) return { ok: false, message: "Quantité invalide" };
  for (const v of [fields.purchase_price, fields.manual_price]) if (v != null && (!Number.isFinite(v) || v < 0)) return { ok: false, message: "Montant invalide" };
  const db = createAdminClient();
  const { error } = await db.from("sealed_items").update(fields).eq("id", lotId).eq("owner_id", ownerId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}/scelle/${productId}`);
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  return { ok: true };
}

/** Supprime un lot scellé d'un compte */
export async function adminDeleteSealedLot(lotId: string, ownerId: string, productId: number): Promise<Result> {
  if (!(await requireAdmin())) return { ok: false, message: "Non autorisé" };
  const db = createAdminClient();
  const { error } = await db.from("sealed_items").delete().eq("id", lotId).eq("owner_id", ownerId);
  if (error) return { ok: false, message: error.message };
  revalidatePath(`/admin/utilisateurs/${ownerId}/scelle/${productId}`);
  revalidatePath(`/admin/utilisateurs/${ownerId}`);
  return { ok: true };
}
