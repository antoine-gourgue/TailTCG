import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSet, type CatalogLang } from "@/lib/tcgdex";
import { AppShell } from "@/components/app-shell";
import { SetCardsGrid } from "@/components/set-cards-grid";

export const metadata = {
  title: "Extension — TailTCG",
};

export default async function ExtensionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string }>;
}) {
  const [{ id }, { lang: langParam }] = await Promise.all([params, searchParams]);
  const lang: CatalogLang = langParam === "ja" ? "ja" : "fr";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const set = await getSet(id, lang);
  if (!set) notFound();

  const releaseDate = set.releaseDate
    ? new Date(set.releaseDate).toLocaleDateString("fr-FR", {
        month: "long",
        year: "numeric",
      })
    : null;

  const langSuffix = lang === "ja" ? "&lang=ja" : "";

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Link
          href={`/recherche${lang === "ja" ? "?lang=ja" : ""}`}
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
        >
          ← Extensions
        </Link>

        <div className="mb-8 flex flex-wrap items-center gap-6">
          {set.logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`${set.logo}.webp`}
              alt=""
              className="h-16 object-contain"
            />
          )}
          <div>
            <h1 className="display text-3xl font-bold tracking-tight">
              {set.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              <span className="num rounded bg-raised px-1.5 py-0.5 uppercase">
                {set.id}
              </span>
              {set.serie?.name && <span>{set.serie.name}</span>}
              {set.cardCount?.official ? (
                <span className="num">{set.cardCount.official} cartes</span>
              ) : null}
              {releaseDate && <span>{releaseDate}</span>}
            </p>
          </div>
        </div>

        {lang === "ja" && (
          <p className="mb-6 rounded-xl border border-edge bg-surface px-4 py-3 text-sm text-muted">
            TCGdex ne fournit pas encore les scans japonais — les cartes sont
            listées par nom et numéro, et restent ajoutables normalement.
          </p>
        )}

        <SetCardsGrid
          cards={set.cards.map((c) => ({
            id: c.id,
            localId: c.localId,
            name: c.name,
            image: c.image ?? null,
            rarity: c.rarity ?? null,
          }))}
          officialCount={set.cardCount?.official ?? null}
          langSuffix={langSuffix}
        />
      </main>
    </AppShell>
  );
}
