import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ExternalLink, Smartphone } from "lucide-react";
import { skipScanAndNext } from "@/app/scanner/actions";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardmarketUrl, pickCardmarket } from "@/lib/tcgdex";
import { catalogCard } from "@/lib/catalog";
import { ITEM_LANGUAGE, isScanLang } from "@/lib/scan/url";
import { japaneseFallbackPrice, resolveCardmarketPrice } from "@/lib/cardmarket";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { CONDITIONS, formatEur } from "@/lib/domain";
import { rarityLabel, raritySymbol } from "@/lib/rarity";
import { AppShell } from "@/components/app-shell";
import { CardImage } from "@/components/card-image";
import { Sparkline } from "@/components/sparkline";
import { ItemForm, type CardMeta } from "@/components/item-form";
import { WishlistButton } from "@/components/recherchees-button";
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
  if (!cardId) redirect("/catalogue");

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
  let kicker = "Ajouter une carte";
  let rarity: string | null = null;
  let defaultType: string | null = null;
  let defaultLanguage: string = ITEM_LANGUAGE[lang];
  let price: number | null = null;
  /** Carte japonaise sans cote Cardmarket : cote TCGplayer japonaise et son lien */
  let jpMarket: { eur: number; url: string } | null = null;
  let cmId: number | null = null;
  let market: { trend: number | null; low: number | null; avg30: number | null } | null = null;
  let illustrator: string | null = null;
  let hp: number | null = null;
  const custom = cardId.startsWith("custom:");

  if (custom) {
    // Carte du catalogue perso (hors TCGdex)
    const { data: cc } = await supabase
      .from("custom_cards")
      .select("id, name, set_name, local_id, image_path")
      .eq("id", cardId.slice("custom:".length))
      .single();
    if (!cc) redirect("/catalogue");

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
    if (!card) redirect("/catalogue");
    defaultLanguage = ITEM_LANGUAGE[cardLang];

    meta = {
      tcgdexId: card.id,
      name: card.name,
      setId: card.set.id,
      setName: card.set.name,
      localId: card.localId,
      imageBase: card.image ?? "",
    };
    // Base TCGdex (sans extension) ou URL finale d'un autre CDN (pokemontcg.io, Limitless)
    previewImage = card.image ? (card.image.includes("assets.tcgdex.net") ? `${card.image}/high.png` : card.image) : null;
    total = card.set.cardCount?.official ?? null;
    rarity = card.rarity ?? null;
    illustrator = card.illustrator ?? null;
    hp = card.hp ?? null;
    cmId = overrideCardmarketId(card.id, card.pricing?.cardmarket?.idProduct);
    price = await resolveCardmarketPrice(cmId, card.pricing?.cardmarket);
    if (price == null && cardLang === "ja") {
      jpMarket = await japaneseFallbackPrice(card.id);
      price = jpMarket?.eur ?? null;
    }
    // Seules les valeurs positives ont un sens à l'affichage (0 = absent du guide)
    const picked = pickCardmarket(card.pricing?.cardmarket, card.variants);
    const pos = (v: number | null) => (v != null && v > 0 ? v : null);
    const cleaned = { trend: pos(picked.trend), low: pos(picked.low), avg30: pos(picked.avg30) };
    if (cleaned.trend != null || cleaned.low != null || cleaned.avg30 != null) market = cleaned;
    // Pré-sélection de la variante d'après celles qui existent dans le set
    defaultType = card.variants?.holo && !card.variants?.normal ? "Holo" : "Normale";
  }

  const [{ data: sources }, { data: wish }, { data: owned }, { data: inSet }, { data: snaps }] = await Promise.all([
    supabase.from("sources").select("id, name, kind, city, url").order("name"),
    supabase
      .from("wishlist")
      .select("id")
      .eq("tcgdex_id", meta.tcgdexId)
      .maybeSingle(),
    // Exemplaires déjà possédés de cette même carte
    supabase
      .from("collection_value")
      .select("id, condition, quantity, purchase_price, manual_price, current_price, graded, grade")
      .eq("tcgdex_id", meta.tcgdexId)
      .order("created_at", { ascending: false }),
    // Avancement du set : cartes distinctes possédées
    custom ? Promise.resolve({ data: null }) : supabase.from("collection_value").select("tcgdex_id").eq("set_id", meta.setId),
    // Cote relevée chaque nuit : courbe et variation
    custom
      ? Promise.resolve({ data: null })
      : createAdminClient()
          .from("price_snapshots")
          .select("captured_at, reference")
          .eq("tcgdex_id", meta.tcgdexId)
          .not("reference", "is", null)
          .order("captured_at"),
  ]);

  const ownedList = (owned ?? []).filter((o) => o.id);
  const ownedQty = ownedList.reduce((s, o) => s + (o.quantity ?? 1), 0);
  const setOwned = new Set((inSet ?? []).map((r) => r.tcgdex_id).filter(Boolean)).size;
  const series = (snaps ?? []).map((s) => Number(s.reference)).filter((v) => Number.isFinite(v) && v > 0).slice(-60);
  const marketDelta = series.length > 1 && series[0] > 0 ? ((series[series.length - 1] - series[0]) / series[0]) * 100 : null;
  const sinceDays = snaps && snaps.length > 1 ? Math.round((Date.parse(String(snaps[snaps.length - 1].captured_at)) - Date.parse(String(snaps[Math.max(0, snaps.length - 60)].captured_at))) / 86_400_000) : null;

  const cmUrl = custom ? null : jpMarket ? jpMarket.url : cardmarketUrl({ idProduct: cmId, name: meta.name, localId: meta.localId });
  const symbol = raritySymbol(rarity);
  const condLabel = (code: string | null) => CONDITIONS.find((c) => c.code === code)?.code ?? "état inconnu";

  return (
    <AppShell>
      <main className="relative z-10 page py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link
            href={scanCtx ? `/scanner/${scanCtx.sessionId}` : "/catalogue"}
            className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
          >
            <ChevronLeft size={16} aria-hidden /> {scanCtx ? "Cartes scannées" : "Catalogue"}
          </Link>
          {scanCtx && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent-strong">
                <Smartphone size={13} aria-hidden />
                Scan <span className="num">{scanCtx.position}/{scanCtx.total}</span>
              </span>
              <form action={skipScanAndNext.bind(null, scanCtx.id)}>
                <button type="submit" className="btn btn-ghost !py-1.5 text-xs">
                  Passer cette carte
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-stretch">
          {/* La carte choisie : image sur fond teinté, identité, cote, ce que tu en as déjà.
              Sur desktop la fiche fait exactement la hauteur du formulaire : le visuel
              prend la place qui reste. */}
          <aside className="relative overflow-hidden rounded-[28px] bg-surface ring-1 ring-ring lg:flex lg:flex-col">
            {previewImage && (
              <div className="pointer-events-none absolute inset-0" aria-hidden>
                <CardImage base={previewImage} alt="" direct className="h-full w-full scale-150 object-cover opacity-[0.35] blur-3xl saturate-150" />
                <div className="absolute inset-0 bg-gradient-to-b from-surface/20 via-surface/70 to-surface" />
              </div>
            )}
            <div className="relative flex h-full flex-col p-4 lg:p-5">
              <div className="flex gap-4 lg:min-h-0 lg:flex-1 lg:flex-col">
                {/* Desktop : le visuel est posé dans la place qui reste (position absolue,
                    il ne compte pas dans la hauteur) et s'y ajuste en gardant ses proportions */}
                <div className="w-28 shrink-0 overflow-hidden rounded-xl shadow-xl shadow-black/30 lg:relative lg:min-h-[240px] lg:w-auto lg:flex-1 lg:overflow-visible lg:rounded-none lg:shadow-none">
                  <CardImage base={previewImage} alt={meta.name} direct quality="high" className="aspect-[63/88] h-auto w-full object-cover lg:absolute lg:inset-0 lg:m-auto lg:h-auto lg:w-auto lg:max-h-full lg:max-w-full lg:rounded-2xl lg:shadow-xl lg:shadow-black/30" />
                </div>
                <div className="min-w-0 flex-1 lg:flex-none lg:text-center">
                  <p className="label-xs text-accent-strong">{kicker}</p>
                  <h1 className="display mt-0.5 text-xl font-bold leading-tight lg:text-2xl">{meta.name}</h1>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted lg:justify-center">
                    <span className="truncate">{meta.setName}</span>
                    <span aria-hidden>·</span>
                    <span className="num">
                      {meta.localId}
                      {total ? `/${total}` : ""}
                    </span>
                    {rarity && (
                      <>
                        <span aria-hidden>·</span>
                        <span>
                          {symbol && <span className="mr-0.5 text-accent">{symbol}</span>}
                          {rarityLabel(rarity)}
                        </span>
                      </>
                    )}
                    {defaultLanguage !== "FR" && (
                      <span className="rounded-full bg-raised px-1.5 py-px text-[10px] font-semibold">{defaultLanguage}</span>
                    )}
                  </p>
                  {(illustrator || hp) && (
                    <p className="mt-1 truncate text-[11px] text-faint">
                      {illustrator && <>Illustration {illustrator}</>}
                      {illustrator && hp ? " · " : ""}
                      {hp && <span className="num">{hp} PV</span>}
                    </p>
                  )}
                  <div className="mt-3 lg:flex lg:justify-center">
                    <WishlistButton card={meta} initialWished={Boolean(wish)} />
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2.5">
                {!custom && (
                  <div className="rounded-2xl bg-background/60 px-3.5 py-3 ring-1 ring-ring">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="label-xs !text-[10px] text-muted">{jpMarket ? "Cote TCGplayer (JP)" : "Cote Cardmarket"}</p>
                      {marketDelta != null && (
                        <span className={`num text-[11px] font-semibold ${marketDelta > 0 ? "text-gain" : marketDelta < 0 ? "text-loss" : "text-muted"}`}>
                          {marketDelta > 0 ? "+" : ""}
                          {Math.round(marketDelta)} %{sinceDays ? ` · ${sinceDays} j` : ""}
                        </span>
                      )}
                    </div>
                    <p className="display num text-2xl font-bold leading-tight">
                      {price != null ? `${jpMarket ? "≈ " : ""}${formatEur(price)}` : <span className="text-base font-normal text-faint">non cotée</span>}
                    </p>
                    {series.length > 1 && (
                      <div className="mt-1.5">
                        <Sparkline values={series} />
                      </div>
                    )}
                    {market && (
                      <p className="num mt-1.5 flex flex-wrap gap-x-3 text-[11px] text-muted">
                        {market.trend != null && <span>tendance {formatEur(market.trend)}</span>}
                        {market.avg30 != null && <span>30 j {formatEur(market.avg30)}</span>}
                        {market.low != null && <span>dès {formatEur(market.low)}</span>}
                      </p>
                    )}
                    {cmUrl && (
                      <a href={cmUrl} target="_blank" rel="noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-accent underline-offset-4 hover:text-accent-strong hover:underline">
                        {jpMarket ? "Voir sur TCGplayer" : "Voir sur Cardmarket"} <ExternalLink size={10} aria-hidden />
                      </a>
                    )}
                  </div>
                )}

                <div className="rounded-2xl bg-background/60 px-3.5 py-3 ring-1 ring-ring">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="label-xs !text-[10px] text-muted">Déjà dans ta collection</p>
                    {ownedQty > 0 && <span className="num text-[11px] font-semibold">×{ownedQty}</span>}
                  </div>
                  {ownedList.length === 0 ? (
                    <p className="mt-1 text-sm text-muted">Pas encore : ce sera ton premier exemplaire.</p>
                  ) : (
                    <ul className="mt-1.5 flex flex-col divide-y divide-ring">
                      {ownedList.slice(0, 3).map((o) => {
                        const v = o.manual_price ?? o.current_price;
                        return (
                          <li key={o.id}>
                            <Link href={`/carte/${o.id}`} className="flex items-center justify-between gap-2 py-1.5 text-sm transition hover:text-accent-strong">
                              <span className="truncate">
                                <span className="num font-semibold">{condLabel(o.condition)}</span>
                                {o.graded && o.grade ? <span className="text-muted"> · {o.grade}</span> : null}
                                {(o.quantity ?? 1) > 1 && <span className="text-muted"> · ×{o.quantity}</span>}
                                {o.purchase_price != null && <span className="num text-xs text-muted"> · payé {formatEur(o.purchase_price)}</span>}
                              </span>
                              <span className="num shrink-0 text-xs font-semibold">{v != null ? formatEur(v) : <span className="font-normal text-faint">—</span>}</span>
                            </Link>
                          </li>
                        );
                      })}
                      {ownedList.length > 3 && (
                        <li className="pt-1.5 text-[11px] text-muted">et {ownedList.length - 3} autre{ownedList.length - 3 > 1 ? "s" : ""}</li>
                      )}
                    </ul>
                  )}
                </div>

                {!custom && total != null && total > 0 && (
                  <div className="rounded-2xl bg-background/60 px-3.5 py-3 ring-1 ring-ring">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="label-xs !text-[10px] truncate text-muted">Set {meta.setName}</p>
                      <span className="num shrink-0 text-[11px] font-semibold">
                        {setOwned}/{total}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(setOwned > 0 ? 2 : 0, Math.round((setOwned / total) * 100)))}%` }} />
                    </div>
                    <p className="num mt-1.5 flex justify-between text-[11px] text-muted">
                      <span>{Math.round((setOwned / total) * 100)} % du set</span>
                      <Link href={`/extensions/${meta.setId}`} className="text-accent underline-offset-4 hover:text-accent-strong hover:underline">
                        Voir l’extension
                      </Link>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>

          <div className="min-w-0">
            <ItemForm
              mode="create"
              card={meta}
              scanId={scanCtx?.id}
              cote={price}
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
