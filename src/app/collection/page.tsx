import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { ShareButton } from "@/components/share-button";
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
  if (!user) redirect("/connexion");

  const [cards, sealed, { data: settings }] = await Promise.all([
    loadCardStats(supabase, user.id),
    loadSealedStats(supabase, user.id),
    supabase.from("user_settings").select("share_token, share_show_values").eq("owner_id", user.id).maybeSingle(),
  ]);
  const empty = cards.count === 0 && sealed.count === 0;

  return (
    <AppShell>
      <main className="page py-8">
        <PageHead
          kicker="Tableau de bord"
          title="Collection"
          sub={empty ? "Ta collection en chiffres, dès tes premières cartes." : `${plural(cards.count, "carte")} · ${plural(sealed.count, "scellé")} · ${plural(cards.sets.length, "set")}`}
        >
          <ShareButton initialToken={settings?.share_token ?? null} initialShowValues={settings?.share_show_values ?? false} />
        </PageHead>

        {empty ? (
          <div className="panel flex flex-col items-center gap-3 p-12 text-center">
            <Sparkles size={26} strokeWidth={1.6} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Rien à mesurer pour l&apos;instant</p>
            <p className="max-w-md text-sm text-muted">Ajoute tes premières cartes ou tes premiers scellés : valeur, plus-values et progression apparaîtront ici.</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              <Link href="/catalogue" className="btn btn-primary">
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
