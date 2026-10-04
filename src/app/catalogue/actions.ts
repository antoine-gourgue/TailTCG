"use server";

import { catalogCard } from "@/lib/catalog";
import { cardmarketUrl, pickCardmarket, type CatalogLang } from "@/lib/tcgdex";
import { resolveCardmarketPrice } from "@/lib/cardmarket";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysAgoISO } from "@/lib/domain";

export type QuickInfo = {
  rarity: string | null;
  price: number | null;
  cmUrl: string | null;
  total: number | null;
  setId: string | null;
  /** Tendance, moyenne 30 jours, prix bas Cardmarket (valeurs positives seulement) */
  market: { trend: number | null; avg30: number | null; low: number | null } | null;
  /** Relevés nocturnes des 30 derniers jours */
  series: number[];
  illustrator: string | null;
  hp: number | null;
};

const EMPTY: QuickInfo = { rarity: null, price: null, cmUrl: null, total: null, setId: null, market: null, series: [], illustrator: null, hp: null };

/** Fiche express d'une carte du catalogue : rareté, cote et marché Cardmarket, historique, détails */
export async function quickInfo(id: string, lang: CatalogLang): Promise<QuickInfo> {
  const card = (await catalogCard(id, lang)) ?? (lang === "fr" ? await catalogCard(id, "ja") : null);
  if (!card) return EMPTY;
  const cmId = overrideCardmarketId(card.id, card.pricing?.cardmarket?.idProduct);
  const [price, { data: snaps }] = await Promise.all([
    resolveCardmarketPrice(cmId, card.pricing?.cardmarket),
    createAdminClient()
      .from("price_snapshots")
      .select("captured_at, reference")
      .eq("tcgdex_id", card.id)
      .not("reference", "is", null)
      .gte("captured_at", daysAgoISO(30))
      .order("captured_at"),
  ]);
  const picked = pickCardmarket(card.pricing?.cardmarket, card.variants);
  const pos = (v: number | null) => (v != null && v > 0 ? v : null);
  const market = { trend: pos(picked.trend), avg30: pos(picked.avg30), low: pos(picked.low) };
  return {
    rarity: card.rarity ?? null,
    price,
    cmUrl: cardmarketUrl({ idProduct: cmId, name: card.name, localId: card.localId }),
    total: card.set.cardCount?.official ?? null,
    setId: card.set.id,
    market: market.trend != null || market.avg30 != null || market.low != null ? market : null,
    series: (snaps ?? []).map((s) => Number(s.reference)).filter((v) => Number.isFinite(v) && v > 0),
    illustrator: card.illustrator ?? null,
    hp: card.hp ?? null,
  };
}
