import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCard } from "@/lib/tcgdex";
import { CardImage } from "@/components/card-image";
import { AppShell } from "@/components/app-shell";
import { ItemForm } from "@/components/item-form";
import type { SourceOption } from "@/app/items/actions";

export const metadata = {
  title: "Ajouter — TailTCG",
};

export default async function AjouterPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string; lang?: string }>;
}) {
  const { card: cardId, lang: langParam } = await searchParams;
  if (!cardId) redirect("/recherche");

  const lang = langParam === "ja" ? ("ja" as const) : ("fr" as const);
  const card = await getCard(cardId, lang);
  if (!card) redirect("/recherche");

  const supabase = await createClient();
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, kind, city, url")
    .order("name");

  // Pré-sélection du type d'après les variantes du set
  const defaultType =
    card.variants?.holo && !card.variants?.normal ? "Holo" : null;

  return (
    <>
      <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="display mb-6 text-3xl font-bold tracking-tight">
          Ajouter une carte
        </h1>

        <div className="flex flex-col gap-8 md:flex-row">
          {/* La carte choisie, pré-remplie depuis TCGdex */}
          <aside className="w-full max-w-60 shrink-0 md:sticky md:top-20 md:self-start">
            <div className="card-tile aspect-[63/88]">
              <CardImage base={card.image ?? null} alt={card.name} />
            </div>
            <div className="mt-4">
              <p className="display text-lg font-semibold leading-tight">{card.name}</p>
              <p className="mt-1 text-sm text-muted">
                {card.set.name} <span className="num text-faint">· {card.localId}</span>
                {card.set.cardCount?.official ? (
                  <span className="num text-faint"> / {card.set.cardCount.official}</span>
                ) : null}
              </p>
              {card.rarity && (
                <p className="mt-2 inline-block rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                  {card.rarity}
                </p>
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <ItemForm
              mode="create"
              card={{
                tcgdexId: card.id,
                name: card.name,
                setId: card.set.id,
                setName: card.set.name,
                localId: card.localId,
                imageBase: card.image ?? "",
              }}
              defaults={{
                card_type: defaultType,
                language: lang === "ja" ? "JP" : "FR",
                condition: null,
                quantity: 1,
                purchase_price: null,
                manual_price: null,
                purchase_date: null,
                source_id: null,
                cardmarket_url: null,
                graded: false,
                grade: null,
                notes: null,
              }}
              sources={(sources ?? []) as SourceOption[]}
            />
          </div>
        </div>
      </main>
      </AppShell>
    </>
  );
}
