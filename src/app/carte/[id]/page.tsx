import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, ExternalLink, X, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardmarketUrl } from "@/lib/tcgdex";
import { catalogCard } from "@/lib/catalog";
import { japaneseFallbackPrice, resolveCardmarketRef } from "@/lib/cardmarket";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { repairCatalogImages, signStorageImages } from "@/lib/images";
import { formatEur, CONDITIONS } from "@/lib/domain";
import { rarityLabel, raritySymbol } from "@/lib/rarity";
import { AppShell } from "@/components/app-shell";
import { ItemForm } from "@/components/item-form";
import { DeleteItemButton } from "@/components/delete-item-button";
import { PhotoGallery, type GalleryPhoto } from "@/components/photo-gallery";
import { GradedSlab } from "@/components/graded-slab";
import { CardImage } from "@/components/card-image";
import { ValueHistoryChart } from "@/components/value-history-chart";
import { ValueHistoryManager } from "@/components/value-history-manager";
import { ValueUpdateButton } from "@/components/quick-value-edit";
import { SellButton } from "@/components/sell-button";
import { BinderPicker } from "@/components/binder-picker";
import { PregradeButton } from "@/components/pregrade-wizard";
import { PhoneCaptureButton } from "@/components/capture/phone-capture-button";
import {
  GradingReportButton,
  type GradingReportData,
} from "@/components/grading-report";
import { GRADE_LABELS } from "@/lib/grading";
import { ConfirmAction } from "@/components/confirm-action";
import { cancelSale } from "@/app/items/actions";
import type { SourceOption } from "@/app/items/actions";

export const metadata = {
  title: "Fiche carte — TailTCG",
};

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="label-xs mb-1">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function CartePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string; from?: string }>;
}) {
  const [{ id }, { edit, from }] = await Promise.all([params, searchParams]);
  const editing = edit != null;
  // Ouverte depuis le scan mobile : le retour ramène à la liste des cartes scannées
  const back = from === "scan" ? { href: "/scanner", label: "Scan" } : { href: "/cartes", label: "Cartes" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const [
    { data: item },
    { data: sources },
    { data: photoRows },
    { data: siblings },
    { data: binders },
    { data: memberships },
  ] = await Promise.all([
    supabase.from("collection_value").select("*").eq("id", id).single(),
    supabase.from("sources").select("id, name, kind, city, url").order("name"),
    supabase
      .from("item_photos")
      .select("id, path, label, position")
      .eq("item_id", id)
      .order("position"),
    // Voisins pour feuilleter : même vue que la grille et que la fiche
    // (collection_value exclut les cartes supprimées), sinon une flèche peut
    // pointer vers un id absent de la vue → 404
    supabase
      .from("collection_value")
      .select("id")
      .order("created_at", { ascending: false }),
    supabase.from("binders").select("id, name").order("name"),
    supabase.from("binder_items").select("binder_id").eq("item_id", id),
  ]);

  if (!item) notFound();

  // Feuilletage : carte précédente / suivante dans le classeur
  const ids = (siblings ?? []).map((s) => s.id);
  const idx = ids.indexOf(id);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

  // Fiche officielle TCGdex (cache 24 h) — sauf cartes ajoutées à la main
  const isCustom = item.tcgdex_id?.startsWith("custom:") ?? false;
  const frCard = item.tcgdex_id && !isCustom ? await catalogCard(item.tcgdex_id, "fr") : null;
  const tcgdexCard = frCard ?? (item.tcgdex_id && !isCustom && item.language === "JP" ? await catalogCard(item.tcgdex_id, "ja") : null);
  // Prix de référence Cardmarket (indicatif) — pas la valorisation, qui reste manuelle
  const marketId = overrideCardmarketId(
    item.tcgdex_id,
    tcgdexCard?.pricing?.cardmarket?.idProduct
  );
  const marketRef = await resolveCardmarketRef(marketId, tcgdexCard?.pricing?.cardmarket);
  // Carte japonaise sans cote Cardmarket : cote TCGplayer japonaise, convertie
  const jpMarket = !marketRef && item.tcgdex_id && !isCustom && item.language === "JP" && !frCard ? await japaneseFallbackPrice(item.tcgdex_id) : null;
  const marketPrice = marketRef?.value ?? jpMarket?.eur ?? null;

  // Visuel des cartes hors catalogue : photo signée depuis le bucket privé
  // (visuel manquant d'un ajout ancien : repris du catalogue, réparé en base)
  const [{ image_url: displayImage }] = await signStorageImages(
    await repairCatalogImages(supabase, [{ id: item.id, tcgdex_id: item.tcgdex_id, image_url: item.image_url, language: item.language }]),
    user.id
  );

  const [{ data: valueHistory }, { data: marketSnaps }, { data: lastGrading }] = await Promise.all([
    supabase
      .from("item_value_history")
      .select("id, recorded_at, value")
      .eq("item_id", id)
      .order("recorded_at"),
    // Cote Cardmarket relevée chaque nuit pour cette carte (référence du guide)
    item.tcgdex_id && !item.tcgdex_id.startsWith("custom:")
      ? createAdminClient()
          .from("price_snapshots")
          .select("captured_at, reference")
          .eq("tcgdex_id", item.tcgdex_id)
          .not("reference", "is", null)
          .order("captured_at")
      : Promise.resolve({ data: null }),
    supabase
      .from("item_gradings")
      .select(
        "grade, centering, corners, edges, surface, created_at, rectified_path, rectified_verso_path, ratios, details"
      )
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Visuels redressés de la pré-gradation : la TA carte prime sur le scan
  // officiel dans l'encart principal ; le verso sert au rapport
  let rectifiedUrl: string | null = null;
  let rectifiedVersoUrl: string | null = null;
  if (lastGrading?.rectified_path || lastGrading?.rectified_verso_path) {
    const admin = createAdminClient();
    const paths = [
      lastGrading.rectified_path,
      lastGrading.rectified_verso_path,
    ].filter((p): p is string => p != null);
    const { data: signed } = await admin.storage
      .from("card-photos")
      .createSignedUrls(paths, 3600);
    const byPath = new Map(paths.map((p, i) => [p, signed?.[i]?.signedUrl ?? null]));
    rectifiedUrl = lastGrading.rectified_path
      ? byPath.get(lastGrading.rectified_path) ?? null
      : null;
    rectifiedVersoUrl = lastGrading.rectified_verso_path
      ? byPath.get(lastGrading.rectified_verso_path) ?? null
      : null;
  }

  // URLs signées 1 h, générées côté serveur (bucket privé)
  let photos: GalleryPhoto[] = [];
  if (photoRows && photoRows.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("card-photos")
      .createSignedUrls(
        photoRows.map((p) => p.path),
        3600
      );
    photos = photoRows.flatMap((p, i) => {
      const url = signed?.[i]?.signedUrl;
      return url ? [{ id: p.id, url, label: p.label }] : [];
    });
  }

  const condition = CONDITIONS.find((c) => c.code === item.condition);
  const source = item.source_id
    ? (sources ?? []).find((s) => s.id === item.source_id)
    : null;
  const purchaseDate = item.purchase_date
    ? new Date(item.purchase_date).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  // Cote Cardmarket relevée chaque nuit : courbe et variation depuis le premier relevé
  const marketPoints = (marketSnaps ?? []).map((m) => ({ recorded_at: String(m.captured_at).slice(0, 10), value: Number(m.reference) }));
  const mFirst = marketPoints[0]?.value ?? null;
  const mLast = marketPoints[marketPoints.length - 1]?.value ?? null;
  const mDelta = mFirst != null && mLast != null && mFirst > 0 ? ((mLast - mFirst) / mFirst) * 100 : null;
  const showValue = !!valueHistory && valueHistory.length > 0;
  const showMarket = marketPoints.length > 0;
  const lastValueDate = showValue ? valueHistory![valueHistory!.length - 1].recorded_at : null;
  const isSold = item.sold_at != null;
  const heroImage = rectifiedUrl ?? (displayImage || null);
  const gradingData: GradingReportData | null = lastGrading
    ? {
        grade: lastGrading.grade ?? 0,
        centering: lastGrading.centering ?? 0,
        corners: lastGrading.corners ?? 0,
        edges: lastGrading.edges ?? 0,
        surface: lastGrading.surface ?? 0,
        createdAt: lastGrading.created_at,
        ratios: (lastGrading.ratios as GradingReportData["ratios"]) ?? null,
        versoRatios: ((lastGrading.details as { verso?: GradingReportData["versoRatios"] })?.verso) ?? null,
        annotations: ((lastGrading.details as { annotations?: GradingReportData["annotations"] })?.annotations) ?? [],
        rectoUrl: rectifiedUrl,
        versoUrl: rectifiedVersoUrl,
        cardName: item.card_name ?? "",
        setName: item.set_name ?? "",
        localId: item.local_id ?? "",
      }
    : null;
  const navBtn = "flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground";
  const navOff = "flex h-9 w-9 items-center justify-center rounded-full bg-surface text-faint opacity-40 ring-1 ring-ring";
  const details: { label: string; value: React.ReactNode }[] = [
    { label: "État", value: condition ? `${item.condition} · ${condition.label}` : item.condition },
    { label: "Langue", value: item.language },
    { label: "Quantité", value: <span className="num">× {item.quantity}</span> },
    {
      label: "Rareté",
      value: tcgdexCard?.rarity ? (
        <span>
          {raritySymbol(tcgdexCard.rarity) && (
            <span className="text-accent-strong" aria-hidden>
              {raritySymbol(tcgdexCard.rarity)}{" "}
            </span>
          )}
          {rarityLabel(tcgdexCard.rarity)}
        </span>
      ) : (
        "—"
      ),
    },
    ...(item.card_type ? [{ label: "Variante", value: item.card_type }] : []),
    { label: "Payé", value: <span className="num">{formatEur(item.purchase_price)}</span> },
    { label: "Acheté le", value: purchaseDate ?? "—" },
    { label: "Source", value: source ? `${source.name}${(source.kind === "shop" || source.kind === "flea") && source.city ? ` (${source.city})` : ""}` : "—" },
    { label: "Gradée", value: item.graded ? <span className="rounded-md bg-accent px-1.5 py-0.5 text-[12px] font-semibold text-accent-ink">{item.grade ?? "Oui"}</span> : "Non" },
    { label: "Ajoutée le", value: item.created_at ? new Date(item.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—" },
  ];

  return (
    <AppShell>
      <main className="page py-6 sm:py-8">
        {/* Fil : retour, feuilletage */}
        <div className="mb-4 flex items-center justify-between">
          <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
            <ChevronLeft size={16} aria-hidden />
            {back.label}
          </Link>
          <div className="flex items-center gap-1.5">
            {prevId ? (
              <Link href={`/carte/${prevId}`} title="Carte précédente" aria-label="Carte précédente" className={navBtn}>
                <ChevronLeft size={16} aria-hidden />
              </Link>
            ) : (
              <span className={navOff}>
                <ChevronLeft size={16} aria-hidden />
              </span>
            )}
            {nextId ? (
              <Link href={`/carte/${nextId}`} title="Carte suivante" aria-label="Carte suivante" className={navBtn}>
                <ChevronRight size={16} aria-hidden />
              </Link>
            ) : (
              <span className={navOff}>
                <ChevronRight size={16} aria-hidden />
              </span>
            )}
          </div>
        </div>

        {/* Héros : la carte en lumière, teintée par son propre visuel ; l'argent en grand ; les actions */}
        <section className="relative overflow-hidden rounded-[28px] bg-surface ring-1 ring-ring sm:rounded-[32px]">
          <div className="absolute inset-0" aria-hidden>
            {heroImage && (
              <CardImage base={heroImage} alt="" quality="low" fallback={photos[0]?.url ?? null} className="h-full w-full scale-150 object-cover opacity-[0.35] blur-3xl saturate-150" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/40 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-surface/70 lg:to-surface" />
            <div className="absolute inset-0 hidden bg-gradient-to-t from-surface via-surface/20 to-transparent lg:block" />
          </div>
          <div className="relative grid grid-cols-1 gap-6 p-5 sm:p-8 lg:grid-cols-[250px_minmax(0,1fr)] lg:items-center lg:gap-10">
            <div className="mx-auto w-[210px] sm:w-[240px] lg:w-auto">
              <div className="card-tile aspect-[63/88] !shadow-[0_40px_80px_rgba(0,0,0,.65)]">
                <CardImage base={heroImage} alt={item.card_name ?? ""} quality="high" fallback={photos[0]?.url ?? null} />
              </div>
            </div>
            <div className="min-w-0 text-center lg:text-left">
              <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-sm text-muted lg:justify-start">
                <Link href={`/cartes?set=${encodeURIComponent(item.set_id ?? "")}`} className="font-medium text-foreground underline-offset-2 hover:underline" title={`Voir toutes mes cartes ${item.set_name}`}>
                  {item.set_name}
                </Link>
                <span className="num">
                  · {item.local_id}
                  {tcgdexCard?.set.cardCount?.official ? ` / ${tcgdexCard.set.cardCount.official}` : ""}
                </span>
                {tcgdexCard?.rarity && (
                  <span>
                    ·{" "}
                    {raritySymbol(tcgdexCard.rarity) && (
                      <span className="text-accent-strong" aria-hidden>
                        {raritySymbol(tcgdexCard.rarity)}{" "}
                      </span>
                    )}
                    {rarityLabel(tcgdexCard.rarity)}
                  </span>
                )}
                <span>· {item.language}</span>
                {condition && <span>· {condition.label}</span>}
                {isSold && <span className="rounded-full bg-gain/15 px-2 py-0.5 text-xs font-semibold text-gain">Vendue</span>}
              </p>
              <h1 className="display mt-1.5 text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">{item.card_name}</h1>
              {!editing && (
                <div className="flex justify-center lg:justify-start">
                  <BinderPicker itemId={item.id ?? id} binders={binders ?? []} memberIds={(memberships ?? []).map((m) => m.binder_id)} />
                </div>
              )}

              {/* L'argent, en une ligne */}
              <div className="mt-6 grid grid-cols-3 gap-3 text-left lg:flex lg:flex-wrap lg:items-end lg:justify-start lg:gap-x-10 lg:gap-y-4">
                {isSold ? (
                  <>
                    <div>
                      <p className="label-xs text-muted">Payé</p>
                      <p className="display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl">{formatEur(item.purchase_price)}</p>
                    </div>
                    <div>
                      <p className="label-xs text-muted">Vendue</p>
                      <p className="display num mt-1.5 text-2xl font-bold leading-none sm:text-3xl lg:text-[34px]">{formatEur(item.sold_price)}</p>
                      <p className="num mt-2 text-xs text-muted">le {new Date(item.sold_at!).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}</p>
                    </div>
                    {item.sold_price != null && item.purchase_price != null && (
                      <div>
                        <p className="label-xs text-muted">Plus-value réalisée</p>
                        <p className={`display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl ${item.sold_price - item.purchase_price > 0 ? "text-gain" : item.sold_price - item.purchase_price < 0 ? "text-loss" : ""}`}>
                          {item.sold_price - item.purchase_price > 0 ? "+" : ""}
                          {formatEur((item.sold_price - item.purchase_price) * (item.quantity ?? 1))}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div>
                      <p className="label-xs text-muted">Valeur estimée</p>
                      <p className={`display num mt-1.5 text-2xl font-bold leading-none sm:text-3xl lg:text-[40px] ${item.current_price == null ? "text-faint" : ""}`}>{item.current_price != null ? formatEur(item.current_price) : "—"}</p>
                      <p className="num mt-2 text-[10px] text-muted sm:text-xs">
                        {item.current_price != null && lastValueDate ? `actualisée le ${lastValueDate.slice(8, 10)}/${lastValueDate.slice(5, 7)}` : "pas encore saisie"}
                      </p>
                    </div>
                    {marketPrice != null ? (
                      <a
                        href={jpMarket ? jpMarket.url : cardmarketUrl({ idProduct: marketId, name: item.card_name ?? "", localId: item.local_id ?? undefined })}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Voir cette carte sur Cardmarket"
                        className="group"
                      >
                        <p className="label-xs flex items-center gap-1 text-muted">
                          {jpMarket ? "Cote TCGplayer (JP)" : marketRef?.field === "low" ? "À partir de · Cardmarket" : "Cote Cardmarket"}
                          <ExternalLink size={11} aria-hidden className="text-faint transition group-hover:text-accent-strong" />
                        </p>
                        <p className="display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl">{formatEur(marketPrice)}</p>
                        <p className="num mt-2 text-[10px] text-muted sm:text-xs">{marketRef?.field === "low" ? "annonce la moins chère" : `${marketRef?.field ?? "guide"} · cette nuit`}</p>
                      </a>
                    ) : (
                      item.cardmarket_url && (
                        <a href={item.cardmarket_url} target="_blank" rel="noopener noreferrer" className="group">
                          <p className="label-xs flex items-center gap-1 text-muted">
                            Cardmarket <ExternalLink size={11} aria-hidden />
                          </p>
                          <p className="mt-1.5 text-sm font-semibold text-accent-strong">Voir la carte</p>
                        </a>
                      )
                    )}
                    <div>
                      <p className="label-xs text-muted">Plus-value</p>
                      <p className={`display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl ${item.gain == null ? "text-faint" : item.gain > 0 ? "text-gain" : item.gain < 0 ? "text-loss" : ""}`}>
                        {item.gain == null ? "—" : `${item.gain > 0 ? "+" : ""}${formatEur(item.gain)}`}
                      </p>
                      <p className="num mt-2 text-[10px] text-muted sm:text-xs">
                        {item.gain != null && item.purchase_price ? (
                          <>
                            <span className={item.gain >= 0 ? "text-gain" : "text-loss"}>
                              {item.gain > 0 ? "+" : ""}
                              {Math.round((item.gain / (item.purchase_price * (item.quantity ?? 1))) * 100)} %
                            </span>{" "}
                            · payée {formatEur(item.purchase_price)}
                          </>
                        ) : (
                          `payée ${formatEur(item.purchase_price)}`
                        )}
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                {editing ? (
                  <Link href={`/carte/${id}`} className="btn btn-ghost">
                    <X size={15} aria-hidden />
                    Annuler
                  </Link>
                ) : isSold ? (
                  <>
                    <ConfirmAction
                      action={cancelSale}
                      fields={{ item_id: item.id ?? id }}
                      title="Annuler la vente ?"
                      message="L'exemplaire reviendra dans ta collection active et la plus-value réalisée sera retirée des stats."
                      confirmLabel="Annuler la vente"
                      trigger="Annuler la vente"
                      triggerClassName="btn btn-ghost"
                    />
                    <Link href={`/carte/${id}?edit`} className="btn btn-primary shadow-lg shadow-accent/30">
                      <Pencil size={15} aria-hidden />
                      Modifier
                    </Link>
                  </>
                ) : (
                  <>
                    <ValueUpdateButton itemId={item.id ?? id} current={item.current_price} className="btn btn-primary shadow-lg shadow-accent/30" />
                    <Link href={`/carte/${id}?edit`} className="btn btn-ghost">
                      <Pencil size={15} aria-hidden />
                      Modifier
                    </Link>
                    <PregradeButton itemId={item.id ?? id} photos={photos} scan />
                    <PhoneCaptureButton kind="photos" itemId={item.id ?? id} label="Photos" />
                    <SellButton itemId={item.id ?? id} purchasePrice={item.purchase_price} />
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {editing ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <section className="panel p-5 sm:p-6">
              <ItemForm
                mode="edit"
                itemId={item.id ?? id}
                cardFields={isCustom ? { card_name: item.card_name ?? "", set_name: item.set_name ?? "", local_id: item.local_id ?? "" } : undefined}
                defaults={{
                  card_type: item.card_type,
                  language: item.language ?? "FR",
                  condition: item.condition,
                  quantity: item.quantity ?? 1,
                  purchase_price: item.purchase_price,
                  manual_price: item.manual_price,
                  purchase_date: item.purchase_date,
                  source_id: item.source_id,
                  cardmarket_url: item.cardmarket_url,
                  graded: item.graded ?? false,
                  grade: item.grade,
                  notes: item.notes,
                }}
                sources={(sources ?? []) as SourceOption[]}
              />
            </section>
            <section className="panel self-start p-5">
              <h2 className="display text-[15px] font-semibold">Zone sensible</h2>
              <p className="mt-1 text-xs text-muted">La carte part à la corbeille, restaurable 30 jours depuis les paramètres.</p>
              <div className="mt-4">
                <DeleteItemButton itemId={item.id ?? id} />
              </div>
            </section>
          </div>
        ) : (
          <>
            {item.needs_review && (
              <Link
                href={`/carte/${id}?edit`}
                className="mt-4 flex items-center gap-2 rounded-2xl bg-[#f59e0b]/10 px-4 py-3 text-sm text-foreground ring-1 ring-[#f59e0b]/40 transition hover:ring-[#f59e0b]/70"
              >
                <AlertTriangle size={16} className="shrink-0 text-[#f59e0b]" aria-hidden />
                <span>
                  Ajoutée en masse — <span className="font-medium">infos à compléter</span> (état, prix…). Clique pour les renseigner.
                </span>
              </Link>
            )}

            {/* Deux courbes, larges */}
            {(showValue || showMarket) && (
              <div className={`mt-4 grid grid-cols-1 gap-4 ${showValue && showMarket ? "lg:grid-cols-2" : ""}`}>
                {showValue && (
                  <section className="panel p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div>
                        <h2 className="display text-[15px] font-semibold">Ma valeur estimée</h2>
                        <p className="mt-0.5 text-xs text-muted">Chaque actualisation est datée · {valueHistory!.length} relevé{valueHistory!.length > 1 ? "s" : ""}</p>
                      </div>
                      <ValueHistoryManager entries={valueHistory!} />
                    </div>
                    <div className="mt-4">
                      <ValueHistoryChart points={valueHistory!} height={170} />
                    </div>
                  </section>
                )}
                {showMarket && (
                  <section className="panel p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <div>
                        <h2 className="display text-[15px] font-semibold">Cote {jpMarket ? "TCGplayer (JP)" : "Cardmarket"}</h2>
                        <p className="mt-0.5 text-xs text-muted">
                          Relevée chaque nuit d&apos;après le guide · {marketPoints.length} relevé{marketPoints.length > 1 ? "s" : ""}
                        </p>
                      </div>
                      {mLast != null && (
                        <span className="ml-auto text-right">
                          <span className="num block text-xl font-bold leading-none">{formatEur(mLast)}</span>
                          {mDelta != null && marketPoints.length > 1 && (
                            <span className={`num mt-1.5 block text-[11px] ${mDelta > 0 ? "text-gain" : mDelta < 0 ? "text-loss" : "text-muted"}`}>
                              {mDelta > 0 ? "+" : ""}
                              {mDelta.toFixed(1).replace(".", ",")} % depuis le premier relevé
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    <div className="mt-4">
                      {marketPoints.length >= 2 ? (
                        <ValueHistoryChart points={marketPoints} minSpanRatio={0.08} height={170} />
                      ) : (
                        <p className="rounded-xl bg-raised/60 px-4 py-5 text-sm text-muted">
                          Premier relevé le {marketPoints[0].recorded_at.slice(8, 10)}/{marketPoints[0].recorded_at.slice(5, 7)} :{" "}
                          <span className="num text-foreground">{formatEur(marketPoints[0].value)}</span>. La courbe se dessine dès le prochain.
                        </p>
                      )}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Cet exemplaire · Photos · Pré-gradation */}
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              <section className="panel p-5 sm:p-6">
                <h2 className="display text-[15px] font-semibold">Cet exemplaire</h2>
                <dl className="mt-3 divide-y divide-ring">
                  {details.map((d) => (
                    <div key={d.label} className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
                      <dt className="shrink-0 text-muted">{d.label}</dt>
                      <dd className="min-w-0 truncate text-right font-medium">{d.value}</dd>
                    </div>
                  ))}
                </dl>
                {item.notes ? (
                  <div className="mt-4 border-t border-ring pt-3">
                    <p className="label-xs mb-1 text-muted">Notes</p>
                    <p className="whitespace-pre-wrap text-sm text-muted">{item.notes}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-faint">Notes : —</p>
                )}
              </section>

              <PhotoGallery itemId={item.id ?? id} photos={photos} />

              <section className="panel p-5 sm:p-6">
                <h2 className="display text-[15px] font-semibold">Pré-gradation</h2>
                {lastGrading && gradingData ? (
                  <div className="mt-4 flex items-center gap-4">
                    <div className="w-24 shrink-0">
                      <GradedSlab
                        name={item.card_name ?? ""}
                        setName={item.set_name ?? ""}
                        localId={item.local_id ?? ""}
                        imageUrl={rectifiedUrl ?? (displayImage || null)}
                        fallback={photos[0]?.url ?? null}
                        grade={lastGrading.grade ?? 0}
                        centering={lastGrading.centering ?? 0}
                        corners={lastGrading.corners ?? 0}
                        edges={lastGrading.edges ?? 0}
                        surface={lastGrading.surface ?? 0}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="display num text-3xl font-bold leading-none">
                        {lastGrading.grade} <span className="text-base font-semibold text-muted">{GRADE_LABELS[lastGrading.grade ?? 0] ?? ""}</span>
                      </p>
                      <p className="num mt-1.5 text-xs text-muted" title="Centrage · Coins · Bords · Surface">
                        CEN {lastGrading.centering} · COI {lastGrading.corners} · BOR {lastGrading.edges} · SUR {lastGrading.surface}
                      </p>
                      {lastGrading.created_at && <p className="mt-1 text-xs text-muted">le {new Date(lastGrading.created_at).toLocaleDateString("fr-FR")}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <GradingReportButton data={gradingData} />
                        <PregradeButton itemId={item.id ?? id} photos={photos} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex items-center gap-4">
                    <div className="w-24 shrink-0 rounded-xl border border-dashed border-edge-strong p-1.5">
                      <div className="flex items-center justify-between rounded-md bg-raised px-2 py-1.5">
                        <span className="h-1.5 w-10 rounded-full bg-edge-strong" />
                        <span className="display num text-sm font-black text-faint">?</span>
                      </div>
                      <div className="mt-1.5 aspect-[63/88] overflow-hidden rounded-md opacity-60 grayscale">
                        <CardImage base={heroImage} alt="" fallback={photos[0]?.url ?? null} />
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Pas encore notée</p>
                      <p className="mt-1 text-xs text-muted">Centrage mesuré, coins, bords, surface, et l&apos;estimation chez PSA, PCA, CCC, CGC et BGS. Deux minutes avec l&apos;iPhone.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <PregradeButton itemId={item.id ?? id} photos={photos} scan />
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            {/* La carte, d'après TCGdex */}
            {tcgdexCard && (
              <section className="panel mt-4 p-5 sm:p-6">
                <h2 className="display text-[15px] font-semibold">La carte</h2>
                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
                  {tcgdexCard.rarity && <Field label="Rareté">{rarityLabel(tcgdexCard.rarity)}</Field>}
                  {tcgdexCard.category && <Field label="Catégorie">{tcgdexCard.category}</Field>}
                  {tcgdexCard.types && tcgdexCard.types.length > 0 && <Field label="Type">{tcgdexCard.types.join(" / ")}</Field>}
                  {tcgdexCard.hp != null && (
                    <Field label="PV">
                      <span className="num">{tcgdexCard.hp}</span>
                    </Field>
                  )}
                  {tcgdexCard.stage && <Field label="Stade">{tcgdexCard.stage}</Field>}
                  {tcgdexCard.illustrator && <Field label="Illustrateur">{tcgdexCard.illustrator}</Field>}
                  <Field label="Set" className="col-span-2 sm:col-span-3 lg:col-span-6">
                    {tcgdexCard.set.name}
                    {tcgdexCard.set.cardCount?.official ? (
                      <span className="num whitespace-nowrap text-muted">
                        {" "}
                        · {item.local_id} / {tcgdexCard.set.cardCount.official}
                      </span>
                    ) : null}
                  </Field>
                </dl>
              </section>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
