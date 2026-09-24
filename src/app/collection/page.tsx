import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { StatsView, plural } from "@/components/stats-view";
import { loadCardStats, loadSealedStats } from "@/lib/stats-data";

export const metadata = {
  title: "Collection — TailTCG",
};

// Tableau de bord de la collection : cartes et scellés, valeur, achats,
// progression, répartitions et classements.
export default async function CollectionPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cards, sealed] = await Promise.all([loadCardStats(supabase, user.id), loadSealedStats(supabase, user.id)]);
  const empty = cards.count === 0 && sealed.count === 0;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <h1 className="display mb-1 text-3xl font-bold tracking-tight">Collection</h1>
          <p className="text-sm text-muted">
            {empty
              ? "Ta collection en chiffres, dès tes premières cartes."
              : `${plural(cards.count, "carte")} · ${plural(sealed.count, "scellé")} · ${plural(cards.sets.length, "set")}`}
          </p>
        </div>

        {empty ? (
          <div className="panel flex flex-col items-center gap-3 p-12 text-center">
            <Sparkles size={26} strokeWidth={1.6} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Rien à mesurer pour l&apos;instant</p>
            <p className="max-w-md text-sm text-muted">Ajoute tes premières cartes ou tes premiers scellés : valeur, plus-values et progression apparaîtront ici.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Link href="/recherche" className="btn btn-primary">
                Ajouter une carte
              </Link>
              <Link href="/scelles/ajouter" className="btn btn-ghost">
                Ajouter un scellé
              </Link>
            </div>
          </div>
        ) : (
          <StatsView d={cards} s={sealed} />
        )}
      </main>
    </AppShell>
  );
}
