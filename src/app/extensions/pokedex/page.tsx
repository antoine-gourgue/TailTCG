import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { loadPokedex } from "@/lib/pokedex-server";
import { pokedexIdOf, POKEDEX_PREFIX } from "@/lib/pokedex";
import { AppShell } from "@/components/app-shell";
import { PokedexGrid } from "@/components/pokedex-grid";

export const metadata = {
  title: "Pokédex — TailTCG",
};

// Le Pokédex national en cartes : à ranger dans les classeurs, jamais dans
// la collection
export default async function PokedexPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [list, { data: binders }, { data: placed }] = await Promise.all([
    loadPokedex(supabase),
    supabase.from("binders").select("id, name").order("name"),
    supabase
      .from("binder_placeholders")
      .select("binder_id, tcgdex_id")
      .like("tcgdex_id", `${POKEDEX_PREFIX}%`),
  ]);
  const inBinders: Record<number, string[]> = {};
  for (const p of placed ?? []) {
    const n = pokedexIdOf(p.tcgdex_id);
    if (n != null && !inBinders[n]?.includes(p.binder_id)) (inBinders[n] ??= []).push(p.binder_id);
  }

  return (
    <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/recherche"
              aria-label="Retour au catalogue"
              title="Catalogue"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
            >
              <ChevronLeft size={16} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="display text-3xl font-bold tracking-tight">Pokédex</h1>
              <p className="text-sm text-muted">
                <span className="num">{list.length}</span> Pokémon en cartes, à ranger dans tes
                classeurs — ils n&apos;entrent pas dans ta collection.
              </p>
            </div>
          </div>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted">Pokédex indisponible pour le moment.</p>
        ) : (
          <PokedexGrid list={list} binders={binders ?? []} inBinders={inBinders} />
        )}
      </main>
    </AppShell>
  );
}
