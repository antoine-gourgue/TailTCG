import { redirect } from "next/navigation";
import Link from "next/link";
import { Smartphone } from "lucide-react";
import { skipScanAndNext } from "@/app/scan/actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardmarketUrl } from "@/lib/tcgdex";
import { catalogCard } from "@/lib/catalog";
import { ITEM_LANGUAGE, isScanLang } from "@/lib/scan/url";
import { resolveCardmarketPrice } from "@/lib/cardmarket";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { CardSpotlight } from "@/components/card-spotlight";
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
  searchParams: Promise<{ card?: string; lang?: string; scan?: string }>;
}) {
  const { card: cardId, lang: langParam, scan: scanParam } = await searchParams;
  if (!cardId) redirect("/recherche");

  const supabase = await createClient();

  // Carte scannée depuis le téléphone : position dans la pile, et
  // l'enregistrement enchaîne sur la suivante
  let scanCtx: { id: string; sessionId: string; position: number; total: number } | null = null;
  if (scanParam) {
    const { data: scan } = await supabase
      .from("capture_scans")
      .select("id, session_id")
      .eq("id", scanParam)
      .maybeSingle();
    if (scan) {
      const { data: all } = await supabase
        .from("capture_scans")
        .select("id, status")
        .eq("session_id", scan.session_id)
        .order("created_at");
      const list = all ?? [];
      scanCtx = {
        id: scan.id,
        sessionId: scan.session_id,
        position: list.filter((s) => s.status !== "pending").length + 1,
        total: list.length,
      };
    }
  }
  // Langue du catalogue : ja depuis les extensions japonaises, n'importe
  // laquelle depuis le scan (la carte est montrée telle que scannée)
  const lang = isScanLang(langParam) ? langParam : "fr";

  let meta: CardMeta;
  let previewImage: string | null = null;
  let total: number | null = null;
  let kicker: string | null = null;
  let rarity: string | null = null;
  let defaultType: string | null = null;
  let defaultLanguage: string = ITEM_LANGUAGE[lang];
  let price: number | null = null;
  let cmId: number | null = null;

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
    kicker = "Carte hors catalogue";
    defaultLanguage = "JP";
  } else {
    // Carte rangée dans un classeur depuis le catalogue japonais : son
    // identifiant n'existe pas en FR, on la cherche alors côté JA
    let card = await catalogCard(cardId, lang);
    let cardLang = lang;
    if (!card && lang === "fr") {
      card = await catalogCard(cardId, "ja");
      if (card) cardLang = "ja";
    }
    if (!card) redirect("/recherche");
    defaultLanguage = ITEM_LANGUAGE[cardLang];

    meta = {
      tcgdexId: card.id,
      name: card.name,
      setId: card.set.id,
      setName: card.set.name,
      localId: card.localId,
      imageBase: card.image ?? "",
    };
    previewImage = card.image ? `${card.image}/low.webp` : null;
    total = card.set.cardCount?.official ?? null;
    rarity = card.rarity ?? null;
    cmId = overrideCardmarketId(card.id, card.pricing?.cardmarket?.idProduct);
    price = await resolveCardmarketPrice(cmId, card.pricing?.cardmarket);
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
      <main className="relative z-10 page py-8">
        <h1 className="display mb-6 text-3xl font-bold tracking-tight">
          Ajouter une carte
        </h1>

        {scanCtx && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge bg-raised/60 px-4 py-3">
            <p className="flex items-center gap-2 text-sm">
              <Smartphone size={15} className="text-accent-strong" aria-hidden />
              Scan téléphone ·{" "}
              <span className="num font-semibold">
                carte {scanCtx.position} sur {scanCtx.total}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <form action={skipScanAndNext.bind(null, scanCtx.id)}>
                <button type="submit" className="btn btn-ghost !py-1.5 text-xs">
                  Passer cette carte
                </button>
              </form>
              <Link href={`/scan/${scanCtx.sessionId}`} className="btn btn-ghost !py-1.5 text-xs">
                Toutes les cartes scannées
              </Link>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-8 md:flex-row">
          {/* La carte choisie */}
          <aside className="w-full max-w-60 shrink-0 md:sticky md:top-20 md:self-start">
            <CardSpotlight
              layout="stack"
              kicker={kicker}
              card={{
                name: meta.name,
                image: previewImage,
                direct: true,
                setName: meta.setName,
                localId: meta.localId,
                total,
                rarity: cardId.startsWith("custom:") ? undefined : rarity,
                lang: defaultLanguage !== "FR" ? defaultLanguage : null,
              }}
              price={cardId.startsWith("custom:") ? undefined : price}
              cmUrl={cardId.startsWith("custom:") ? null : cardmarketUrl({ idProduct: cmId, name: meta.name, localId: meta.localId })}
              actions={<WishlistButton card={meta} initialWished={Boolean(wish)} />}
            />
          </aside>

          <div className="min-w-0 flex-1">
            <ItemForm
              mode="create"
              card={meta}
              scanId={scanCtx?.id}
              submitLabel={
                scanCtx
                  ? scanCtx.position < scanCtx.total
                    ? "Ajouter et passer à la suivante"
                    : "Ajouter et terminer"
                  : undefined
              }
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
