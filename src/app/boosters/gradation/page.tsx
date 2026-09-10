import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Grade, type Tier } from "@/lib/game";
import { AppShell } from "@/components/app-shell";
import { GameNav } from "@/components/game/game-nav";
import { GradingLab } from "@/components/game/grading-lab";
import { GradeStats } from "@/components/game/grade-stats";
import { GameCardsGrid, type OwnedCard } from "@/components/game/game-cards-grid";

export const metadata = {
  title: "Gradation — TailTCG",
};

const TIERS_SET = new Set(["common", "uncommon", "rare", "holo", "ultra", "secret"]);

type Row = {
  id: string;
  card_name: string;
  set_name: string;
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

const toGrade = (r: Row): Grade | null =>
  r.graded && r.grade_overall != null
    ? {
        centering: r.grade_centering ?? 0,
        corners: r.grade_corners ?? 0,
        edges: r.grade_edges ?? 0,
        surface: r.grade_surface ?? 0,
        overall: r.grade_overall,
      }
    : null;

const toOwned = (r: Row, grade: Grade | null): OwnedCard => ({
  id: r.id,
  name: r.card_name,
  setName: r.set_name,
  localId: r.local_id,
  image: r.image_url,
  tier: (TIERS_SET.has(r.tier) ? r.tier : "common") as Tier,
  grade,
});

// Onglet dédié : stats des notes, sélection multiple à grader, cartes gradées
export default async function GradationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("game_cards")
    .select(
      "id, card_name, set_name, local_id, image_url, tier, graded, grade_centering, grade_corners, grade_edges, grade_surface, grade_overall"
    )
    .order("obtained_at", { ascending: false })
    .range(0, 4999);
  const all = (rows ?? []) as Row[];

  const ungraded: OwnedCard[] = [];
  const graded: OwnedCard[] = [];
  const overalls: number[] = [];
  for (const r of all) {
    const g = toGrade(r);
    if (g) {
      graded.push(toOwned(r, g));
      overalls.push(g.overall);
    } else if (r.grade_overall != null) {
      ungraded.push(toOwned(r, null));
    }
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">Gradation</h1>
            <p className="text-sm text-muted">
              Coche des cartes et lance la gradation : 4 sous-notes, une note globale, et la carte
              passe sous boîtier.
            </p>
          </div>
          <GameNav current="gradation" />
        </div>

        <GradeStats overalls={overalls} />

        <section className="mb-8">
          <h2 className="display mb-3 text-lg font-semibold">
            À grader{" "}
            {ungraded.length > 0 && <span className="num text-sm font-normal text-muted">{ungraded.length}</span>}
          </h2>
          <GradingLab cards={ungraded} gradedCount={graded.length} />
        </section>

        {graded.length > 0 && (
          <section>
            <h2 className="display mb-3 text-lg font-semibold">
              Cartes gradées <span className="num text-sm font-normal text-muted">{graded.length}</span>
            </h2>
            <GameCardsGrid cards={graded} initialSort="grade" hideGradedFilter />
          </section>
        )}
      </main>
    </AppShell>
  );
}
