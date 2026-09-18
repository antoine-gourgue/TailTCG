import "server-only";
import { createClient } from "@/lib/supabase/server";
import { CM_REFERENCE_ORDER, cardmarketReference, type CardmarketPricing } from "@/lib/tcgdex";

/**
 * Prix Cardmarket servi depuis le miroir local du fichier public quotidien
 * (`cardmarket_price_guide`), avec repli sur le bloc TCGdex — même logique que
 * `resolve_market_price_eur` de GoupixDex : le guide local gagne, il est
 * rafraîchi par notre propre cron. Le prix de référence suit l'ordre
 * `avg30 → avg7 → avg → avg1 → trend` (jamais `low`), colonnes normales.
 */
type GuideRow = {
  id_product: number;
  trend: number | null;
  avg7: number | null;
  avg30: number | null;
  avg1: number | null;
  avg: number | null;
};

const SELECT = "id_product, trend, avg7, avg30, avg1, avg";

export function guideReference(row: {
  trend: number | null;
  avg7: number | null;
  avg30: number | null;
  avg1: number | null;
  avg: number | null;
}): number | null {
  for (const field of CM_REFERENCE_ORDER) {
    const v = (row as Record<string, number | null>)[field];
    if (typeof v === "number" && v > 0) return v;
  }
  return null;
}

/** Prix de référence (guide local) pour plusieurs idProduct, en une requête. */
export async function fetchGuidePrices(idProducts: (number | null | undefined)[]): Promise<Map<number, number>> {
  const ids = [...new Set(idProducts.filter((n): n is number => typeof n === "number" && Number.isFinite(n)))];
  const out = new Map<number, number>();
  if (ids.length === 0) return out;
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from("cardmarket_price_guide")
      .select(SELECT)
      .in("id_product", ids.slice(i, i + 500));
    for (const row of (data ?? []) as GuideRow[]) {
      const ref = guideReference(row);
      if (ref != null) out.set(row.id_product, ref);
    }
  }
  return out;
}

/** Prix d'une carte : guide local d'abord (par idProduct), bloc TCGdex en repli. */
export async function resolveCardmarketPrice(
  idProduct: number | null | undefined,
  block: CardmarketPricing | null | undefined
): Promise<number | null> {
  if (typeof idProduct === "number" && Number.isFinite(idProduct)) {
    const prices = await fetchGuidePrices([idProduct]);
    const v = prices.get(idProduct);
    if (v != null) return v;
  }
  return cardmarketReference(block);
}
