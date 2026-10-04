import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/paginate";
import { GRADE_AXES, gradeLabel, TIERS, type Grade, type Tier } from "@/lib/game";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { GameNav } from "@/components/game/game-nav";
import { GradingLab } from "@/components/game/grading-lab";
import { GradeDistribution } from "@/components/game/grade-stats";
import { GameCardsGrid, type OwnedCard } from "@/components/game/game-cards-grid";
import { GradedSlab } from "@/components/graded-slab";

export const metadata = {
  title: "Gradation — TailTCG",
};

type Row = {
  id: string;
  tcgdex_id: string;
  set_id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string | null;
  tier: string;
  rarity: string | null;
  obtained_at: string;
  graded_at: string | null;
  graded: boolean | null;
  grade_centering: number | null;
  grade_corners: number | null;
  grade_edges: number | null;
  grade_surface: number | null;
  grade_overall: number | null;
};

const asTier = (t: string): Tier => (TIERS.includes(t as Tier) ? (t as Tier) : "common");
const toGrade = (r: Row): Grade | null =>
  r.graded && r.grade_overall != null
    ? { centering: r.grade_centering ?? 0, corners: r.grade_corners ?? 0, edges: r.grade_edges ?? 0, surface: r.grade_surface ?? 0, overall: r.grade_overall }
    : null;
const toOwned = (r: Row, grade: Grade | null): OwnedCard => ({
  id: r.id,
  name: r.card_name,
  setName: r.set_name,
  setId: r.set_id,
  localId: r.local_id,
  image: r.image_url,
  tier: asTier(r.tier),
  rarity: r.rarity,
  grade,
  obtainedAt: r.obtained_at,
});

/** « il y a 2 h », « hier », « il y a 5 j » */
function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return "à l’instant";
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "hier" : `il y a ${d} j`;
}

// Onglet dédié : chiffres des notes, labo de sélection, boîtiers obtenus
export default async function GradationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const all = await fetchAll<Row>((from, to) =>
    supabase
      .from("game_cards")
      .select("id, tcgdex_id, set_id, card_name, set_name, local_id, image_url, tier, rarity, obtained_at, graded_at, graded, grade_centering, grade_corners, grade_edges, grade_surface, grade_overall")
      .order("obtained_at", { ascending: false }).order("id")
      .range(from, to)
  );

  const ungraded: OwnedCard[] = [];
  const graded: OwnedCard[] = [];
  const overalls: number[] = [];
  let last: { row: Row; grade: Grade } | null = null;
  let best: { row: Row; grade: Grade } | null = null;
  for (const r of all) {
    const g = toGrade(r);
    if (g) {
      graded.push(toOwned(r, g));
      overalls.push(g.overall);
      if (!last || (r.graded_at ?? "") > (last.row.graded_at ?? "")) last = { row: r, grade: g };
      if (!best || g.overall > best.grade.overall) best = { row: r, grade: g };
    } else if (r.grade_overall != null) {
      ungraded.push(toOwned(r, null));
    }
  }
  const avg = overalls.length ? overalls.reduce((a, b) => a + b, 0) / overalls.length : null;
  const gems = overalls.filter((g) => g === 10).length;
  const commons = ungraded.filter((c) => c.tier === "common").length;

  return (
    <main className="page py-8">
      <PageHead kicker="Boosters" title="Gradation" sub="Coche des cartes et lance la gradation : 4 sous-notes, une note globale, et la carte passe sous boîtier.">
        <GameNav current="gradation" />
      </PageHead>

      <StatStrip cols={5}>
        <StatCard label="Gradées" value={graded.length} sub={`sur ${all.length} carte${all.length > 1 ? "s" : ""}`} />
        <StatCard label="Note moyenne" value={avg != null ? avg.toFixed(1).replace(".", ",") : "—"} sub="sur 10" />
        <StatCard label="Gem Mint 10" value={gems} tone={gems > 0 ? "up" : undefined} sub={overalls.length ? `${Math.round((gems / overalls.length) * 100)} % des gradées` : "aucune gradée"} />
        <StatCard label="Meilleure" value={best ? best.grade.overall : "—"} sub={best ? `${best.row.card_name} · ${best.row.set_name}` : "grade une première carte"} />
        <StatCard label="À grader" value={ungraded.length} sub={commons > 0 && commons === ungraded.length ? "que des communes" : commons > ungraded.length / 2 ? "surtout des communes" : `${ungraded.length - commons} rare${ungraded.length - commons > 1 ? "s" : ""} ou mieux`} />
      </StatStrip>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0">
          <GradingLab cards={ungraded} gradedCount={graded.length} />
        </div>
        <div className="flex flex-col gap-4">
          <GradeDistribution overalls={overalls} />
          {last && (
            <section className="panel p-5">
              <h2 className="display text-[15px] font-semibold">Dernier boîtier</h2>
              <p className="text-xs text-muted">
                {last.row.card_name} · {last.row.graded_at ? since(last.row.graded_at) : ""}
              </p>
              <div className="mx-auto mt-3 max-w-[220px]">
                <GradedSlab name={last.row.card_name} setName={last.row.set_name} localId={last.row.local_id} imageUrl={last.row.image_url} grade={last.grade.overall} centering={last.grade.centering} corners={last.grade.corners} edges={last.grade.edges} surface={last.grade.surface} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                {GRADE_AXES.map((a) => (
                  <div key={a.key} className="flex items-baseline justify-between">
                    <dt className="text-muted">{a.label}</dt>
                    <dd className="num font-semibold">{last!.grade[a.key]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-center text-[11px] text-muted">
                {gradeLabel(last.grade.overall)} · <span className="num">{last.grade.overall} / 10</span>
              </p>
            </section>
          )}
        </div>
      </div>

      {graded.length > 0 && (
        <section className="mt-6">
          <div className="mb-3">
            <h2 className="display text-xl font-semibold">
              Mes boîtiers <span className="num text-sm font-normal text-muted">{graded.length}</span>
            </h2>
          </div>
          <GameCardsGrid cards={graded} initialSort="grade" hideGradedFilter />
        </section>
      )}
    </main>
  );
}
