import "server-only";
import { unstable_cache } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchGuidePrices } from "@/lib/cardmarket";

/**
 * Cote € des produits scellés : guide Cardmarket par idProduct d'abord (le
 * guide local couvre aussi les produits non-unitaires), prix marché TCGplayer
 * en repli, converti approximativement. Historique : relevés quotidiens
 * (sealed_price_snapshots) écrits chaque nuit par scripts/sealed-catalog.mjs.
 */
export const USD_TO_EUR = 0.92;

export type SealedPriceInput = { id: number; cardmarket_id: number | null; price_usd: number | null };
export type SealedCote = { value: number; source: "cardmarket" | "tcgplayer" };

/** Cote par produit (clé : id produit). Une seule requête au guide pour tous les idProduct. */
export async function sealedCotes(products: SealedPriceInput[], client?: SupabaseClient<Database>): Promise<Map<number, SealedCote>> {
  const guide = await fetchGuidePrices(products.map((p) => p.cardmarket_id), client);
  const out = new Map<number, SealedCote>();
  for (const p of products) {
    const cm = p.cardmarket_id != null ? guide.get(p.cardmarket_id) : undefined;
    if (cm != null) out.set(p.id, { value: cm, source: "cardmarket" });
    else if (p.price_usd != null && p.price_usd > 0) {
      out.set(p.id, { value: Math.round(p.price_usd * USD_TO_EUR * 100) / 100, source: "tcgplayer" });
    }
  }
  return out;
}

/** Colonnes du catalogue utilisées par la navigation et les fiches */
export const SEALED_SELECT =
  "id, name, kind, set_name, set_name_fr, set_id, set_logo, serie, serie_id, serie_logo, released_on, image, cardmarket_id, price_usd" as const;

/**
 * Tout le catalogue. Supabase plafonne chaque requête à 1 000 lignes quel que
 * soit `limit` : on pagine par tranches jusqu'à épuisement.
 */
export async function loadSealedProducts() {
  return loadSealedProductsWith(await createClient());
}

async function loadSealedProductsWith(supabase: SupabaseClient<Database>) {
  const PAGE = 1000;
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from("sealed_products").select(SEALED_SELECT).order("id").range(from, from + PAGE - 1);
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}

/**
 * Catalogue complet + cotes pour la page « Ajouter » : données publiques,
 * identiques pour tous, gardées 1 h (le catalogue et le guide changent une
 * fois par nuit). Les cotes voyagent en entrées de Map, le cache étant JSON.
 */
export const getSealedCatalog = unstable_cache(
  async () => {
    const admin = createAdminClient();
    const products = await loadSealedProductsWith(admin);
    const cotes = await sealedCotes(products, admin);
    return { products, cotes: [...cotes.entries()] };
  },
  ["sealed-catalog"],
  { revalidate: 3600 },
);

export type SnapshotPoint = { day: string; price: number };

/** Historique complet d'un produit, du plus ancien au plus récent */
export async function sealedHistory(productId: number): Promise<SnapshotPoint[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sealed_price_snapshots")
    .select("day, price")
    .eq("product_id", productId)
    .order("day", { ascending: true });
  return (data ?? []).map((r) => ({ day: r.day, price: Number(r.price) }));
}

/**
 * Variation en % entre le dernier relevé et le relevé d'il y a `days` jours
 * (ou le plus proche avant). Null si l'historique ne remonte pas assez loin.
 */
export function variation(points: SnapshotPoint[], days: number): number | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const cutoff = new Date(last.day);
  cutoff.setDate(cutoff.getDate() - days);
  const cut = cutoff.toISOString().slice(0, 10);
  let ref: SnapshotPoint | null = null;
  for (const p of points) {
    if (p.day <= cut) ref = p;
    else break;
  }
  if (!ref || ref.price <= 0 || ref.day === last.day) return null;
  return ((last.price - ref.price) / ref.price) * 100;
}

/** Variation 7 j de plusieurs produits d'un coup (clé : id produit ; null si pas assez d'historique) */
export async function sealedVariations(productIds: number[], days = 7): Promise<Map<number, number | null>> {
  const out = new Map<number, number | null>();
  const ids = [...new Set(productIds)];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days - 3);
  const { data } = await supabase
    .from("sealed_price_snapshots")
    .select("product_id, day, price")
    .in("product_id", ids)
    .gte("day", since.toISOString().slice(0, 10))
    .order("day", { ascending: true });
  const byId = new Map<number, SnapshotPoint[]>();
  for (const r of data ?? []) {
    const arr = byId.get(r.product_id) ?? [];
    arr.push({ day: r.day, price: Number(r.price) });
    byId.set(r.product_id, arr);
  }
  for (const id of ids) out.set(id, variation(byId.get(id) ?? [], days));
  return out;
}
