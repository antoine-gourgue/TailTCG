import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchPlayableSets } from "@/lib/game-sets";
import { MAX_STOCK, nowMs, UNLIMITED_BOOSTERS, type Profile } from "@/lib/game";
import { GameNav } from "@/components/game/game-nav";
import { PageHead } from "@/components/page-head";
import { BoosterOpener } from "@/components/game/booster-opener";

export const metadata = {
  title: "Boosters — TailTCG",
};

/** Sets mis en avant : les plus récents */
const FEATURED = 8;

// Le jeu : réserve de boosters, choix d'un set, ouverture. Sans lien avec la
// collection réelle.
export default async function BoostersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const admin = createAdminClient();
  const [{ data: prof }, sets] = await Promise.all([
    admin
      .from("game_profiles")
      .select("boosters, refill_at")
      .eq("owner_id", user.id)
      .maybeSingle(),
    fetchPlayableSets(),
  ]);
  let profile: Profile;
  if (prof) {
    profile = prof;
  } else {
    // Premier passage : la réserve est pleine
    profile = { boosters: MAX_STOCK, refill_at: new Date(nowMs()).toISOString() };
    await admin.from("game_profiles").insert({ owner_id: user.id, ...profile });
  }

  return (
    <main className="relative z-10 page py-8">
      <PageHead
        kicker="Explorer"
        title="Boosters"
        sub={`${UNLIMITED_BOOSTERS ? "Ouvre autant de boosters que tu veux. " : "Un booster toutes les 12 heures. "}5 cartes du set de ton choix, un jeu à part : rien n'entre dans ta vraie collection.`}
      >
        <GameNav current="boosters" />
      </PageHead>
      <BoosterOpener
        profile={profile}
        featured={sets.slice(0, FEATURED)}
        sets={sets}
        serverNow={nowMs()}
      />
    </main>
  );
}
