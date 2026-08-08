import { redirect } from "next/navigation";
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
  const series = await fetchSeriesWithSets(lang);

  return (
    <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Ajouter une carte
        </h1>
        <p className="mb-6 text-sm text-muted">
          Cherche une carte par son nom, ou feuillette les extensions
          ci-dessous — internationales et japonaises.
        </p>
        <SearchClient series={series} lang={lang} />
      </main>
    </AppShell>
  );
}
