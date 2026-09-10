import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSeriesWithSets } from "@/lib/tcgdex";
import { MAX_STOCK, nowMs, type Profile } from "@/lib/game";
import { AppShell } from "@/components/app-shell";
import { GameNav } from "@/components/game/game-nav";
import { BoosterOpener, type SetOption } from "@/components/game/booster-opener";

export const metadata = {
  title: "Boosters — TailTCG",
};

/** Sets mis en avant : les plus récents, assez fournis pour un tirage varié */
const FEATURED = 8;
const MIN_CARDS = 40;

// Le jeu : réserve de boosters, choix d'un set, ouverture. Sans lien avec la
// collection réelle.
export default async function BoostersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();
  const [{ data: prof }, series] = await Promise.all([
    admin
      .from("game_profiles")
      .select("boosters, refill_at")
      .eq("owner_id", user.id)
      .maybeSingle(),
    fetchSeriesWithSets("fr").catch(() => []),
  ]);
  let profile: Profile;
  if (prof) {
    profile = prof;
  } else {
    // Premier passage : la réserve est pleine
    profile = { boosters: MAX_STOCK, refill_at: new Date(nowMs()).toISOString() };
    await admin.from("game_profiles").insert({ owner_id: user.id, ...profile });
  }

  const toOption = (serie: string) => (x: (typeof series)[number]["sets"][number]): SetOption => ({
    id: x.id,
    name: x.name,
    serie,
    logo: x.logo ?? null,
    total: x.cardCount?.total ?? x.cardCount?.official ?? 0,
  });
  const sets: SetOption[] = series.flatMap((s) => s.sets.map(toOption(s.name)));
  // À la une : les séries arrivent de la plus récente à la plus ancienne, et
  // les sets d'une série dans l'ordre de sortie → on les parcourt à l'envers
  const featured = series
    .flatMap((s) => [...s.sets].reverse().map(toOption(s.name)))
    .filter((s) => s.total >= MIN_CARDS && !/promo/i.test(s.name))
    .slice(0, FEATURED);

  return (
    <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">Boosters</h1>
            <p className="text-sm text-muted">
              Un booster toutes les 12 heures, 5 cartes du set de ton choix. Un jeu à part :
              rien n&apos;entre dans ta vraie collection.
            </p>
          </div>
          <GameNav current="boosters" />
        </div>
        <BoosterOpener profile={profile} featured={featured} sets={sets} serverNow={nowMs()} />
      </main>
    </AppShell>
  );
}
