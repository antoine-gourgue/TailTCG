import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSetsIndex } from "@/lib/tcgdex";
import { daysAgoISO, CONDITIONS, LANGUAGES } from "@/lib/domain";
import { signStorageImages } from "@/lib/images";
import { KIND_ORDER, kindLabel, sealedSetName } from "@/lib/sealed";
import { sealedCotes, sealedVariations, type SealedCote } from "@/lib/sealed-prices";
import type { SetStat, StatsData } from "@/components/stats-view";
import type { MonthPoint, RankItem, Slice } from "@/components/stats-widgets";
import type { ValuePoint } from "@/components/value-history-chart";

/**
 * Données du tableau de bord « Collection » : les cartes (calcul historique
 * de la page Stats) et les scellés, puis leur fusion (valeur totale, courbe
 * combinée, achats par mois). Les requêtes passent par RLS ; `ownerId` filtre
 * en plus, pour qu'un client service role donne le même résultat.
 */
type DB = SupabaseClient<Database>;

type Row = {
  id: string;
  tcgdex_id: string;
  card_name: string;
  set_id: string;
  set_name: string;
  local_id: string;
  image_url: string;
  card_type: string | null;
  language: string;
  condition: string;
  quantity: number | null;
  purchase_price: number | null;
  purchase_date: string | null;
  created_at: string | null;
  source_id: string | null;
  current_price: number | null;
  gain: number | null;
  sold_price: number | null;
  sold_at: string | null;
  graded: boolean | null;
  needs_review: boolean | null;
};

const SOURCES_SHOWN = 6;

/** Les 12 derniers mois, du plus ancien au mois courant */
function monthWindow(): MonthPoint[] {
  const now = new Date();
  const months: MonthPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", ""),
      spend: 0,
      cards: 0,
      current: i === 0,
    });
  }
  return months;
}

/** Variation sur 30 jours d'une série : dernier point moins le dernier point d'il y a ≥ 30 j */
export function monthDeltaOf(series: ValuePoint[]): number | null {
  if (series.length < 2) return null;
  const cutoff = daysAgoISO(30);
  const ref = [...series].reverse().find((p) => p.recorded_at <= cutoff);
  return ref ? series[series.length - 1].value - ref.value : null;
}

/* ═══════════════════════════ Cartes ═══════════════════════════ */

export async function loadCardStats(supabase: DB, ownerId: string): Promise<StatsData> {
  const [{ data: items }, { data: sources }, { data: hist }, { data: wishlist }, setsIndex] = await Promise.all([
    supabase
      .from("collection_value")
      .select(
        "id, tcgdex_id, card_name, set_id, set_name, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, created_at, source_id, current_price, gain, sold_price, sold_at, graded, needs_review",
      )
      .eq("owner_id", ownerId),
    supabase.from("sources").select("id, name"),
    supabase.from("item_value_history").select("item_id, value, recorded_at").eq("owner_id", ownerId).order("recorded_at"),
    supabase.from("wishlist").select("tcgdex_id").eq("owner_id", ownerId),
    fetchSetsIndex(),
  ]);

  const allRows = (items ?? []) as Row[];
  const rows = allRows.filter((r) => r.sold_at == null);
  const soldRows = allRows.filter((r) => r.sold_at != null);
  const qty = (r: Row) => r.quantity ?? 1;

  /* ——— Totaux ——— */
  let count = 0;
  let invested = 0;
  let pricedCount = 0;
  let value = 0;
  let valuedCount = 0;
  let graded = 0;
  let toReview = 0;
  const uniqueIds = new Set<string>();
  for (const r of rows) {
    const q = qty(r);
    count += q;
    uniqueIds.add(r.tcgdex_id);
    if (r.purchase_price != null) {
      invested += r.purchase_price * q;
      pricedCount += q;
    }
    if (r.current_price != null) {
      value += r.current_price * q;
      valuedCount += q;
    }
    if (r.graded) graded += q;
    if (r.needs_review) toReview += q;
  }
  const hasValue = valuedCount > 0;
  const gain = hasValue ? value - invested : null;
  const gainPct = gain != null && invested > 0 ? (gain / invested) * 100 : null;

  /* ——— Valeur Cardmarket : prix de référence du dernier relevé (≤ 10 j), comme sur la page Cartes ——— */
  let market = 0;
  let marketCount = 0;
  {
    const tcgIds = [...new Set(rows.map((r) => r.tcgdex_id).filter((x): x is string => !!x && !x.startsWith("custom:")))];
    if (tcgIds.length > 0) {
      const { data: snaps } = await createAdminClient()
        .from("price_snapshots")
        .select("tcgdex_id, reference, captured_at")
        .in("tcgdex_id", tcgIds)
        .not("reference", "is", null)
        .gte("captured_at", daysAgoISO(10))
        .order("captured_at", { ascending: false });
      const ref = new Map<string, number>();
      for (const sn of snaps ?? []) if (sn.reference != null && !ref.has(sn.tcgdex_id)) ref.set(sn.tcgdex_id, Number(sn.reference));
      for (const r of rows) {
        const m = ref.get(r.tcgdex_id);
        if (m == null) continue;
        market += m * qty(r);
        marketCount += qty(r);
      }
    }
  }

  let realized = 0;
  for (const s of soldRows) {
    if (s.sold_price != null && s.purchase_price != null) realized += (s.sold_price - s.purchase_price) * qty(s);
  }

  /* ——— Courbe : à chaque date saisie, somme des dernières valeurs connues × quantités ——— */
  const qtyById = new Map(rows.map((r) => [r.id, qty(r)]));
  const valueSeries: ValuePoint[] = [];
  if (hist && hist.length > 0) {
    const dates = [...new Set(hist.map((h) => h.recorded_at as string))].sort();
    const lastValue = new Map<string, number>();
    for (const d of dates) {
      for (const h of hist) if (h.recorded_at === d && qtyById.has(h.item_id)) lastValue.set(h.item_id, h.value);
      let total = 0;
      for (const [itemId, v] of lastValue) total += v * (qtyById.get(itemId) ?? 1);
      valueSeries.push({ recorded_at: d, value: total });
    }
  }

  /* ——— Achats par mois ——— */
  const months = monthWindow();
  const monthIndex = new Map(months.map((m, i) => [m.key, i]));
  for (const r of rows) {
    const date = r.purchase_date ?? r.created_at?.slice(0, 10) ?? null;
    if (!date) continue;
    const idx = monthIndex.get(date.slice(0, 7));
    if (idx == null) continue;
    months[idx].cards += qty(r);
    if (r.purchase_price != null) months[idx].spend += r.purchase_price * qty(r);
  }
  const yearSpend = months.reduce((a, m) => a + m.spend, 0);
  const yearCards = months.reduce((a, m) => a + m.cards, 0);
  const activeMonths = months.filter((m) => m.spend > 0).length;

  /* ——— Sets ——— */
  type SetAgg = { id: string; name: string; cards: number; owned: Set<string> };
  const bySet = new Map<string, SetAgg>();
  for (const r of rows) {
    const id = r.set_id ?? "?";
    const s = bySet.get(id) ?? { id, name: r.set_name ?? id, cards: 0, owned: new Set<string>() };
    s.cards += qty(r);
    s.owned.add(r.tcgdex_id);
    bySet.set(id, s);
  }
  const sets: SetStat[] = [...bySet.values()].map((s) => {
    const cc = setsIndex.get(s.id)?.cardCount;
    const total = cc?.total ?? cc?.official ?? null;
    const owned = s.owned.size;
    return { id: s.id, name: s.name, cards: s.cards, owned, total, pct: total ? Math.min((owned / total) * 100, 100) : null };
  });
  sets.sort((a, b) => {
    if (a.pct != null && b.pct != null) return b.pct - a.pct || b.cards - a.cards;
    if (a.pct != null) return -1;
    if (b.pct != null) return 1;
    return b.cards - a.cards;
  });
  const completeSets = sets.filter((s) => s.pct != null && s.pct >= 100).length;

  /* ——— Répartitions ——— */
  const countBy = (pick: (r: Row) => string) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = pick(r);
      m.set(k, (m.get(k) ?? 0) + qty(r));
    }
    return m;
  };
  const byCondition = countBy((r) => r.condition ?? "?");
  const byLanguage = countBy((r) => r.language ?? "?");
  const byType = countBy((r) => r.card_type || "Non renseigné");
  const conditionSlices: Slice[] = CONDITIONS.map((c) => ({ code: c.code, label: `${c.code} · ${c.label}`, count: byCondition.get(c.code) ?? 0 }));
  const languageSlices: Slice[] = [...byLanguage.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => ({ code, label: (LANGUAGES as readonly string[]).includes(code) ? code : `Autre (${code})`, count: n }));
  const typeSlices: Slice[] = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, label: code, count: n }));

  /* ——— Dépenses par source ——— */
  const sourceName = new Map((sources ?? []).map((s) => [s.id as string, s.name as string]));
  const bySource = new Map<string, number>();
  for (const r of rows) {
    if (r.purchase_price == null) continue;
    const k = r.source_id ?? "__none__";
    bySource.set(k, (bySource.get(k) ?? 0) + r.purchase_price * qty(r));
  }
  const sourceRows = [...bySource.entries()]
    .map(([k, spent]) => ({ key: k, label: k === "__none__" ? "Sans source" : (sourceName.get(k) ?? "Source supprimée"), spent }))
    .sort((a, b) => b.spent - a.spent);
  const sourceTop = sourceRows.slice(0, SOURCES_SHOWN);
  const sourceRest = sourceRows.slice(SOURCES_SHOWN).reduce((a, s) => a + s.spent, 0);
  if (sourceRest > 0) sourceTop.push({ key: "__rest__", label: `Autres (${sourceRows.length - SOURCES_SHOWN})`, spent: sourceRest });

  /* ——— Top / flop plus-values ——— */
  const withGain = rows.filter((r) => r.gain != null && r.purchase_price != null);
  const toRank = async (list: Row[]): Promise<RankItem[]> =>
    (await signStorageImages(list, ownerId)).map((r) => ({
      id: r.id,
      card_name: r.card_name,
      set_name: r.set_name,
      local_id: r.local_id,
      image_url: r.image_url,
      gain: r.gain!,
      pct: r.purchase_price ? (r.gain! / (r.purchase_price * qty(r))) * 100 : null,
    }));
  const [top, flop] = await Promise.all([
    toRank([...withGain].sort((a, b) => b.gain! - a.gain!).slice(0, 5)),
    toRank(
      [...withGain]
        .filter((r) => r.gain! < 0)
        .sort((a, b) => a.gain! - b.gain!)
        .slice(0, 5),
    ),
  ]);

  /* ——— Wishlist ——— */
  const wishIds = (wishlist ?? []).map((w) => w.tcgdex_id as string);
  let wishCost: number | null = null;
  if (wishIds.length > 0) {
    const { data: snaps } = await supabase
      .from("price_snapshots")
      .select("tcgdex_id, trend, captured_at")
      .in("tcgdex_id", wishIds)
      .order("captured_at", { ascending: false });
    const seen = new Set<string>();
    for (const s of snaps ?? []) {
      if (seen.has(s.tcgdex_id) || s.trend == null) continue;
      seen.add(s.tcgdex_id);
      wishCost = (wishCost ?? 0) + Number(s.trend);
    }
  }

  return {
    count,
    unique: uniqueIds.size,
    completeSets,
    graded,
    toReview,
    invested,
    pricedCount,
    value: hasValue ? value : null,
    valuedCount,
    gain,
    gainPct,
    market: marketCount > 0 ? market : null,
    marketCount,
    monthDelta: monthDeltaOf(valueSeries),
    soldCount: soldRows.length,
    realized,
    valueSeries,
    months,
    yearSpend,
    yearCards,
    activeMonths,
    sets,
    sources: sourceTop,
    sourcesCount: sourceRows.length,
    conditionSlices,
    languageSlices,
    typeSlices,
    hasGain: withGain.length > 0,
    top,
    flop,
    wishCount: wishIds.length,
    wishCost,
  };
}

/* ═══════════════════════════ Scellés ═══════════════════════════ */

export type SealedRank = {
  id: number;
  name: string;
  image: string;
  kind: string;
  set: string;
  quantity: number;
  /** valeur estimée du lot (cote ou prix manuel × quantité) */
  value: number | null;
  /** plus-value latente du lot (valeur − payé), quand le prix d'achat est connu */
  gain: number | null;
  gainPct: number | null;
  /** variation de la cote sur 7 jours, en % */
  delta: number | null;
};

export type SealedStats = {
  count: number;
  unique: number;
  invested: number;
  pricedCount: number;
  value: number | null;
  valuedCount: number;
  gain: number | null;
  gainPct: number | null;
  kindSlices: Slice[];
  kindValues: { key: string; label: string; value: number; count: number }[];
  series: ValuePoint[];
  /** premier relevé quotidien de cote, null tant qu'aucun */
  snapshotsSince: string | null;
  top: SealedRank[];
  movers: SealedRank[];
  gains: SealedRank[];
  /** dépenses par mois (clé AAAA-MM) */
  monthSpend: Map<string, number>;
};

type SealedProductRow = {
  id: number;
  name: string;
  kind: string;
  set_name: string;
  set_name_fr: string | null;
  image: string;
  cardmarket_id: number | null;
  price_usd: number | null;
};
type LotRow = {
  quantity: number;
  purchase_price: number | null;
  purchase_date: string | null;
  manual_price: number | null;
  created_at: string | null;
  product: SealedProductRow | SealedProductRow[] | null;
};

export async function loadSealedStats(supabase: DB, ownerId: string, opts: { cotes?: Map<number, SealedCote> } = {}): Promise<SealedStats> {
  const { data } = await supabase
    .from("sealed_items")
    .select("quantity, purchase_price, purchase_date, manual_price, created_at, product:sealed_products(id, name, kind, set_name, set_name_fr, image, cardmarket_id, price_usd)")
    .eq("owner_id", ownerId);
  const lots = ((data ?? []) as LotRow[])
    .map((l) => ({ ...l, product: Array.isArray(l.product) ? (l.product[0] ?? null) : l.product }))
    .filter((l): l is LotRow & { product: SealedProductRow } => !!l.product);

  type Agg = { product: SealedProductRow; quantity: number; paid: number; pricedQty: number; manual: number | null };
  const byProduct = new Map<number, Agg>();
  const monthSpend = new Map<string, number>();
  for (const l of lots) {
    const g = byProduct.get(l.product.id) ?? { product: l.product, quantity: 0, paid: 0, pricedQty: 0, manual: null };
    g.quantity += l.quantity;
    if (l.purchase_price != null) {
      g.paid += l.purchase_price * l.quantity;
      g.pricedQty += l.quantity;
      if (l.purchase_date) {
        const k = l.purchase_date.slice(0, 7);
        monthSpend.set(k, (monthSpend.get(k) ?? 0) + l.purchase_price * l.quantity);
      }
    }
    if (l.manual_price != null) g.manual = l.manual_price;
    byProduct.set(l.product.id, g);
  }
  const groups = [...byProduct.values()];
  const ids = groups.map((g) => g.product.id);
  const [cotes, variations] = await Promise.all([opts.cotes ?? sealedCotes(groups.map((g) => g.product)), sealedVariations(ids, 7)]);

  let count = 0;
  let invested = 0;
  let pricedCount = 0;
  let value = 0;
  let valuedCount = 0;
  const ranks: SealedRank[] = [];
  const kindCount = new Map<string, number>();
  const kindValue = new Map<string, number>();
  for (const g of groups) {
    const unit = g.manual ?? cotes.get(g.product.id)?.value ?? null;
    const v = unit != null ? unit * g.quantity : null;
    count += g.quantity;
    invested += g.paid;
    pricedCount += g.pricedQty;
    if (v != null) {
      value += v;
      valuedCount += g.quantity;
      kindValue.set(g.product.kind, (kindValue.get(g.product.kind) ?? 0) + v);
    }
    kindCount.set(g.product.kind, (kindCount.get(g.product.kind) ?? 0) + g.quantity);
    // plus-value seulement sur la part dont on connaît le prix payé
    const gain = v != null && g.pricedQty > 0 && unit != null ? unit * g.pricedQty - g.paid : null;
    ranks.push({
      id: g.product.id,
      name: g.product.name,
      image: g.product.image,
      kind: g.product.kind,
      set: sealedSetName(g.product),
      quantity: g.quantity,
      value: v,
      gain,
      gainPct: gain != null && g.paid > 0 ? (gain / g.paid) * 100 : null,
      delta: variations.get(g.product.id) ?? null,
    });
  }
  const hasValue = valuedCount > 0;
  // plus-value globale sur les lots dont le prix payé est connu
  const gain = hasValue ? ranks.reduce((a, r) => a + (r.gain ?? 0), 0) : null;
  const gainPct = gain != null && invested > 0 ? (gain / invested) * 100 : null;

  const kindOrder = (k: string) => (KIND_ORDER.indexOf(k) === -1 ? KIND_ORDER.length : KIND_ORDER.indexOf(k));
  const kindSlices: Slice[] = [...kindCount.entries()]
    .sort((a, b) => kindOrder(a[0]) - kindOrder(b[0]))
    .map(([code, n]) => ({ code, label: kindLabel(code), count: n }));
  const kindValues = [...kindValue.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([key, v]) => ({ key, label: kindLabel(key), value: v, count: kindCount.get(key) ?? 0 }));

  /* ——— Courbe : chaque lot compte à partir de sa date d'achat. Cote du jour
     par le relevé quotidien (première cote connue reportée en arrière avant le
     premier relevé), cote actuelle pour aujourd'hui. ——— */
  const series: ValuePoint[] = [];
  let snapshotsSince: string | null = null;
  if (ids.length > 0) {
    const { data: snaps } = await supabase.from("sealed_price_snapshots").select("product_id, day, price").in("product_id", ids).order("day");
    const snapsBy = new Map<number, { day: string; price: number }[]>();
    for (const sn of snaps ?? []) {
      const list = snapsBy.get(sn.product_id) ?? [];
      list.push({ day: sn.day as string, price: Number(sn.price) });
      snapsBy.set(sn.product_id, list);
    }
    snapshotsSince = (snaps?.[0]?.day as string | undefined) ?? null;
    const today = new Date().toISOString().slice(0, 10);
    const starts = lots.map((l) => {
      const start = l.purchase_date ?? l.created_at?.slice(0, 10) ?? today;
      return { pid: l.product.id, qty: l.quantity, start: start > today ? today : start };
    });
    const unitAt = (pid: number, day: string): number => {
      if (day === today) {
        const cur = byProduct.get(pid)?.manual ?? cotes.get(pid)?.value;
        if (cur != null) return cur;
      }
      const list = snapsBy.get(pid);
      if (list?.length) {
        let last: number | null = null;
        for (const sn of list) {
          if (sn.day > day) break;
          last = sn.price;
        }
        return last ?? list[0].price;
      }
      return cotes.get(pid)?.value ?? byProduct.get(pid)?.manual ?? 0;
    };
    const days = [...new Set([...starts.map((st) => st.start), ...(snaps ?? []).map((sn) => sn.day as string), today])].sort();
    for (const d of days) {
      let total = 0;
      let active = false;
      for (const st of starts) {
        if (st.start > d) continue;
        active = true;
        total += st.qty * unitAt(st.pid, d);
      }
      if (active) series.push({ recorded_at: d, value: total });
    }
  }

  const byValue = ranks.filter((r) => r.value != null).sort((a, b) => b.value! - a.value!);
  const movers = ranks.filter((r) => r.delta != null).sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!));
  const gains = ranks.filter((r) => r.gain != null).sort((a, b) => b.gain! - a.gain!);

  return {
    count,
    unique: groups.length,
    invested,
    pricedCount,
    value: hasValue ? value : null,
    valuedCount,
    gain,
    gainPct,
    kindSlices,
    kindValues,
    series,
    snapshotsSince,
    top: byValue.slice(0, 5),
    movers: movers.slice(0, 5),
    gains: gains.slice(0, 5),
    monthSpend,
  };
}

/* ═══════════════════════════ Fusion ═══════════════════════════ */

/** Union des dates, chaque composante reportée jusqu'au point suivant */
export function mergeValueSeries(a: ValuePoint[], b: ValuePoint[]): ValuePoint[] {
  if (a.length === 0) return b;
  if (b.length === 0) return a;
  const dates = [...new Set([...a, ...b].map((p) => p.recorded_at))].sort();
  let ia = -1;
  let ib = -1;
  const out: ValuePoint[] = [];
  for (const d of dates) {
    while (ia + 1 < a.length && a[ia + 1].recorded_at <= d) ia++;
    while (ib + 1 < b.length && b[ib + 1].recorded_at <= d) ib++;
    out.push({ recorded_at: d, value: (ia >= 0 ? a[ia].value : 0) + (ib >= 0 ? b[ib].value : 0) });
  }
  return out;
}

/** Cartes + scellés : totaux, courbe empilée et achats mensuels cumulés */
export type CombinedStats = {
  count: number;
  value: number | null;
  /** cartes au cours Cardmarket + scellés à la cote */
  market: number | null;
  invested: number;
  pricedCount: number;
  gain: number | null;
  gainPct: number | null;
  /** somme des variations 30 j de chaque composante (chacune sur son propre historique) */
  monthDelta: number | null;
  cardsMonthDelta: number | null;
  sealedMonthDelta: number | null;
  /** part des cartes dans la valeur estimée, en % */
  cardsShare: number | null;
  valueSeries: ValuePoint[];
  /** premier relevé quotidien de cote des scellés, null tant qu'aucun */
  sealedStart: string | null;
  months: MonthPoint[];
  yearSpend: number;
  yearSealedSpend: number;
  activeMonths: number;
};

export function combineStats(d: StatsData, s: SealedStats): CombinedStats {
  const anyValue = d.value != null || s.value != null;
  const value = anyValue ? (d.value ?? 0) + (s.value ?? 0) : null;
  const invested = d.invested + s.invested;
  const gain = anyValue ? (d.gain ?? 0) + (s.gain ?? 0) : null;
  const cardsMonthDelta = d.monthDelta;
  const sealedMonthDelta = monthDeltaOf(s.series);
  const monthDelta = cardsMonthDelta == null && sealedMonthDelta == null ? null : (cardsMonthDelta ?? 0) + (sealedMonthDelta ?? 0);
  const months = d.months.map((m) => {
    const sealed = s.monthSpend.get(m.key) ?? 0;
    return { ...m, spend: m.spend + sealed, sealed };
  });
  return {
    count: d.count + s.count,
    value,
    market: d.market == null && s.value == null ? null : (d.market ?? 0) + (s.value ?? 0),
    invested,
    pricedCount: d.pricedCount + s.pricedCount,
    gain,
    gainPct: gain != null && invested > 0 ? (gain / invested) * 100 : null,
    monthDelta,
    cardsMonthDelta,
    sealedMonthDelta,
    cardsShare: value != null && value > 0 ? ((d.value ?? 0) / value) * 100 : null,
    valueSeries: mergeValueSeries(d.valueSeries, s.series),
    sealedStart: s.snapshotsSince,
    months,
    yearSpend: months.reduce((a, m) => a + m.spend, 0),
    yearSealedSpend: months.reduce((a, m) => a + (m.sealed ?? 0), 0),
    activeMonths: months.filter((m) => m.spend > 0).length,
  };
}
