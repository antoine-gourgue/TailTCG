import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { CM_REFERENCE_ORDER, cardmarketReference, cardmarketReferenceField, pickCardmarket, type CardmarketPricing, type CmReferenceField } from "@/lib/tcgdex";
import { japaneseTcgplayerPrice, splitCardId } from "@/lib/tcgplayer-jp";

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
  low: number | null;
};

const SELECT = "id_product, trend, avg7, avg30, avg1, avg, low";

export type GuideRef = { value: number; field: CmReferenceField };

/** Comme guideReference, avec la colonne d'origine */
export function guideReferenceField(row: Omit<GuideRow, "id_product">): GuideRef | null {
  for (const field of CM_REFERENCE_ORDER) {
    const v = (row as Record<string, number | null>)[field];
    if (typeof v === "number" && v > 0) return { value: v, field };
  }
  return null;
}

export function guideReference(row: {
  trend: number | null;
  avg7: number | null;
  avg30: number | null;
  avg1: number | null;
  avg: number | null;
  low?: number | null;
}): number | null {
  for (const field of CM_REFERENCE_ORDER) {
    const v = (row as Record<string, number | null>)[field];
    if (typeof v === "number" && v > 0) return v;
  }
  return null;
}

/** Référence + origine (guide local) pour plusieurs idProduct, par tranches. `client` : pour un contexte sans cookies (cache, admin). */
export async function fetchGuideRefs(idProducts: (number | null | undefined)[], client?: SupabaseClient<Database>): Promise<Map<number, GuideRef>> {
  const ids = [...new Set(idProducts.filter((n): n is number => typeof n === "number" && Number.isFinite(n)))];
  const out = new Map<number, GuideRef>();
  if (ids.length === 0) return out;
  const supabase = client ?? (await createClient());
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await supabase
      .from("cardmarket_price_guide")
      .select(SELECT)
      .in("id_product", ids.slice(i, i + 500));
    for (const row of (data ?? []) as GuideRow[]) {
      const ref = guideReferenceField(row);
      if (ref) out.set(row.id_product, ref);
    }
  }
  return out;
}

/** Prix de référence (guide local) pour plusieurs idProduct. */
export async function fetchGuidePrices(idProducts: (number | null | undefined)[], client?: SupabaseClient<Database>): Promise<Map<number, number>> {
  const refs = await fetchGuideRefs(idProducts, client);
  return new Map([...refs].map(([id, r]) => [id, r.value]));
}

/** Référence et origine d'une carte : guide local d'abord (par idProduct), bloc TCGdex en repli. */
export async function resolveCardmarketRef(
  idProduct: number | null | undefined,
  block: CardmarketPricing | null | undefined,
): Promise<GuideRef | null> {
  if (typeof idProduct === "number" && Number.isFinite(idProduct)) {
    const refs = await fetchGuideRefs([idProduct]);
    const r = refs.get(idProduct);
    if (r) return r;
  }
  return cardmarketReferenceField(block);
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
 * aucune langue ne connaît la carte ; `lang` dit laquelle l'a trouvée.
 */
async function fetchCardPricing(
  id: string
): Promise<{ cm: CardmarketPricing | undefined; variants: { normal?: boolean; holo?: boolean } | undefined; lang: "fr" | "ja" } | null> {
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
      return { cm: card.pricing?.cardmarket, variants: card.variants, lang };
    } catch {
      return null;
    }
  }
  return null;
}

/** idProduct Cardmarket d'une carte (fiche TCGdex FR puis JA, corrections locales), null si inconnu */
export async function cardmarketIdFor(id: string): Promise<number | null> {
  const pricing = await fetchCardPricing(id).catch(() => null);
  return overrideCardmarketId(id, pricing?.cm?.idProduct);
}

/**
 * Cote TCGplayer (export TCGCSV, convertie en euros) d'une carte japonaise
 * que TCGdex FR ne connaît pas : repli des cartes japonaises sans cote
 * Cardmarket. Jamais pour une carte connue en français — un même identifiant
 * peut désigner une carte d'une autre langue au même numéro.
 */
export async function japaneseFallbackPrice(id: string): Promise<{ eur: number; url: string } | null> {
  const parts = splitCardId(id);
  if (!parts) return null;
  return japaneseTcgplayerPrice(parts.setId, parts.localId).catch(() => null);
}

/**
 * Cote de référence d'une carte (guide local par idProduct, repli TCGdex), ou
 * null. `japanese` (exemplaire en japonais) : sans cote Cardmarket, la cote
 * TCGplayer japonaise prend le relais, si TCGdex FR ne connaît pas la carte.
 */
export async function cardMarketSnapshot(
  id: string,
  { japanese = false }: { japanese?: boolean } = {}
): Promise<{ trend: number | null; low: number | null; avg30: number | null; reference: number | null } | null> {
  const pricing = await fetchCardPricing(id);
  let trend: number | null = null;
  let low: number | null = null;
  let avg30: number | null = null;
  let reference: number | null = null;
  if (pricing) {
    const { cm, variants } = pricing;
    ({ trend, low, avg30 } = pickCardmarket(cm, variants));
    const idProduct = overrideCardmarketId(id, cm?.idProduct);
    reference = cardmarketReference(cm);
    if (idProduct != null) {
      const guide = await fetchGuidePrices([idProduct]);
      const gr = guide.get(idProduct);
      if (gr != null) reference = gr;
    }
  }
  if (reference == null && japanese && pricing?.lang !== "fr") {
    reference = (await japaneseFallbackPrice(id))?.eur ?? null;
  }
  if (trend == null && low == null && avg30 == null && reference == null) return null;
  return { trend, low, avg30, reference };
}

/**
 * Relève la cote Cardmarket de cartes et l'écrit dans price_snapshots (guide
 * local par idProduct, repli TCGdex ; FR puis JA). Appelé à l'ajout pour que
 * la valeur Cardmarket apparaisse tout de suite, sans attendre le cron du
 * lendemain. Silencieux : un échec réseau ne bloque pas l'ajout. `japanese` :
 * exemplaires en japonais (repli sur la cote TCGplayer japonaise).
 */
export async function snapshotPrices(
  tcgdexIds: (string | null | undefined)[],
  { japanese = false }: { japanese?: boolean } = {}
): Promise<void> {
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
        const snap = await cardMarketSnapshot(id, { japanese }).catch(() => null);
        if (snap) rows.push({ tcgdex_id: id, captured_at: today, ...snap });
      })
    );
  }
  if (rows.length > 0) {
    await admin.from("price_snapshots").upsert(rows, { onConflict: "tcgdex_id,captured_at" });
  }
}
