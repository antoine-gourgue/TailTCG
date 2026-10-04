import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, LayoutGrid, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/paginate";
import { getSet } from "@/lib/tcgdex";
import { loadSetPool } from "@/lib/game-pool";
import { PLAYABLE_BY_ID } from "@/lib/game-sets";
import { tierOf, TIERS, type Grade, type Tier } from "@/lib/game";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { GameNav } from "@/components/game/game-nav";
import { CollectionSetGrid, type SetGridCard } from "@/components/game/collection-set-grid";
import { GameCardsGrid, type OwnedCard } from "@/components/game/game-cards-grid";
import { SetLogo } from "@/components/game/set-logo";

export const metadata = {
  title: "Collection virtuelle — TailTCG",
};

type Row = {
  id: string;
  tcgdex_id: string;
  set_id: string;
  set_name: string;
  card_name: string;
  local_id: string;
  image_url: string | null;
  tier: string;
  rarity: string | null;
  for_trade: boolean | null;
  obtained_at: string;
  graded: boolean | null;
  grade_centering: number | null;
  grade_corners: number | null;
  grade_edges: number | null;
  grade_surface: number | null;
  grade_overall: number | null;
};

const asTier = (t: string): Tier => (TIERS.includes(t as Tier) ? (t as Tier) : "common");
const gradeOf = (r: Row): Grade | null =>
  r.graded && r.grade_overall != null
    ? { centering: r.grade_centering ?? 0, corners: r.grade_corners ?? 0, edges: r.grade_edges ?? 0, surface: r.grade_surface ?? 0, overall: r.grade_overall }
    : null;

type View = "sets" | "all" | "doubles" | "graded";

// La collection virtuelle du jeu : vue d'ensemble par set, toutes mes cartes,
// mes doubles, mes gradées, ou un set en détail avec sa complétion.
export default async function GameCollectionPage({ searchParams }: { searchParams: Promise<{ set?: string; view?: string }> }) {
  const { set: setId, view: viewParam } = await searchParams;
  const view: View = viewParam === "all" || viewParam === "doubles" || viewParam === "graded" ? viewParam : "sets";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const all = await fetchAll<Row>((from, to) =>
    supabase
      .from("game_cards")
      .select("id, tcgdex_id, set_id, set_name, card_name, local_id, image_url, tier, rarity, for_trade, obtained_at, graded, grade_centering, grade_corners, grade_edges, grade_surface, grade_overall")
      .order("obtained_at", { ascending: false })
      .range(from, to)
  );
  const qtyById = new Map<string, number>();
  for (const c of all) qtyById.set(c.tcgdex_id, (qtyById.get(c.tcgdex_id) ?? 0) + 1);
  const toOwned = (r: Row): OwnedCard => ({
    id: r.id,
    name: r.card_name,
    setName: r.set_name,
    setId: r.set_id,
    localId: r.local_id,
    image: r.image_url,
    tier: asTier(r.tier),
    rarity: r.rarity,
    grade: gradeOf(r),
    obtainedAt: r.obtained_at,
    forTrade: r.for_trade ?? false,
    qty: qtyById.get(r.tcgdex_id) ?? 1,
  });

  /* ——— Un set : toutes ses cartes, possédées ou non ——— */
  if (setId) {
    // Cartes du set embarquées dans le dépôt ; TCGdex seulement hors instantané
    const local = await loadSetPool(setId);
    const set = local
      ? { id: local.id, name: local.name, serie: local.serie, cards: local.cards }
      : await getSet(setId, "fr").then((s) =>
          s
            ? { id: s.id, name: s.name, serie: s.serie?.name ?? "", cards: (s.cards ?? []).map((c) => ({ id: c.id, name: c.name, localId: c.localId, image: c.image ?? null, rarity: c.rarity ?? null })) }
            : null
        );
    if (!set) redirect("/boosters/collection");
    const meta = PLAYABLE_BY_ID.get(set.id);
    // Un exemplaire représentatif par carte du catalogue (le mieux gradé)
    const rep = new Map<string, Row>();
    const qty = new Map<string, number>();
    for (const c of all) {
      if (c.set_id !== set.id) continue;
      qty.set(c.tcgdex_id, (qty.get(c.tcgdex_id) ?? 0) + 1);
      const cur = rep.get(c.tcgdex_id);
      if (!cur || (gradeOf(c)?.overall ?? -1) > (gradeOf(cur)?.overall ?? -1)) rep.set(c.tcgdex_id, c);
    }
    const list = set.cards;
    const owned = list.filter((c) => qty.has(c.id)).length;
    const pct = list.length > 0 ? Math.round((owned / list.length) * 100) : 0;
    const doubles = [...qty.values()].reduce((n, q) => n + Math.max(0, q - 1), 0);
    const gradedHere = [...rep.values()].filter((r) => gradeOf(r)).length;
    const gridCards: SetGridCard[] = list.map((c) => {
      const r = rep.get(c.id);
      return {
        id: c.id,
        rowId: r?.id ?? null,
        name: c.name,
        localId: c.localId,
        image: c.image ?? null,
        tier: tierOf(c.rarity),
        rarity: c.rarity ?? null,
        qty: qty.get(c.id) ?? 0,
        grade: r ? gradeOf(r) : null,
        obtainedAt: r?.obtained_at ?? null,
        forTrade: r?.for_trade ?? false,
      };
    });
    return (
      <main className="page py-8">
        <Link href="/boosters/collection" className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
          <ChevronLeft size={16} aria-hidden /> Collection virtuelle
        </Link>
        <div className="mb-5 flex flex-wrap items-center gap-4 lg:gap-6">
          <div className="flex h-16 w-24 shrink-0 items-center justify-center">
            <SetLogo logo={meta?.logo ?? null} className="max-h-16 max-w-full object-contain" />
          </div>
          <div className="min-w-0 flex-1">
            {set.serie && <p className="label-xs text-muted">{set.serie}</p>}
            <h1 className="display text-[28px] font-bold tracking-tight sm:text-3xl">{set.name}</h1>
            <p className="num mt-1 text-sm text-muted">
              <span className="font-semibold text-foreground">{owned}</span> / {list.length} possédées · {pct} %{doubles > 0 && ` · ${doubles} double${doubles > 1 ? "s" : ""}`}
              {gradedHere > 0 && ` · ${gradedHere} gradée${gradedHere > 1 ? "s" : ""}`}
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <GameNav current="collection" />
            <Link href={`/boosters?set=${encodeURIComponent(set.id)}`} className="btn btn-primary shadow-lg shadow-accent/30">
              <Package size={15} aria-hidden /> Ouvrir un booster
            </Link>
          </div>
        </div>
        <div className="mb-6 h-2 overflow-hidden rounded-full bg-raised" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(owned > 0 ? 1.5 : 0, pct)}%` }} />
        </div>
        <CollectionSetGrid cards={gridCards} setId={set.id} setName={set.name} />
      </main>
    );
  }

  /* ——— Chiffres et vues ——— */
  const uniqueTotal = qtyById.size;
  const gradedRows = all.filter((c) => gradeOf(c));
  const gems = gradedRows.filter((c) => c.grade_overall === 10).length;
  const doublesTotal = [...qtyById.values()].reduce((n, q) => n + Math.max(0, q - 1), 0);
  type SetAgg = { id: string; name: string; unique: Set<string>; count: number; lastAt: string };
  const bySet = new Map<string, SetAgg>();
  for (const c of all) {
    const s = bySet.get(c.set_id) ?? { id: c.set_id, name: c.set_name, unique: new Set(), count: 0, lastAt: c.obtained_at };
    s.unique.add(c.tcgdex_id);
    s.count += 1;
    bySet.set(c.set_id, s);
  }
  // Total = cartes tirables du set (instantané), cohérent avec les boosters
  const sets = [...bySet.values()]
    .map((s) => {
      const meta = PLAYABLE_BY_ID.get(s.id);
      const total = meta?.total ?? null;
      return { ...s, serie: meta?.serie ?? "", logo: meta?.logo ?? null, owned: s.unique.size, doubles: s.count - s.unique.size, total, pct: total ? Math.min(100, (s.unique.size / total) * 100) : null };
    })
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.owned - a.owned);
  const complete = sets.filter((s) => s.pct != null && s.pct >= 100).length;
  const avgPct = sets.length ? Math.round(sets.reduce((n, s) => n + (s.pct ?? 0), 0) / sets.length) : 0;

  const chips: { key: View; label: string; n: number }[] = [
    { key: "sets", label: "Par set", n: sets.length },
    { key: "all", label: "Toutes mes cartes", n: all.length },
    { key: "doubles", label: "Doubles", n: doublesTotal },
    { key: "graded", label: "Gradées", n: gradedRows.length },
  ];
  const listed: OwnedCard[] =
    view === "all"
      ? all.map(toOwned)
      : view === "doubles"
        ? all.filter((c) => (qtyById.get(c.tcgdex_id) ?? 0) > 1).map(toOwned)
        : view === "graded"
          ? gradedRows.map(toOwned)
          : [];

  return (
    <main className="page py-8">
      <PageHead kicker="Boosters" title="Collection virtuelle" count={all.length || null} sub="Les cartes de tes boosters, set par set. Les doubles servent aux échanges, les plus belles passent sous boîtier.">
        <GameNav current="collection" />
      </PageHead>

      {all.length === 0 ? (
        <Empty />
      ) : (
        <>
          <StatStrip cols={5}>
            <StatCard label="Cartes" value={all.length} sub={`${uniqueTotal} référence${uniqueTotal > 1 ? "s" : ""}`} />
            <StatCard label="Sets commencés" value={sets.length} tone={complete > 0 ? "up" : undefined} sub={complete > 0 ? `${complete} complet${complete > 1 ? "s" : ""}` : "aucun complet pour l’instant"} />
            <StatCard label="Complétion moyenne" value={`${avgPct} %`} sub="sur les sets commencés" />
            <StatCard label="Doubles" value={doublesTotal} sub="à échanger" />
            <StatCard label="Gradées" value={gradedRows.length} tone={gems > 0 ? "up" : undefined} sub={gems > 0 ? `${gems} × Gem Mint 10` : "aucune Gem Mint"} />
          </StatStrip>

          <div className="scrollbar-none -mx-4 mt-4 mb-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {chips.map((c) => (
              <Link key={c.key} href={c.key === "sets" ? "/boosters/collection" : `/boosters/collection?view=${c.key}`} data-on={view === c.key} className={`seg shrink-0 px-3.5 py-1.5 text-[13px] ${view === c.key ? "font-medium text-accent-strong" : "text-muted"}`}>
                {c.label} <span className="num text-[11px] opacity-70">{c.n}</span>
              </Link>
            ))}
          </div>

          {view === "sets" ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {sets.map((s) => (
                <li key={s.id} className="panel flex items-center gap-4 !p-4">
                  <div className="flex h-12 w-[72px] shrink-0 items-center justify-center">
                    <SetLogo logo={s.logo} className="max-h-12 max-w-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {s.serie && <p className="truncate text-[11px] text-muted">{s.serie}</p>}
                    <Link href={`/boosters/collection?set=${encodeURIComponent(s.id)}`} className="block truncate text-[15px] font-semibold hover:text-accent-strong">
                      {s.name}
                    </Link>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(s.pct ?? 0, 1.5)}%` }} />
                    </div>
                    <p className="num mt-1 flex justify-between gap-2 whitespace-nowrap text-[11px] text-muted">
                      <span className="truncate">{s.total != null ? `${s.owned} / ${s.total} · ${Math.round(s.pct ?? 0)} %` : `${s.owned} carte${s.owned > 1 ? "s" : ""}`}</span>
                      <span className="shrink-0">{s.doubles} double{s.doubles > 1 ? "s" : ""}</span>
                    </p>
                  </div>
                  <Link href={`/boosters?set=${encodeURIComponent(s.id)}`} className="btn btn-primary shrink-0 !py-1.5 text-[13px]">
                    Ouvrir
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <GameCardsGrid cards={listed} initialSort={view === "graded" ? "grade" : view === "doubles" ? "rarity" : "recent"} hideGradedFilter={view === "graded"} slabs={view === "graded"} />
          )}
        </>
      )}
    </main>
  );
}

function Empty() {
  return (
    <div className="panel flex flex-col items-center gap-3 p-12 text-center">
      <Package size={40} strokeWidth={1.3} className="text-faint" aria-hidden />
      <p className="display text-xl font-semibold">Rien pour l&apos;instant</p>
      <p className="max-w-sm text-sm text-muted">Ouvre ton premier booster : les cartes tirées apparaîtront ici, set par set.</p>
      <Link href="/boosters" className="btn btn-primary mt-2">
        <LayoutGrid size={15} aria-hidden />
        Ouvrir un booster
      </Link>
    </div>
  );
}
