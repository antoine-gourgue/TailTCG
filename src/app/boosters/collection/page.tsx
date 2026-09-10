import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, ChevronLeft, LayoutGrid, Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchSetsIndex, getSet } from "@/lib/tcgdex";
import { TIER_LABEL, tierOf, type Grade, type Tier } from "@/lib/game";
import { AppShell } from "@/components/app-shell";
import { GameNav } from "@/components/game/game-nav";
import { CollectionSetGrid, type SetGridCard } from "@/components/game/collection-set-grid";
import { GameCardsGrid, type OwnedCard } from "@/components/game/game-cards-grid";

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
  graded: boolean | null;
  grade_centering: number | null;
  grade_corners: number | null;
  grade_edges: number | null;
  grade_surface: number | null;
  grade_overall: number | null;
};

const gradeOf = (r: Row): Grade | null =>
  r.graded && r.grade_overall != null
    ? {
        centering: r.grade_centering ?? 0,
        corners: r.grade_corners ?? 0,
        edges: r.grade_edges ?? 0,
        surface: r.grade_surface ?? 0,
        overall: r.grade_overall,
      }
    : null;

// La collection virtuelle du jeu : vue d'ensemble par set, toutes mes cartes
// (gradables), ou un set en détail avec sa complétion.
export default async function GameCollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; view?: string }>;
}) {
  const { set: setId, view } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cards } = await supabase
    .from("game_cards")
    .select(
      "id, tcgdex_id, set_id, set_name, card_name, local_id, image_url, tier, graded, grade_centering, grade_corners, grade_edges, grade_surface, grade_overall"
    )
    .order("obtained_at", { ascending: false })
    .range(0, 4999);
  const all = (cards ?? []) as Row[];

  /* ——— Un set : toutes ses cartes, possédées ou non ——— */
  if (setId) {
    const set = await getSet(setId, "fr");
    if (!set) redirect("/boosters/collection");
    // Un exemplaire représentatif par carte du catalogue (le mieux gradé)
    const rep = new Map<string, Row>();
    const qty = new Map<string, number>();
    for (const c of all) {
      if (c.set_id !== set.id) continue;
      qty.set(c.tcgdex_id, (qty.get(c.tcgdex_id) ?? 0) + 1);
      const cur = rep.get(c.tcgdex_id);
      if (!cur || (gradeOf(c)?.overall ?? -1) > (gradeOf(cur)?.overall ?? -1)) rep.set(c.tcgdex_id, c);
    }
    const list = set.cards ?? [];
    const owned = list.filter((c) => qty.has(c.id)).length;
    const pct = list.length > 0 ? Math.round((owned / list.length) * 100) : 0;
    const gridCards: SetGridCard[] = list.map((c) => {
      const r = rep.get(c.id);
      return {
        id: c.id,
        rowId: r?.id ?? null,
        name: c.name,
        localId: c.localId,
        image: c.image ?? null,
        tier: tierOf(c.rarity),
        qty: qty.get(c.id) ?? 0,
        grade: r ? gradeOf(r) : null,
      };
    });
    return (
      <AppShell>
        <main className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                href="/boosters/collection"
                aria-label="Retour à la collection virtuelle"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
              >
                <ChevronLeft size={16} aria-hidden />
              </Link>
              <div className="min-w-0">
                <h1 className="display truncate text-2xl font-bold tracking-tight">{set.name}</h1>
                <p className="num text-sm text-muted">
                  {owned} / {list.length} · {pct}%
                </p>
              </div>
            </div>
            <GameNav current="collection" />
          </div>
          <div className="mb-6 h-2 overflow-hidden rounded-full bg-raised">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <CollectionSetGrid cards={gridCards} setName={set.name} />
        </main>
      </AppShell>
    );
  }

  const uniqueTotal = new Set(all.map((c) => c.tcgdex_id)).size;
  const gradedCount = all.filter((c) => gradeOf(c)).length;

  const tabs = (
    <div className="inline-flex rounded-lg border border-edge bg-surface p-0.5">
      <Link
        href="/boosters/collection"
        aria-current={view !== "all" ? "page" : undefined}
        className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
          view !== "all" ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground"
        }`}
      >
        Par set
      </Link>
      <Link
        href="/boosters/collection?view=all"
        aria-current={view === "all" ? "page" : undefined}
        className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
          view === "all" ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground"
        }`}
      >
        Toutes mes cartes
      </Link>
    </div>
  );

  /* ——— Toutes mes cartes (exemplaires, gradables) ——— */
  if (view === "all") {
    const owned: OwnedCard[] = all.map((r) => ({
      id: r.id,
      name: r.card_name,
      setName: r.set_name,
      localId: r.local_id,
      image: r.image_url,
      tier: (TIERS_SET.has(r.tier) ? r.tier : "common") as Tier,
      grade: gradeOf(r),
    }));
    return (
      <AppShell>
        <main className="mx-auto w-full max-w-6xl px-4 py-8">
          <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="display mb-1 text-3xl font-bold tracking-tight">Collection virtuelle</h1>
              <p className="text-sm text-muted">
                {all.length} carte{all.length > 1 ? "s" : ""} ·{" "}
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck size={13} aria-hidden className="text-accent-strong" />
                  {gradedCount} gradée{gradedCount > 1 ? "s" : ""}
                </span>
              </p>
            </div>
            <GameNav current="collection" />
          </div>
          <div className="mb-5">{tabs}</div>
          {all.length === 0 ? (
            <Empty />
          ) : (
            <GameCardsGrid cards={owned} />
          )}
        </main>
      </AppShell>
    );
  }

  /* ——— Vue d'ensemble : sets commencés ——— */
  type SetAgg = { id: string; name: string; unique: Set<string>; count: number; tiers: Record<string, number> };
  const bySet = new Map<string, SetAgg>();
  for (const c of all) {
    const s = bySet.get(c.set_id) ?? { id: c.set_id, name: c.set_name, unique: new Set(), count: 0, tiers: {} };
    s.unique.add(c.tcgdex_id);
    s.count += 1;
    s.tiers[c.tier] = (s.tiers[c.tier] ?? 0) + 1;
    bySet.set(c.set_id, s);
  }
  const index = bySet.size > 0 ? await fetchSetsIndex().catch(() => new Map()) : new Map();
  const sets = [...bySet.values()]
    .map((s) => {
      const cc = index.get(s.id)?.cardCount;
      const total = cc?.total ?? cc?.official ?? null;
      return { ...s, owned: s.unique.size, total, pct: total ? Math.min(100, (s.unique.size / total) * 100) : null };
    })
    .sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.owned - a.owned);
  const rareOrBetter = all.filter((c) => !["common", "uncommon"].includes(c.tier)).length;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">Collection virtuelle</h1>
            <p className="text-sm text-muted">
              {all.length === 0
                ? "Les cartes de tes boosters, à part de ta vraie collection."
                : `${all.length} carte${all.length > 1 ? "s" : ""} · ${uniqueTotal} différente${uniqueTotal > 1 ? "s" : ""} · ${rareOrBetter} rare${rareOrBetter > 1 ? "s" : ""} ou mieux`}
            </p>
          </div>
          <GameNav current="collection" />
        </div>

        {sets.length === 0 ? (
          <Empty />
        ) : (
          <>
            <div className="mb-5">{tabs}</div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sets.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/boosters/collection?set=${encodeURIComponent(s.id)}`}
                    className="panel group flex flex-col gap-3 p-5 transition hover:border-accent hover:shadow-lg"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium group-hover:text-accent-strong">{s.name}</p>
                      <p className="num shrink-0 text-xs text-muted">
                        {s.total != null ? `${s.owned} / ${s.total} · ${Math.round(s.pct ?? 0)}%` : `${s.owned} cartes`}
                      </p>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(s.pct ?? 0, 1.5)}%` }} />
                    </div>
                    <p className="truncate text-[11px] text-faint">
                      {(Object.entries(s.tiers) as [Tier, number][])
                        .filter(([t]) => t !== "common" && t !== "uncommon")
                        .map(([t, n]) => `${n} ${TIER_LABEL[t] ?? t}`)
                        .join(" · ") || `${s.count} carte${s.count > 1 ? "s" : ""} tirée${s.count > 1 ? "s" : ""}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </AppShell>
  );
}

const TIERS_SET = new Set(["common", "uncommon", "rare", "holo", "ultra", "secret"]);

function Empty() {
  return (
    <div className="panel flex flex-col items-center gap-3 p-12 text-center">
      <Package size={40} strokeWidth={1.3} className="text-faint" aria-hidden />
      <p className="display text-xl font-semibold">Rien pour l&apos;instant</p>
      <p className="max-w-sm text-sm text-muted">
        Ouvre ton premier booster : les cartes tirées apparaîtront ici, set par set.
      </p>
      <Link href="/boosters" className="btn btn-primary mt-2">
        <LayoutGrid size={15} aria-hidden />
        Ouvrir un booster
      </Link>
    </div>
  );
}
