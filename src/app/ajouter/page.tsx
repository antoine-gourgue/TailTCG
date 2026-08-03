import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCard, cardImageUrl, cardmarketSearchUrl } from "@/lib/tcgdex";
import { formatEur } from "@/lib/domain";
import { SiteHeader } from "@/components/site-header";
import { ItemForm } from "@/components/item-form";
import type { SourceOption } from "@/app/items/actions";

export const metadata = {
  title: "Ajouter — Pokédex Collection",
};

export default async function AjouterPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string }>;
}) {
  const { card: cardId } = await searchParams;
  if (!cardId) redirect("/recherche");

  const card = await getCard(cardId);
  if (!card) redirect("/recherche");

  const supabase = await createClient();
  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, kind, city, url")
    .order("name");

  const cm = card.pricing?.cardmarket;
  const trend = cm?.trend ?? null;
  const trendHolo = cm?.["trend-holo"] ?? null;

  // Pré-sélection du type d'après les variantes du set
  const defaultType =
    card.variants?.holo && !card.variants?.normal ? "Holo" : null;

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Ajouter une carte
        </h1>

        <div className="flex flex-col gap-8 md:flex-row">
          {/* La carte choisie, pré-remplie depuis TCGdex */}
          <aside className="w-full max-w-60 shrink-0">
            <div className="card-tile aspect-[63/88] bg-surface">
              {card.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cardImageUrl(card.image, "low", "webp")}
                  alt={card.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted">
                  🃏
                </div>
              )}
            </div>
            <div className="mt-3">
              <p className="font-medium">{card.name}</p>
              <p className="text-sm text-muted">
                {card.set.name} <span className="num">· {card.localId}</span>
                {card.set.cardCount?.official ? (
                  <span className="num"> / {card.set.cardCount.official}</span>
                ) : null}
              </p>
              {card.rarity && (
                <p className="mt-1 text-xs text-muted">{card.rarity}</p>
              )}
              <div className="mt-3 rounded-lg border border-edge p-3 text-sm">
                <p className="mb-1 text-xs uppercase tracking-wide text-muted">
                  Cote Cardmarket du jour
                </p>
                <p>
                  Tendance : <span className="num">{formatEur(trend)}</span>
                </p>
                {trendHolo != null && (
                  <p>
                    Tendance holo :{" "}
                    <span className="num">{formatEur(trendHolo)}</span>
                  </p>
                )}
                {cm?.avg30 != null && (
                  <p className="text-muted">
                    Moy. 30 j : <span className="num">{formatEur(cm.avg30)}</span>
                  </p>
                )}
                {!cm && (
                  <p className="text-muted">Carte non cotée sur Cardmarket.</p>
                )}
              </div>
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
                language: "FR",
                condition: null,
                quantity: 1,
                purchase_price: null,
                manual_price: null,
                purchase_date: null,
                source_id: null,
                cardmarket_url: cardmarketSearchUrl(card.name),
                graded: false,
                grade: null,
                notes: null,
              }}
              sources={(sources ?? []) as SourceOption[]}
            />
          </div>
        </div>
      </main>
    </>
  );
}
