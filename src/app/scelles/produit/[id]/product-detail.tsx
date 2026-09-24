import Link from "next/link";
import { ArrowLeft, Boxes, ExternalLink, Trash2 } from "lucide-react";
import { SealedPriceChart } from "@/components/sealed-price-chart";
import { formatEur } from "@/lib/domain";
import { cardmarketUrl } from "@/lib/tcgdex";
import { kindLabel, sealedSetName } from "@/lib/sealed";
import type { SealedCote, SnapshotPoint } from "@/lib/sealed-prices";
import { removeSealedItem } from "../../actions";
import { AddForm } from "./add-form";

export type SealedProductRow = {
  id: number;
  name: string;
  kind: string;
  set_name: string;
  set_name_fr: string | null;
  set_logo: string | null;
  serie: string | null;
  serie_logo: string | null;
  released_on: string | null;
  image: string;
  cardmarket_id: number | null;
  price_usd: number | null;
};
export type SealedLot = {
  id: string;
  quantity: number;
  purchase_price: number | null;
  purchase_date: string | null;
  manual_price: number | null;
};

const USD_TO_EUR = 0.92;
const fmtDate = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1).replace(".", ",")} %`;

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "gain" | "loss" | "faint"; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-xs">{label}</span>
      <span className={`display num text-xl font-bold leading-none ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : tone === "faint" ? "text-faint" : ""}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

/**
 * Fiche d'un produit scellé : visuel, extension et série, cote et variations,
 * courbe d'historique, ajout à la collection, lots possédés.
 */
export function ProductDetail({
  product,
  cote,
  history,
  v7,
  v30,
  lots,
}: {
  product: SealedProductRow;
  cote: SealedCote | null;
  history: SnapshotPoint[];
  v7: number | null;
  v30: number | null;
  lots: SealedLot[];
}) {
  const owned = lots.reduce((n, l) => n + l.quantity, 0);
  const paid = lots.reduce((n, l) => n + (l.purchase_price ?? 0) * l.quantity, 0);
  const estimated = lots.reduce((n, l) => {
    const unit = l.manual_price ?? cote?.value ?? null;
    return n + (unit != null ? unit * l.quantity : 0);
  }, 0);
  const gain = owned > 0 && cote ? estimated - paid : null;
  const usdEur = product.price_usd != null && product.price_usd > 0 ? Math.round(product.price_usd * USD_TO_EUR * 100) / 100 : null;
  const varTone = (v: number | null) => (v == null ? "faint" : v > 0 ? "gain" : v < 0 ? "loss" : undefined);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <Link href="/scelles/ajouter" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
        <ArrowLeft size={14} aria-hidden />
        Catalogue des scellés
      </Link>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Visuel */}
        <div className="panel flex aspect-square items-center justify-center overflow-hidden bg-white p-8">
          {product.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.image.replace(/_400w\.jpg$/, "_in_1000x1000.jpg")} alt={product.name} className="max-h-full max-w-full object-contain" />
          ) : (
            <Boxes size={64} className="text-neutral-400" aria-hidden />
          )}
        </div>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {product.set_logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.set_logo} alt="" className="h-10 object-contain" />
            )}
            <span className="rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent-strong">{kindLabel(product.kind)}</span>
          </div>
          <h1 className="display mt-3 text-3xl font-bold leading-tight tracking-tight">{product.name}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span className="font-medium text-foreground">{sealedSetName(product)}</span>
            {product.serie && (
              <span className="flex items-center gap-1.5">
                {product.serie_logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.serie_logo} alt="" className="h-4 object-contain" />
                )}
                {product.serie}
              </span>
            )}
            {product.released_on && <span>Sortie le {fmtDate(product.released_on)}</span>}
          </p>

          {/* Cote et variations */}
          <div className="panel mt-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
            <Stat
              label={cote?.source === "tcgplayer" ? "Estimation" : "Cote Cardmarket"}
              value={cote ? formatEur(cote.value) : "—"}
              tone={cote ? undefined : "faint"}
              sub={cote?.source === "tcgplayer" ? "Pas coté sur Cardmarket : marché US converti" : undefined}
            />
            {v7 != null && <Stat label="7 jours" value={pct(v7)} tone={varTone(v7)} />}
            {v30 != null && <Stat label="30 jours" value={pct(v30)} tone={varTone(v30)} />}
            {usdEur != null && (
              <Stat label="Marché US" value={formatEur(usdEur)} sub={`${product.price_usd!.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`} />
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
              <Stat label="Possédés" value={String(owned)} />
              <Stat label="Payé" value={formatEur(paid)} />
              <Stat label="Valeur estimée" value={formatEur(estimated)} />
              {gain != null && <Stat label="Plus-value" value={`${gain > 0 ? "+" : ""}${formatEur(gain)}`} tone={gain > 0 ? "gain" : gain < 0 ? "loss" : undefined} />}
            </div>
          )}

          <section className="panel mt-6 p-5">
            <h2 className="display mb-4 text-base font-semibold">Ajouter à mes scellés</h2>
            <AddForm productId={product.id} />
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
  );
}
