import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Package, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/paginate";
import { fetchPlayableSets, PLAYABLE_BY_ID } from "@/lib/game-sets";
import { loadSetPool } from "@/lib/game-pool";
import { MAX_STOCK, nowMs, tierOf, TIERS, UNLIMITED_BOOSTERS, type Profile, type Tier } from "@/lib/game";
import { GameNav } from "@/components/game/game-nav";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { CardImage } from "@/components/card-image";
import { RarityBadge, RarityPill } from "@/components/game/tier-badge";
import { BoosterOpener } from "@/components/game/booster-opener";

export const metadata = {
  title: "Boosters — TailTCG",
};

/** Sets mis en avant : les plus récents */
const FEATURED = 8;
const RARE_SHOWN = 4;
const SETS_SHOWN = 4;

type CardRow = { tcgdex_id: string; set_id: string; set_name: string; card_name: string; local_id: string; image_url: string | null; rarity: string | null; tier: string; graded: boolean | null; grade_overall: number | null; obtained_at: string };
const asTier = (t: string): Tier => (TIERS.includes(t as Tier) ? (t as Tier) : "common");
const rank = (t: Tier) => TIERS.indexOf(t);

/** Jours consécutifs avec au moins une ouverture, en remontant depuis aujourd'hui (ou hier) */
function streakDays(days: Set<string>): number {
  const d = new Date();
  const key = (x: Date) => x.toISOString().slice(0, 10);
  if (!days.has(key(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(key(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Il y a sept jours (en ms) — hors rendu pour rester idempotent */
function weekAgoMs(): number {
  return Date.now() - 7 * 86_400_000;
}

/** « il y a 2 h », « hier », « il y a 5 j » */
function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "à l’instant";
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `${d} j`;
}

// Le hub du jeu : réserve, choix d'un set et ouverture, plus les chiffres,
// la dernière ouverture, les tirages rares et les sets en cours. Sans lien
// avec la collection réelle.
export default async function BoostersPage({ searchParams }: { searchParams: Promise<{ set?: string }> }) {
  const { set: initialSetId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();
  const [{ data: prof }, sets, cards, { data: openings }, { count: openedCount }] = await Promise.all([
    admin.from("game_profiles").select("boosters, refill_at").eq("owner_id", user.id).maybeSingle(),
    fetchPlayableSets(),
    fetchAll<CardRow>((from, to) =>
      supabase
        .from("game_cards")
        .select("tcgdex_id, set_id, set_name, card_name, local_id, image_url, rarity, tier, graded, grade_overall, obtained_at")
        .order("obtained_at", { ascending: false }).order("id")
        .range(from, to)
    ),
    supabase.from("game_openings").select("set_id, tcgdex_ids, opened_at").order("opened_at", { ascending: false }).limit(400),
    supabase.from("game_openings").select("*", { count: "exact", head: true }),
  ]);
  let profile: Profile;
  if (prof) {
    profile = prof;
  } else {
    // Premier passage : la réserve est pleine
    profile = { boosters: MAX_STOCK, refill_at: new Date(nowMs()).toISOString() };
    await admin.from("game_profiles").insert({ owner_id: user.id, ...profile });
  }

  /* ——— Chiffres ——— */
  const unique = new Set(cards.map((c) => c.tcgdex_id)).size;
  const graded = cards.filter((c) => c.graded && c.grade_overall != null);
  const gems = graded.filter((c) => c.grade_overall === 10).length;
  const weekAgo = weekAgoMs();
  const weekOpened = (openings ?? []).filter((o) => new Date(o.opened_at).getTime() >= weekAgo).length;
  const streak = streakDays(new Set((openings ?? []).map((o) => o.opened_at.slice(0, 10))));

  // Par set : cartes distinctes, dernière obtention, dernière rare
  const ownedBySet: Record<string, number> = {};
  const seen = new Map<string, Set<string>>();
  const lastAt: Record<string, string> = {};
  const lastRareAt: Record<string, string> = {};
  for (const c of cards) {
    (seen.get(c.set_id) ?? seen.set(c.set_id, new Set()).get(c.set_id)!).add(c.tcgdex_id);
    if (!lastAt[c.set_id]) lastAt[c.set_id] = c.obtained_at;
    if (!lastRareAt[c.set_id] && rank(asTier(c.tier)) >= rank("holo")) lastRareAt[c.set_id] = c.obtained_at;
  }
  for (const [id, s] of seen) ownedBySet[id] = s.size;
  const inProgress = Object.keys(ownedBySet)
    .map((id) => {
      const meta = PLAYABLE_BY_ID.get(id);
      const total = meta?.total ?? null;
      return { id, name: meta?.name ?? cards.find((c) => c.set_id === id)?.set_name ?? id, serie: meta?.serie ?? "", owned: ownedBySet[id], total, lastAt: lastAt[id] };
    })
    .filter((s) => s.total == null || s.owned < s.total)
    .sort((a, b) => b.lastAt.localeCompare(a.lastAt))
    .slice(0, SETS_SHOWN);

  // Tirages rares récents (holo et au-delà)
  const rares = cards.filter((c) => rank(asTier(c.tier)) >= rank("holo")).slice(0, RARE_SHOWN);

  // Dernière ouverture : ses cartes retrouvées dans le set embarqué
  const last = openings?.[0] ?? null;
  let lastCards: { id: string; name: string; image: string | null; rarity: string | null; tier: Tier }[] = [];
  if (last) {
    const pool = await loadSetPool(last.set_id);
    const byId = new Map((pool?.cards ?? []).map((c) => [c.id, c]));
    lastCards = last.tcgdex_ids.map((id, i) => {
      const c = byId.get(id);
      const row = cards.find((r) => r.tcgdex_id === id && r.set_id === last.set_id);
      return { id: `${id}-${i}`, name: c?.name ?? row?.card_name ?? id, image: c?.image ?? row?.image_url ?? null, rarity: c?.rarity ?? row?.rarity ?? null, tier: tierOf(c?.rarity ?? row?.rarity) };
    });
  }
  const lastBest = lastCards.reduce<(typeof lastCards)[number] | null>((b, c) => (b == null || rank(c.tier) > rank(b.tier) ? c : b), null);
  const lastSetName = last ? PLAYABLE_BY_ID.get(last.set_id)?.name ?? last.set_id : null;

  return (
    <main className="relative z-10 page py-8">
      <PageHead kicker="Explorer" title="Boosters" sub={`Un jeu à part : ouvre${UNLIMITED_BOOSTERS ? " autant que tu veux" : " un booster toutes les 12 heures"}, collectionne, grade, échange. Rien n’entre dans ta vraie collection.`}>
        <GameNav current="boosters" />
      </PageHead>

      <StatStrip cols={5}>
        <StatCard label="Boosters ouverts" value={openedCount ?? 0} sub={weekOpened > 0 ? `${weekOpened} cette semaine` : "aucun cette semaine"} />
        <StatCard label="Cartes tirées" value={cards.length} sub={`${unique} référence${unique > 1 ? "s" : ""}`} />
        <StatCard label="Sets commencés" value={Object.keys(ownedBySet).length} sub={`sur ${sets.length}`} />
        <StatCard label="Gradées" value={graded.length} tone={gems > 0 ? "up" : undefined} sub={gems > 0 ? `${gems} × Gem Mint 10` : graded.length > 0 ? "aucun 10 pour l’instant" : "rien de gradé"} />
        <StatCard label="Série" value={streak > 0 ? `${streak} j` : "—"} sub={streak > 0 ? "ouvre un booster chaque jour" : "ouvre un booster aujourd’hui"} />
      </StatStrip>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <BoosterOpener profile={profile} featured={sets.slice(0, FEATURED)} sets={sets} serverNow={nowMs()} ownedBySet={ownedBySet} lastRareAt={lastRareAt} initialSetId={initialSetId} />

        <div className="flex flex-col gap-4">
          <section className="panel p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="display text-[15px] font-semibold">Dernière ouverture</h2>
                <p className="text-xs text-muted">{last ? `${lastSetName} · ${since(last.opened_at) === "à l’instant" ? "à l’instant" : `il y a ${since(last.opened_at)}`}` : "Pas encore de booster ouvert."}</p>
              </div>
              {last && (
                <Link href={`/boosters?set=${encodeURIComponent(last.set_id)}`} className="flex shrink-0 items-center gap-1 text-xs text-muted transition hover:text-foreground">
                  Rejouer <ArrowUpRight size={12} aria-hidden />
                </Link>
              )}
            </div>
            {lastCards.length === 0 ? (
              <p className="rounded-xl bg-raised/60 px-3 py-6 text-center text-sm text-muted">Tes cinq cartes apparaîtront ici.</p>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-1.5">
                  {lastCards.map((c) => (
                    <div key={c.id} className="card-tile aspect-[63/88]">
                      <CardImage base={c.image} alt={c.name} />
                      <RarityBadge rarity={c.rarity} tier={c.tier} className="bottom-1 left-1" compact />
                    </div>
                  ))}
                </div>
                {lastBest && (
                  <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    Meilleur tirage : <span className="font-medium text-foreground">{lastBest.name}</span>
                    <RarityPill rarity={lastBest.rarity} tier={lastBest.tier} className="!text-[10px]" />
                  </p>
                )}
              </>
            )}
          </section>

          <section className="panel p-5">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 className="display text-[15px] font-semibold">Tirages rares récents</h2>
                <p className="text-xs text-muted">Holo et au-delà.</p>
              </div>
              <Link href="/boosters/collection?view=all" className="flex shrink-0 items-center gap-1 text-xs text-muted transition hover:text-foreground">
                Collection <ArrowUpRight size={12} aria-hidden />
              </Link>
            </div>
            {rares.length === 0 ? (
              <p className="rounded-xl bg-raised/60 px-3 py-6 text-center text-sm text-muted">Les holo, ultra rares et secrètes s’afficheront ici.</p>
            ) : (
              <ul className="divide-y divide-ring">
                {rares.map((c, i) => (
                  <li key={`${c.tcgdex_id}-${i}`} className="flex items-center gap-3 py-2">
                    <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-raised shadow-sm">
                      <CardImage base={c.image_url} alt="" placeholder="compact" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.card_name}</span>
                      <span className="block truncate text-xs text-muted">
                        {c.set_name} · {c.local_id}
                      </span>
                    </span>
                    <RarityPill rarity={c.rarity} tier={asTier(c.tier)} className="!text-[10px]" />
                    <span className="num w-10 shrink-0 whitespace-nowrap text-right text-[11px] text-muted">{since(c.obtained_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {inProgress.length > 0 && (
        <section className="mt-6">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <div>
              <h2 className="display text-xl font-semibold">Tes sets en cours</h2>
              <p className="text-xs text-muted">Ouvre là où il te manque le plus.</p>
            </div>
            <Link href="/boosters/collection" className="text-xs text-muted hover:text-foreground">
              Toute la collection ↗
            </Link>
          </div>
          <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:px-0 lg:grid-cols-4 [&>*]:w-[240px] [&>*]:shrink-0 sm:[&>*]:w-auto">
            {inProgress.map((s) => {
              const pct = s.total ? Math.round((s.owned / s.total) * 100) : null;
              return (
                <div key={s.id} className="panel flex items-center gap-3 !p-3.5">
                  <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(var(--accent) ${pct ?? 0}%, var(--raised) 0)` }} aria-hidden>
                    <span className="absolute inset-[5px] rounded-full bg-surface" />
                    <span className="num relative text-[10px] font-semibold">{pct != null ? `${pct}%` : s.owned}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="num block truncate text-xs text-muted">
                      {s.owned}
                      {s.total ? ` / ${s.total}` : ""} · {s.serie}
                    </span>
                  </span>
                  <Link href={`/boosters?set=${encodeURIComponent(s.id)}`} className="btn btn-primary shrink-0 !py-1.5 text-[13px]">
                    <Package size={13} aria-hidden /> Ouvrir
                  </Link>
                </div>
              );
            })}
          </div>
        </section>
      )}
      {cards.length === 0 && (
        <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted">
          <Sparkles size={13} className="text-accent-strong" aria-hidden /> Choisis un set et ouvre ton premier booster : cinq cartes, un palier par emplacement, la cinquième toujours rare ou mieux.
        </p>
      )}
    </main>
  );
}
