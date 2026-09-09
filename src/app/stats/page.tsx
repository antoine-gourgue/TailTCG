import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchSetsIndex } from "@/lib/tcgdex";
import { daysAgoISO, CONDITIONS, LANGUAGES } from "@/lib/domain";
import { signStorageImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import { StatsView, plural, type SetStat, type StatsData } from "@/components/stats-view";
import type { MonthPoint, RankItem, Slice } from "@/components/stats-widgets";

export const metadata = {
  title: "Statistiques — TailTCG",
};

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

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: items }, { data: sources }, { data: hist }, { data: wishlist }, setsIndex] =
    await Promise.all([
      supabase
        .from("collection_value")
        .select(
          "id, tcgdex_id, card_name, set_id, set_name, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, created_at, source_id, current_price, gain, sold_price, sold_at, graded, needs_review"
        ),
      supabase.from("sources").select("id, name"),
      supabase
        .from("item_value_history")
        .select("item_id, value, recorded_at")
        .order("recorded_at"),
      supabase.from("wishlist").select("tcgdex_id"),
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

  let realized = 0;
  for (const s of soldRows) {
    if (s.sold_price != null && s.purchase_price != null) {
      realized += (s.sold_price - s.purchase_price) * qty(s);
    }
  }

  /* ——— Courbe de valeur : à chaque date saisie, somme des dernières valeurs
     connues × quantités ——— */
  const qtyById = new Map(rows.map((r) => [r.id, qty(r)]));
  const valueSeries: { recorded_at: string; value: number }[] = [];
  if (hist && hist.length > 0) {
    const dates = [...new Set(hist.map((h) => h.recorded_at as string))].sort();
    const lastValue = new Map<string, number>();
    for (const d of dates) {
      for (const h of hist) {
        if (h.recorded_at === d && qtyById.has(h.item_id)) lastValue.set(h.item_id, h.value);
      }
      let total = 0;
      for (const [itemId, v] of lastValue) total += v * (qtyById.get(itemId) ?? 1);
      valueSeries.push({ recorded_at: d, value: total });
    }
  }
  // Variation sur 30 jours : dernier point vs dernier point d'il y a ≥ 30 j
  let monthDelta: number | null = null;
  if (valueSeries.length >= 2) {
    const cutoff = daysAgoISO(30);
    const ref = [...valueSeries].reverse().find((p) => p.recorded_at <= cutoff);
    if (ref) monthDelta = valueSeries[valueSeries.length - 1].value - ref.value;
  }

  /* ——— Achats par mois (12 derniers mois) ——— */
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

  /* ——— Sets : progression sur le total réel du set ——— */
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
    return {
      id: s.id,
      name: s.name,
      cards: s.cards,
      owned,
      total,
      pct: total ? Math.min((owned / total) * 100, 100) : null,
    };
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
  const conditionSlices: Slice[] = CONDITIONS.map((c) => ({
    code: c.code,
    label: `${c.code} · ${c.label}`,
    count: byCondition.get(c.code) ?? 0,
  }));
  const languageSlices: Slice[] = [...byLanguage.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => ({
      code,
      label: (LANGUAGES as readonly string[]).includes(code) ? code : `Autre (${code})`,
      count: n,
    }));
  const typeSlices: Slice[] = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, n]) => ({ code, label: code, count: n }));

  /* ——— Dépenses par source (top + « Autres ») ——— */
  const sourceName = new Map((sources ?? []).map((s) => [s.id as string, s.name as string]));
  const bySource = new Map<string, number>();
  for (const r of rows) {
    if (r.purchase_price == null) continue;
    const k = r.source_id ?? "__none__";
    bySource.set(k, (bySource.get(k) ?? 0) + r.purchase_price * qty(r));
  }
  const sourceRows = [...bySource.entries()]
    .map(([k, spent]) => ({
      key: k,
      label: k === "__none__" ? "Sans source" : sourceName.get(k) ?? "Source supprimée",
      spent,
    }))
    .sort((a, b) => b.spent - a.spent);
  const sourceTop = sourceRows.slice(0, SOURCES_SHOWN);
  const sourceRest = sourceRows.slice(SOURCES_SHOWN).reduce((a, s) => a + s.spent, 0);
  if (sourceRest > 0) {
    sourceTop.push({
      key: "__rest__",
      label: `Autres (${sourceRows.length - SOURCES_SHOWN})`,
      spent: sourceRest,
    });
  }

  /* ——— Top / flop plus-values (vignettes signées pour les cartes perso) ——— */
  const withGain = rows.filter((r) => r.gain != null && r.purchase_price != null);
  const toRank = async (list: Row[]): Promise<RankItem[]> =>
    (await signStorageImages(list, user.id)).map((r) => ({
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
        .slice(0, 5)
    ),
  ]);

  /* ——— Wishlist : cartes visées et cote marché connue ——— */
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

  const data: StatsData = {
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
    monthDelta,
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

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="display mb-1 text-3xl font-bold tracking-tight">Statistiques</h1>
          <p className="text-sm text-muted">
            {rows.length === 0
              ? "Ta collection en chiffres, dès tes premières cartes."
              : `${plural(count, "carte")} · ${plural(uniqueIds.size, "unique")} · ${plural(sets.length, "set")}`}
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="panel flex flex-col items-center gap-3 p-12 text-center">
            <Sparkles size={26} strokeWidth={1.6} className="text-faint" aria-hidden />
            <p className="text-sm text-muted">
              Ajoute des cartes pour voir apparaître tes statistiques.
            </p>
          </div>
        ) : (
          <StatsView d={data} />
        )}
      </main>
    </AppShell>
  );
}
