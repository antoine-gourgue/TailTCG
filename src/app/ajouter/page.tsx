import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCard } from "@/lib/tcgdex";
import { CardImage } from "@/components/card-image";
import { AppShell } from "@/components/app-shell";
import { ItemForm, type CardMeta } from "@/components/item-form";
import { WishlistButton } from "@/components/wishlist-button";
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

  const supabase = await createClient();
  const lang = langParam === "ja" ? ("ja" as const) : ("fr" as const);

  let meta: CardMeta;
  let previewImage: string | null = null;
  let subtitle = "";
  let rarity: string | null = null;
  let defaultType: string | null = null;
  let defaultLanguage = lang === "ja" ? "JP" : "FR";

  if (cardId.startsWith("custom:")) {
    // Carte du catalogue perso (hors TCGdex)
    const { data: cc } = await supabase
      .from("custom_cards")
      .select("id, name, set_name, local_id, image_path")
      .eq("id", cardId.slice("custom:".length))
      .single();
    if (!cc) redirect("/recherche");

    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("card-photos")
      .createSignedUrl(cc.image_path, 3600);
    previewImage = signed?.signedUrl ?? null;

    meta = {
      tcgdexId: `custom:${cc.id}`,
      name: cc.name,
      setId: "custom",
      setName: cc.set_name,
      localId: cc.local_id,
      imageBase: `storage:${cc.image_path}`,
    };
    subtitle = `${cc.set_name} · ${cc.local_id}`;
    rarity = "Hors catalogue";
    defaultLanguage = "JP";
  } else {
    const card = await getCard(cardId, lang);
    if (!card) redirect("/recherche");

    meta = {
      tcgdexId: card.id,
      name: card.name,
      setId: card.set.id,
      setName: card.set.name,
      localId: card.localId,
      imageBase: card.image ?? "",
    };
    previewImage = card.image ? `${card.image}/low.webp` : null;
    subtitle = `${card.set.name} · ${card.localId}${
      card.set.cardCount?.official ? ` / ${card.set.cardCount.official}` : ""
    }`;
    rarity = card.rarity ?? null;
    // Pré-sélection du type d'après les variantes du set
    defaultType = card.variants?.holo && !card.variants?.normal ? "Holo" : null;
  }

  const [{ data: sources }, { data: wish }] = await Promise.all([
    supabase.from("sources").select("id, name, kind, city, url").order("name"),
    supabase
      .from("wishlist")
      .select("id")
      .eq("tcgdex_id", meta.tcgdexId)
      .maybeSingle(),
  ]);

  return (
    <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="display mb-6 text-3xl font-bold tracking-tight">
          Ajouter une carte
        </h1>

        <div className="flex flex-col gap-8 md:flex-row">
          {/* La carte choisie */}
          <aside className="w-full max-w-60 shrink-0 md:sticky md:top-20 md:self-start">
            <div className="card-tile aspect-[63/88]">
              <CardImage base={previewImage} alt={meta.name} direct />
            </div>
            <div className="mt-4">
              <p className="display text-lg font-semibold leading-tight">
                {meta.name}
              </p>
              <p className="mt-1 text-sm text-muted">{subtitle}</p>
              {rarity && (
                <p className="mt-2 inline-block rounded-md bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-strong">
                  {rarity}
                </p>
              )}
              <div className="mt-4">
                <WishlistButton card={meta} initialWished={Boolean(wish)} />
              </div>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <ItemForm
              mode="create"
              card={meta}
              defaults={{
                card_type: defaultType,
                language: defaultLanguage,
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
  );
}
