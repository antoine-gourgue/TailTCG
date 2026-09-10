import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type Tier } from "@/lib/game";
import { AppShell } from "@/components/app-shell";
import { GameNav } from "@/components/game/game-nav";
import { GradingLab } from "@/components/game/grading-lab";
import type { OwnedCard } from "@/components/game/game-cards-grid";

export const metadata = {
  title: "Gradation — TailTCG",
};

const TIERS_SET = new Set(["common", "uncommon", "rare", "holo", "ultra", "secret"]);

// Onglet dédié : sélectionner plusieurs cartes non gradées et les faire grader
export default async function GradationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("game_cards")
    .select("id, card_name, set_name, local_id, image_url, tier, graded, grade_overall")
    .order("obtained_at", { ascending: false })
    .range(0, 4999);
  const all = rows ?? [];
  const gradedCount = all.filter((r) => r.graded).length;
  const ungraded: OwnedCard[] = all
    .filter((r) => !r.graded && r.grade_overall != null)
    .map((r) => ({
      id: r.id,
      name: r.card_name,
      setName: r.set_name,
      localId: r.local_id,
      image: r.image_url,
      tier: (TIERS_SET.has(r.tier) ? r.tier : "common") as Tier,
      grade: null,
    }));

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">Gradation</h1>
            <p className="text-sm text-muted">
              Coche les cartes à faire grader, puis lance la gradation. Chaque carte reçoit ses
              4 sous-notes et une note globale, puis passe sous boîtier.
            </p>
          </div>
          <GameNav current="gradation" />
        </div>
        <GradingLab cards={ungraded} gradedCount={gradedCount} />
      </main>
    </AppShell>
  );
}
