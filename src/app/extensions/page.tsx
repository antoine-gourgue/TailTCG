import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchSeriesWithSets, type CatalogLang } from "@/lib/tcgdex";
import { AppShell } from "@/components/app-shell";
import { ExtensionsBrowser } from "@/components/extensions-browser";

export const metadata = {
  title: "Extensions — TailTCG",
};

export default async function ExtensionsPage({
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
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Extensions
        </h1>
        <p className="mb-6 text-sm text-muted">
          Feuillette les séries et ouvre une extension pour voir toutes ses
          cartes.
        </p>
        <ExtensionsBrowser series={series} lang={lang} />
      </main>
    </AppShell>
  );
}
