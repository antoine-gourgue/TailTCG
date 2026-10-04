import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SourceKind } from "@/lib/domain";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { NewSourceButton, ShopsClient, type SourceWithStats } from "@/components/shops-client";

export const metadata = {
  title: "Boutiques — TailTCG",
};

export default async function BoutiquesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const [{ data: sources }, { data: items }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, name, kind, url, address, city, lat, lng, notes")
      .order("name"),
    supabase
      .from("collection_value")
      .select("id, source_id, quantity, purchase_price, purchase_date, created_at, card_name, image_url"),
  ]);

  // Stats par source : cartes achetées là, total dépensé, dernier achat, dernières cartes
  type Acc = { cards: number; spent: number; priced: number; lastAt: string | null; recent: { id: string; name: string; image: string | null; at: string }[] };
  const stats = new Map<string, Acc>();
  for (const item of items ?? []) {
    if (!item.source_id || !item.id) continue;
    const s = stats.get(item.source_id) ?? { cards: 0, spent: 0, priced: 0, lastAt: null, recent: [] };
    const qty = item.quantity ?? 1;
    s.cards += qty;
    if (item.purchase_price != null) {
      s.spent += item.purchase_price * qty;
      s.priced += qty;
    }
    const at = item.purchase_date ?? item.created_at?.slice(0, 10) ?? null;
    if (at && (!s.lastAt || at > s.lastAt)) s.lastAt = at;
    s.recent.push({ id: item.id, name: item.card_name ?? "", image: item.image_url, at: at ?? "" });
    stats.set(item.source_id, s);
  }

  const withStats: SourceWithStats[] = (sources ?? []).map((s) => {
    const a = stats.get(s.id);
    return {
      ...s,
      kind: s.kind as SourceKind,
      cards: a?.cards ?? 0,
      spent: a?.spent ?? 0,
      pricedCards: a?.priced ?? 0,
      lastAt: a?.lastAt ?? null,
      recent: (a?.recent ?? []).sort((x, y) => y.at.localeCompare(x.at)).slice(0, 4).map(({ id, name, image }) => ({ id, name, image })),
    };
  });

  return (
    <AppShell>
      <main className="page py-8">
        <PageHead kicker="Explorer" title="Boutiques & sites" count={withStats.length || null} sub="Où tu achètes, combien tu y as dépensé, et ce que tu y as trouvé.">
          <NewSourceButton />
        </PageHead>
        <ShopsClient sources={withStats} />
      </main>
    </AppShell>
  );
}
