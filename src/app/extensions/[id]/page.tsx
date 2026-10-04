import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CatalogLang } from "@/lib/tcgdex";
import { catalogSet } from "@/lib/catalog";
import { MERGED_CHILDREN, MERGED_INTO } from "@/lib/set-merge";
import { AppShell } from "@/components/app-shell";
import { SetView } from "@/components/set-view";
import { fetchGuidePrices } from "@/lib/cardmarket";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { BinderFromSetButton } from "@/components/binder-from-set-button";

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
  // Set présenté au sein d'un autre (Collection Classique → 30ᵉ Anniversaire)
  if (MERGED_INTO[id]) redirect(`/extensions/${MERGED_INTO[id]}${langParam === "ja" ? "?lang=ja" : ""}`);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const set = await catalogSet(id, lang);
  if (!set) notFound();

  const [{ data: wishes }, { data: owned }, guidePrices] = await Promise.all([
    // Cartes déjà dans les recherchées (pour l'étoile de la fiche express)
    supabase.from("wishlist").select("tcgdex_id"),
    // Exemplaires possédés de ce set et des sets fusionnés dedans (actifs, non vendus)
    supabase
      .from("collection_value")
      .select("tcgdex_id, quantity, sold_at, current_price, purchase_price")
      .in("set_id", [id, ...(MERGED_CHILDREN[id] ?? [])]),
    // Prix Cardmarket : guide local d'abord (par idProduct), repli TCGdex
    fetchGuidePrices(set.cards.map((c) => overrideCardmarketId(c.id, c.cmId))),
  ]);

  const ownedQty: Record<string, number> = {};
  let myValue = 0;
  let myPaid = 0;
  let myCount = 0;
  for (const o of owned ?? []) {
    if (o.sold_at != null || !o.tcgdex_id) continue;
    const q = o.quantity ?? 1;
    ownedQty[o.tcgdex_id] = (ownedQty[o.tcgdex_id] ?? 0) + q;
    myCount += q;
    if (o.current_price != null) myValue += o.current_price * q;
    if (o.purchase_price != null) myPaid += o.purchase_price * q;
  }

  const releaseDate = set.releaseDate
    ? new Date(set.releaseDate).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    : null;

  return (
    <AppShell>
      <main className="page py-8">
        <SetView
          set={{
            id: set.id,
            name: set.name,
            logo: set.logo ?? null,
            symbol: set.symbol ?? null,
            serie: set.serie?.name ?? null,
            releaseDate,
            official: set.cardCount?.official ?? null,
            total: set.cardCount?.total ?? set.cards.length,
            scansMissing: Boolean(set.scansMissing),
          }}
          cards={set.cards.map((c) => {
            const cmId = overrideCardmarketId(c.id, c.cmId);
            return {
              id: c.id,
              localId: c.localId,
              name: c.name,
              image: c.image ?? null,
              rarity: c.rarity ?? null,
              price: (cmId != null ? guidePrices.get(cmId) : undefined) ?? c.price ?? null,
              cmId,
              lang: c.lang,
            };
          })}
          lang={lang}
          wishedIds={(wishes ?? []).map((w) => w.tcgdex_id)}
          ownedQty={ownedQty}
          mine={{ value: myValue, paid: myPaid, count: myCount }}
          binderButton={<BinderFromSetButton setId={set.id} lang={lang} />}
        />
      </main>
    </AppShell>
  );
}
