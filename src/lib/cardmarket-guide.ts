import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

/**
 * Récupère le fichier public quotidien de Cardmarket et le range dans la table
 * `cardmarket_price_guide` (miroir indexé par idProduct). Même approche que le
 * paquet `cardmarket-api` de GoupixDex : bucket S3 public (ni compte ni clé),
 * GET conditionnel (ETag / If-Modified-Since) pour ne re-télécharger que quand
 * le fichier change. À n'appeler que hors chemin de requête (cron).
 */
const GAME_ID = 6; // Pokémon
const GUIDE_URL = `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_${GAME_ID}.json`;
const USER_AGENT = "tailtcg/1.0 (+https://tailtcg.vercel.app)";
const CHUNK = 1000;

type Admin = SupabaseClient<Database>;
type Raw = Record<string, unknown>;

export type GuideRefreshReport = {
  status: "updated" | "not-modified" | "error";
  rows?: number;
  createdAt?: string | null;
  error?: string;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function dbRow(raw: Raw) {
  return {
    id_product: raw.idProduct as number,
    id_category: num(raw.idCategory),
    avg: num(raw.avg),
    low: num(raw.low),
    trend: num(raw.trend),
    avg1: num(raw.avg1),
    avg7: num(raw.avg7),
    avg30: num(raw.avg30),
    avg_holo: num(raw["avg-holo"]),
    low_holo: num(raw["low-holo"]),
    trend_holo: num(raw["trend-holo"]),
    avg1_holo: num(raw["avg1-holo"]),
    avg7_holo: num(raw["avg7-holo"]),
    avg30_holo: num(raw["avg30-holo"]),
  };
}

export async function refreshPriceGuide(admin: Admin): Promise<GuideRefreshReport> {
  const { data: meta } = await admin
    .from("cardmarket_price_guide_meta")
    .select("etag, last_modified")
    .eq("id", 1)
    .maybeSingle();

  const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "application/json" };
  if (meta?.etag) headers["If-None-Match"] = meta.etag;
  if (meta?.last_modified) headers["If-Modified-Since"] = meta.last_modified;

  let res: Response;
  try {
    res = await fetch(GUIDE_URL, { headers, cache: "no-store" });
  } catch (e) {
    return { status: "error", error: `téléchargement impossible: ${String(e)}` };
  }
  if (res.status === 304) return { status: "not-modified" };
  if (!res.ok) return { status: "error", error: `HTTP ${res.status}` };

  let payload: { priceGuides?: unknown; createdAt?: string };
  try {
    payload = await res.json();
  } catch {
    return { status: "error", error: "JSON invalide" };
  }
  const guides = payload.priceGuides;
  if (!Array.isArray(guides)) return { status: "error", error: "champ priceGuides manquant" };

  const rows = guides
    .filter((r): r is Raw => !!r && typeof r === "object" && typeof (r as Raw).idProduct === "number")
    .map(dbRow);

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin
      .from("cardmarket_price_guide")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "id_product" });
    if (error) return { status: "error", error: `upsert: ${error.message}` };
  }

  await admin.from("cardmarket_price_guide_meta").upsert({
    id: 1,
    etag: res.headers.get("ETag"),
    last_modified: res.headers.get("Last-Modified"),
    created_at: payload.createdAt ?? null,
    row_count: rows.length,
    refreshed_at: new Date().toISOString(),
  });

  return { status: "updated", rows: rows.length, createdAt: payload.createdAt ?? null };
}
