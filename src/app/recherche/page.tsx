import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchSeriesWithSets, type CatalogLang } from "@/lib/tcgdex";
import { AppShell } from "@/components/app-shell";
import { SearchClient, type CustomCardTile } from "./search-client";

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

  const [series, { data: customs }] = await Promise.all([
    fetchSeriesWithSets(lang),
    supabase
      .from("custom_cards")
      .select("id, name, set_name, local_id, image_path")
      .order("created_at", { ascending: false }),
  ]);

  // Visuels des cartes hors catalogue (bucket privé → URLs signées)
  let customCards: CustomCardTile[] = [];
  if (customs && customs.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("card-photos")
      .createSignedUrls(
        customs.map((c) => c.image_path),
        3600
      );
    customCards = customs.map((c, i) => ({
      id: c.id,
      name: c.name,
      setName: c.set_name,
      localId: c.local_id,
      image: signed?.[i]?.signedUrl ?? null,
    }));
  }

  return (
    <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Ajouter une carte
        </h1>
        <p className="mb-6 text-sm text-muted">
          Cherche une carte par son nom ou son numéro, feuillette les
          extensions ci-dessous — ou{" "}
          <a
            href="/ajouter/manuel"
            className="text-accent underline-offset-2 hover:underline"
          >
            ajoute une carte hors catalogue
          </a>
          .
        </p>
        <SearchClient series={series} lang={lang} customCards={customCards} />
      </main>
    </AppShell>
  );
}
