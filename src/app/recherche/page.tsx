import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fetchSeriesWithSets, type CatalogLang } from "@/lib/tcgdex";
import { AppShell } from "@/components/app-shell";
import { SearchClient } from "./search-client";

export const metadata = {
  title: "Ajouter — TailTCG",
};

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { lang: langParam } = await searchParams;
  const lang: CatalogLang = langParam === "ja" ? "ja" : "fr";

  const [series, { count: customCount }, { count: pokedexCount }] = await Promise.all([
    fetchSeriesWithSets(lang),
    supabase
      .from("custom_cards")
      .select("id", { count: "exact", head: true }),
    supabase.from("pokedex").select("id", { count: "exact", head: true }),
  ]);

  return (
    <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">
              Ajouter une carte
            </h1>
            <p className="text-sm text-muted">
              Cherche une carte par son nom ou son numéro, ou feuillette les
              extensions ci-dessous.
            </p>
          </div>
          <Link href="/ajouter/manuel" className="btn btn-ghost shrink-0">
            <FilePlus size={15} aria-hidden />
            Ajouter hors catalogue
          </Link>
        </div>
        <SearchClient
          series={series}
          lang={lang}
          customCount={customCount ?? 0}
          pokedexCount={pokedexCount ?? 0}
        />
      </main>
    </AppShell>
  );
}
