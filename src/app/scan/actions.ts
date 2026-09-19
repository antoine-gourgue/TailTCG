"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { bulkAddToCollection } from "@/app/items/actions";
import { addCardUrl, isScanLang, ITEM_LANGUAGE } from "@/lib/scan/url";

export type ScanRow = Database["public"]["Tables"]["capture_scans"]["Row"];
export type ScanSessionStatus = "pending" | "done" | "cancelled";

async function loadScans(sessionId: string): Promise<ScanRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("capture_scans")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at");
  return data ?? [];
}

/** Desktop : état de la session et cartes reçues (sondé toutes les deux secondes) */
export async function pollScanSession(
  sessionId: string
): Promise<{ status: ScanSessionStatus; scans: ScanRow[] } | { error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("capture_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { error: "Session introuvable" };
  return { status: session.status as ScanSessionStatus, scans: await loadScans(sessionId) };
}

/**
 * Ajoute d'un coup toutes les cartes en attente de la session : exemplaires
 * minimaux (quasi parfaite, quantité 1, langue du visuel) marqués à
 * compléter, comme l'ajout rapide depuis un set.
 */
export async function addAllScans(
  sessionId: string
): Promise<{ error: string | null; scans: ScanRow[] }> {
  const pending = (await loadScans(sessionId)).filter((s) => s.status === "pending");
  if (pending.length === 0) return { error: null, scans: await loadScans(sessionId) };

  // Un lot par langue d'exemplaire
  const groups = new Map<string, ScanRow[]>();
  for (const s of pending) {
    const language = isScanLang(s.lang) ? ITEM_LANGUAGE[s.lang] : "FR";
    groups.set(language, [...(groups.get(language) ?? []), s]);
  }
  const supabase = await createClient();
  for (const [language, rows] of groups) {
    const res = await bulkAddToCollection(
      rows.map((s) => ({
        tcgdex_id: s.tcgdex_id,
        card_name: s.name,
        set_id: s.set_id,
        set_name: s.set_name,
        local_id: s.local_id,
        image_url: s.image,
      })),
      language
    );
    if (res.error) return { error: res.error, scans: await loadScans(sessionId) };
    // Relie chaque scan à son exemplaire (même carte deux fois = deux exemplaires, dans l'ordre)
    const free = [...res.items];
    for (const s of rows) {
      const i = free.findIndex((it) => it.tcgdex_id === s.tcgdex_id);
      const item = i >= 0 ? free.splice(i, 1)[0] : null;
      await supabase
        .from("capture_scans")
        .update({ status: "added", item_id: item?.id ?? null })
        .eq("id", s.id);
    }
  }
  revalidatePath(`/scan/${sessionId}`);
  return { error: null, scans: await loadScans(sessionId) };
}

/** Passe une carte scannée (on ne l'ajoute pas) */
export async function skipScan(scanId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("capture_scans")
    .update({ status: "skipped" })
    .eq("id", scanId)
    .eq("status", "pending");
  return { error: error ? "Impossible pour le moment." : null };
}

/** Depuis la fiche d'ajout : passe cette carte et ouvre la suivante (ou le récapitulatif) */
export async function skipScanAndNext(scanId: string): Promise<void> {
  const supabase = await createClient();
  const { data: scan } = await supabase
    .from("capture_scans")
    .update({ status: "skipped" })
    .eq("id", scanId)
    .select("session_id")
    .maybeSingle();
  if (!scan) redirect("/recherche");
  const { data: next } = await supabase
    .from("capture_scans")
    .select("id, tcgdex_id, lang")
    .eq("session_id", scan.session_id)
    .eq("status", "pending")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  revalidatePath(`/scan/${scan.session_id}`);
  redirect(next ? addCardUrl({ id: next.tcgdex_id, lang: next.lang, scan: next.id }) : `/scan/${scan.session_id}`);
}

/** Retire une carte scannée de la liste */
export async function removeScan(scanId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("capture_scans").delete().eq("id", scanId);
  return { error: error ? "Impossible pour le moment." : null };
}

/** Desktop : ferme la session (le téléphone ne peut plus envoyer) */
export async function finishScanSession(sessionId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("capture_sessions")
    .update({ status: "done" })
    .eq("id", sessionId)
    .eq("status", "pending");
  return { error: error ? "Impossible pour le moment." : null };
}
