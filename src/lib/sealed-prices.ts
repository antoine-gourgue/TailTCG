import "server-only";
import { fetchGuidePrices } from "@/lib/cardmarket";

/**
 * Cote € des produits scellés : guide Cardmarket par idProduct d'abord (le
 * guide local couvre aussi les produits non-unitaires), prix marché TCGplayer
 * en repli, converti approximativement.
 */
const USD_TO_EUR = 0.92;

export type SealedPriceInput = { id: number; cardmarket_id: number | null; price_usd: number | null };
export type SealedCote = { value: number; source: "cardmarket" | "tcgplayer" };

/** Cote par produit (clé : id produit). Une seule requête au guide pour tous les idProduct. */
export async function sealedCotes(products: SealedPriceInput[]): Promise<Map<number, SealedCote>> {
  const guide = await fetchGuidePrices(products.map((p) => p.cardmarket_id));
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
