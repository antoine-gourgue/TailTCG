import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { CM_REFERENCE_ORDER, cardmarketReference, pickCardmarket, type CardmarketPricing } from "@/lib/tcgdex";

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

/**
 * Cote Cardmarket brute d'une carte, essayée en français PUIS en japonais :
 * les cartes japonaises (id « SV4a-347 », set japonais) n'existent pas dans
 * TCGdex FR mais ont bien un idProduct Cardmarket côté JA. Renvoie null si
 * aucune langue ne connaît la carte.
 */
async function fetchCardPricing(
  id: string
): Promise<{ cm: CardmarketPricing | undefined; variants: { normal?: boolean; holo?: boolean } | undefined } | null> {
  for (const lang of ["fr", "ja"] as const) {
    try {
      const res = await fetch(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(id)}`, {
        next: { revalidate: 3600 },
      });
      if (res.status === 404) continue;
      if (!res.ok) return null;
      const card: {
        pricing?: { cardmarket?: CardmarketPricing };
        variants?: { normal?: boolean; holo?: boolean };
      } = await res.json();
      return { cm: card.pricing?.cardmarket, variants: card.variants };
    } catch {
      return null;
    }
  }
  return null;
}

/** Cote Cardmarket de référence d'une carte (guide local par idProduct, repli TCGdex), ou null */
export async function cardMarketSnapshot(
  id: string
): Promise<{ trend: number | null; low: number | null; avg30: number | null; reference: number | null } | null> {
  const pricing = await fetchCardPricing(id);
  if (!pricing) return null;
  const { cm, variants } = pricing;
  const { trend, low, avg30 } = pickCardmarket(cm, variants);
  const idProduct = overrideCardmarketId(id, cm?.idProduct);
  let reference = cardmarketReference(cm);
  if (idProduct != null) {
    const guide = await fetchGuidePrices([idProduct]);
    const gr = guide.get(idProduct);
    if (gr != null) reference = gr;
  }
  if (trend == null && low == null && avg30 == null && reference == null) return null;
  return { trend, low, avg30, reference };
}

/**
 * Relève la cote Cardmarket de cartes et l'écrit dans price_snapshots (guide
 * local par idProduct, repli TCGdex ; FR puis JA). Appelé à l'ajout pour que
 * la valeur Cardmarket apparaisse tout de suite, sans attendre le cron du
 * lendemain. Silencieux : un échec réseau ne bloque pas l'ajout.
 */
export async function snapshotPrices(tcgdexIds: (string | null | undefined)[]): Promise<void> {
  const ids = [
    ...new Set(tcgdexIds.filter((id): id is string => !!id && !id.startsWith("custom:"))),
    // borne : un très gros ajout en masse ne doit pas retarder la réponse ;
    // le cron quotidien relèvera le reste.
  ].slice(0, 60);
  if (ids.length === 0) return;
  const admin = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const rows: {
    tcgdex_id: string;
    captured_at: string;
    trend: number | null;
    low: number | null;
    avg30: number | null;
    reference: number | null;
  }[] = [];

  const CHUNK = 6;
  for (let i = 0; i < ids.length; i += CHUNK) {
    await Promise.all(
      ids.slice(i, i + CHUNK).map(async (id) => {
        const snap = await cardMarketSnapshot(id).catch(() => null);
        if (snap) rows.push({ tcgdex_id: id, captured_at: today, ...snap });
      })
    );
  }
  if (rows.length > 0) {
    await admin.from("price_snapshots").upsert(rows, { onConflict: "tcgdex_id,captured_at" });
  }
}
