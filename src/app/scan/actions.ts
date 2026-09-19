"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";
import { bulkAddToCollection } from "@/app/items/actions";
import { addCardUrl, isScanLang, ITEM_LANGUAGE } from "@/lib/scan/url";
import { cardmarketUrl, enrichCardDetails, type CatalogLang, type TcgdexCardBrief } from "@/lib/tcgdex";
import { fetchGuidePrices } from "@/lib/cardmarket";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";

export type ScanRow = Database["public"]["Tables"]["capture_scans"]["Row"];
export type ScanSessionStatus = "pending" | "done" | "cancelled";
/** Cote Cardmarket, rareté et lien d'une carte scannée */
export type ScanDetail = { price: number | null; rarity: string | null; cmUrl: string };
/** Détails par carte, clé `${lang}/${tcgdex_id}` */
export type ScanDetails = Record<string, ScanDetail>;
const scanKey = (r: Pick<ScanRow, "lang" | "tcgdex_id">) => `${r.lang}/${r.tcgdex_id}`;

/** Détails déjà calculés (une heure) : le sondage de la page n'interroge TCGdex que pour les nouvelles cartes */
const detailCache = new Map<string, { at: number; value: ScanDetail }>();
const DETAIL_TTL_MS = 60 * 60 * 1000;

/**
 * Cote (guide Cardmarket local par idProduct, bloc TCGdex en repli), rareté
 * et lien Cardmarket des cartes scannées. Les cartes que TCGdex ne connaît
 * pas (sets japonais Limitless) n'ont ni cote ni rareté.
 */
export async function scanDetails(rows: Pick<ScanRow, "tcgdex_id" | "lang" | "name" | "local_id">[]): Promise<ScanDetails> {
  const out: ScanDetails = {};
  const now = Date.now();
  const byLang = new Map<CatalogLang, Map<string, TcgdexCardBrief>>();
  for (const r of rows) {
    const key = scanKey(r);
    if (out[key]) continue;
    const hit = detailCache.get(key);
    if (hit && now - hit.at < DETAIL_TTL_MS) {
      out[key] = hit.value;
      continue;
    }
    if (!isScanLang(r.lang)) continue;
    const group = byLang.get(r.lang) ?? byLang.set(r.lang, new Map()).get(r.lang)!;
    if (!group.has(r.tcgdex_id)) group.set(r.tcgdex_id, { id: r.tcgdex_id, localId: r.local_id, name: r.name });
  }
  for (const [lang, group] of byLang) {
    const cards = [...group.values()];
    await enrichCardDetails(cards, lang);
    const guide = await fetchGuidePrices(cards.map((c) => overrideCardmarketId(c.id, c.cmId)));
    for (const c of cards) {
      const cmId = overrideCardmarketId(c.id, c.cmId);
      const value: ScanDetail = {
        price: (cmId != null ? guide.get(cmId) : undefined) ?? c.price ?? null,
        rarity: c.rarity ?? null,
        cmUrl: cardmarketUrl({ idProduct: cmId, name: c.name, localId: c.localId }),
      };
      const key = `${lang}/${c.id}`;
      detailCache.set(key, { at: now, value });
      out[key] = value;
    }
  }
  return out;
}

async function loadScans(sessionId: string): Promise<ScanRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("capture_scans")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at");
  return data ?? [];
}

/** Desktop : état de la session, cartes reçues et leurs détails (sondé toutes les deux secondes) */
export async function pollScanSession(
  sessionId: string
): Promise<{ status: ScanSessionStatus; scans: ScanRow[]; details: ScanDetails } | { error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("capture_sessions")
    .select("status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return { error: "Session introuvable" };
  const scans = await loadScans(sessionId);
  return { status: session.status as ScanSessionStatus, scans, details: await scanDetails(scans) };
}

/**
 * Ajoute des cartes scannées en attente : exemplaires minimaux (quasi
 * parfaite, quantité 1, langue du visuel) marqués à compléter, comme l'ajout
 * rapide depuis un set ; chaque scan est relié à son exemplaire.
 */
async function addScanRows(pending: ScanRow[]): Promise<string | null> {
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
    if (res.error) return res.error;
    // Même carte deux fois = deux exemplaires, dans l'ordre
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
  return null;
}

/** Ajoute une seule carte scannée (ajout rapide, sans passer par la fiche) */
export async function addOneScan(scanId: string): Promise<{ error: string | null; scan: ScanRow | null }> {
  const supabase = await createClient();
  const { data: row } = await supabase.from("capture_scans").select("*").eq("id", scanId).maybeSingle();
  if (!row) return { error: "Carte introuvable", scan: null };
  if (row.status !== "pending") return { error: null, scan: row };
  const error = await addScanRows([row]);
  const { data: after } = await supabase.from("capture_scans").select("*").eq("id", scanId).maybeSingle();
  revalidatePath(`/scan/${row.session_id}`);
  return { error, scan: after ?? row };
}

/** Remet en attente une carte passée */
export async function restoreScan(scanId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("capture_scans")
    .update({ status: "pending" })
    .eq("id", scanId)
    .eq("status", "skipped");
  return { error: error ? "Impossible pour le moment." : null };
}

/** Ajoute d'un coup toutes les cartes en attente de la session */
export async function addAllScans(
  sessionId: string
): Promise<{ error: string | null; scans: ScanRow[] }> {
  const pending = (await loadScans(sessionId)).filter((s) => s.status === "pending");
  if (pending.length === 0) return { error: null, scans: await loadScans(sessionId) };
  const error = await addScanRows(pending);
  revalidatePath(`/scan/${sessionId}`);
  return { error, scans: await loadScans(sessionId) };
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
