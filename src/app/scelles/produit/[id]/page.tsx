import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Boxes, ExternalLink, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { SealedPriceChart } from "@/components/sealed-price-chart";
import { formatEur } from "@/lib/domain";
import { cardmarketUrl } from "@/lib/tcgdex";
import { kindLabel, sealedSetName } from "@/lib/sealed";
import { sealedCotes, sealedHistory, variation, USD_TO_EUR } from "@/lib/sealed-prices";
import { removeSealedItem } from "../../actions";
import { AddForm } from "./add-form";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("sealed_products").select("name").eq("id", Number(id)).maybeSingle();
  return { title: `${data?.name ?? "Produit scellé"} — TailTCG` };
}

const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

function Variation({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-xs">{label}</span>
      <span className={`display num text-xl font-bold leading-none ${value == null ? "text-faint" : value > 0 ? "text-gain" : value < 0 ? "text-loss" : ""}`}>
        {value == null ? "—" : `${value > 0 ? "+" : ""}${value.toFixed(1).replace(".", ",")} %`}
      </span>
    </div>
  );
}

// Fiche d'un produit scellé : infos, cote, variations, historique, ajout, lots possédés
export default async function ProduitScellePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: product } = await supabase.from("sealed_products").select("*").eq("id", id).maybeSingle();
  if (!product) notFound();

  const [cotes, history, { data: lotRows }] = await Promise.all([
    sealedCotes([product]),
    sealedHistory(id),
    supabase
      .from("sealed_items")
      .select("id, quantity, purchase_price, purchase_date, manual_price, created_at")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
  ]);
  const cote = cotes.get(id) ?? null;
  const lots = lotRows ?? [];
  const v7 = variation(history, 7);
  const v30 = variation(history, 30);

  const owned = lots.reduce((n, l) => n + l.quantity, 0);
  const paid = lots.reduce((n, l) => n + (l.purchase_price ?? 0) * l.quantity, 0);
  const estimated = lots.reduce((n, l) => {
    const unit = l.manual_price ?? cote?.value ?? null;
    return n + (unit != null ? unit * l.quantity : 0);
  }, 0);
  const gain = owned > 0 && cote ? estimated - paid : null;
  const usdEur = product.price_usd != null && product.price_usd > 0 ? Math.round(product.price_usd * USD_TO_EUR * 100) / 100 : null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Link href="/scelles/ajouter" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
          <ArrowLeft size={14} aria-hidden />
          Catalogue des scellés
        </Link>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {/* Visuel */}
          <div className="panel flex aspect-square items-center justify-center overflow-hidden bg-white p-8">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt={product.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <Boxes size={64} className="text-neutral-400" aria-hidden />
            )}
          </div>

          <div className="min-w-0">
            <p className="label-xs mb-2 text-accent-strong">{kindLabel(product.kind)}</p>
            <h1 className="display text-3xl font-bold tracking-tight">{product.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
              {product.set_logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.set_logo} alt="" className="h-8 object-contain" />
              )}
              <span className="font-medium text-foreground">{sealedSetName(product)}</span>
              {product.serie && (
                <span className="flex items-center gap-1.5">
                  {product.serie_logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.serie_logo} alt="" className="h-5 object-contain" />
                  )}
                  {product.serie}
                </span>
              )}
              {product.released_on && <span>Sortie le {fmtDate(product.released_on)}</span>}
            </div>

            {/* Valeurs clés */}
            <div className="panel mt-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="label-xs">{cote?.source === "tcgplayer" ? "Estimation" : "Cote Cardmarket"}</span>
                <span className={`display num text-xl font-bold leading-none ${cote ? "" : "text-faint"}`}>{cote ? formatEur(cote.value) : "—"}</span>
                {cote?.source === "tcgplayer" && <span className="text-xs text-muted">Pas coté sur Cardmarket : prix du marché US converti</span>}
              </div>
              <Variation label="7 jours" value={v7} />
              <Variation label="30 jours" value={v30} />
              {usdEur != null && (
                <div className="flex flex-col gap-0.5">
                  <span className="label-xs">Marché US</span>
                  <span className="display num text-xl font-bold leading-none">{formatEur(usdEur)}</span>
                  <span className="num text-xs text-muted">{product.price_usd} $</span>
                </div>
              )}
              {product.cardmarket_id != null && (
                <a
                  href={cardmarketUrl({ idProduct: product.cardmarket_id, name: product.name })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Voir ce produit sur Cardmarket"
                  className="group ml-auto flex items-center gap-3 rounded-xl border border-edge bg-raised/60 px-4 py-2 transition hover:border-accent/50 hover:bg-raised"
                >
                  <span className="flex flex-col gap-0.5">
                    <span className="label-xs">Cardmarket</span>
                    <span className="text-sm font-semibold leading-none">Voir le produit</span>
                  </span>
                  <ExternalLink size={15} aria-hidden className="shrink-0 text-faint transition group-hover:text-accent-strong" />
                </a>
              )}
            </div>

            {/* Ma collection */}
            {owned > 0 && (
              <div className="panel mt-4 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
                <div className="flex flex-col gap-0.5">
                  <span className="label-xs">Possédés</span>
                  <span className="display num text-xl font-bold leading-none">{owned}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="label-xs">Payé</span>
                  <span className="display num text-xl font-bold leading-none">{formatEur(paid)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="label-xs">Valeur estimée</span>
                  <span className="display num text-xl font-bold leading-none">{formatEur(estimated)}</span>
                </div>
                {gain != null && (
                  <div className="flex flex-col gap-0.5">
                    <span className="label-xs">Plus-value</span>
                    <span className={`display num text-xl font-bold leading-none ${gain > 0 ? "text-gain" : gain < 0 ? "text-loss" : ""}`}>
                      {gain > 0 ? "+" : ""}
                      {formatEur(gain)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <section className="panel mt-6 p-5">
              <h2 className="display mb-4 text-base font-semibold">Ajouter à mes scellés</h2>
              <AddForm productId={id} />
            </section>
          </div>
        </div>

        <section className="panel mt-8 p-5">
          <h2 className="display mb-4 text-base font-semibold">Évolution de la cote</h2>
          <SealedPriceChart points={history} />
        </section>

        {lots.length > 0 && (
          <section className="panel mt-6 p-5">
            <h2 className="display mb-4 text-base font-semibold">Mes lots</h2>
            <ul className="divide-y divide-edge">
              {lots.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3 text-sm">
                  <span className="num font-semibold">{l.quantity} ×</span>
                  <span className="num">{l.purchase_price != null ? formatEur(l.purchase_price) : <span className="text-faint">prix non renseigné</span>}</span>
                  {l.purchase_date && <span className="text-muted">le {fmtDate(l.purchase_date)}</span>}
                  {l.manual_price != null && <span className="text-muted">estimé à la main {formatEur(l.manual_price)}</span>}
                  <form action={removeSealedItem} className="ml-auto">
                    <input type="hidden" name="id" value={l.id} />
                    <button type="submit" className="btn btn-ghost text-xs">
                      <Trash2 size={13} aria-hidden />
                      Retirer
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppShell>
  );
}
