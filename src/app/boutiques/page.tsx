import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ShopsClient, type SourceWithStats } from "@/components/shops-client";

export const metadata = {
  title: "Boutiques — Pokédex Collection",
};

export default async function BoutiquesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: sources }, { data: items }] = await Promise.all([
    supabase
      .from("sources")
      .select("id, name, kind, url, address, city, lat, lng, notes")
      .order("name"),
    supabase.from("items").select("source_id, quantity, purchase_price"),
  ]);

  // Stats par source : nombre de cartes achetées là, total dépensé
  const stats = new Map<string, { cards: number; spent: number }>();
  for (const item of items ?? []) {
    if (!item.source_id) continue;
    const s = stats.get(item.source_id) ?? { cards: 0, spent: 0 };
    s.cards += item.quantity;
    if (item.purchase_price != null) s.spent += item.purchase_price * item.quantity;
    stats.set(item.source_id, s);
  }

  const withStats: SourceWithStats[] = (sources ?? []).map((s) => ({
    ...s,
    kind: s.kind as "shop" | "web",
    cards: stats.get(s.id)?.cards ?? 0,
    spent: stats.get(s.id)?.spent ?? 0,
  }));

  return (
    <>
      <AppShell>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 display text-3xl font-bold tracking-tight">
          Boutiques &amp; sites
        </h1>
        <ShopsClient sources={withStats} />
      </main>
      </AppShell>
    </>
  );
}
