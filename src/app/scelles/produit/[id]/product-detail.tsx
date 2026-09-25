import Link from "next/link";
import { ArrowLeft, Boxes, ExternalLink, Trash2 } from "lucide-react";
import { ValueHistoryChart } from "@/components/value-history-chart";
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
const fmtDay = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const signed = (v: number) => `${v > 0 ? "+" : ""}${formatEur(v)}`;

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
    <main className="page py-8">
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

      {/* Historique : courbe sur une échelle de temps, variation depuis le premier relevé, repères min/max/moyenne */}
      <section className="panel mt-8 p-5">
        {(() => {
          const pts = history.map((h) => ({ recorded_at: h.day, value: h.price }));
          const first = history[0]?.price ?? null;
          const last = history[history.length - 1]?.price ?? null;
          const delta = first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
          const prices = history.map((h) => h.price);
          const min = prices.length ? Math.min(...prices) : null;
          const max = prices.length ? Math.max(...prices) : null;
          const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
          return (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                <div>
                  <h2 className="display text-base font-semibold">Évolution de la cote</h2>
                  <p className="text-xs text-muted">
                    {history.length === 0
                      ? "Relevé chaque nuit à partir de maintenant."
                      : `${history.length} relevé${history.length > 1 ? "s" : ""} · du ${fmtDay(history[0].day)} au ${fmtDay(history[history.length - 1].day)}`}
                  </p>
                </div>
                {last != null && (
                  <div className="text-right">
                    <p className="num text-lg font-bold leading-none">{formatEur(last)}</p>
                    {delta != null && history.length > 1 && (
                      <p className={`num mt-1 text-xs ${delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : "text-muted"}`}>
                        {signed(last - first!)} · {pct(delta)} depuis le premier relevé
                      </p>
                    )}
                  </div>
                )}
              </div>
              {pts.length >= 2 ? (
                <ValueHistoryChart points={pts} minSpanRatio={0.08} />
              ) : pts.length === 1 ? (
                <p className="text-sm text-muted">
                  Premier relevé le {fmtDay(history[0].day)} : <span className="num text-foreground">{formatEur(history[0].price)}</span>. La courbe se dessine dès le prochain.
                </p>
              ) : (
                <p className="text-sm text-muted">Pas encore de relevé : la cote est enregistrée chaque nuit à partir de maintenant.</p>
              )}
              {prices.length >= 2 && min != null && max != null && avg != null && (
                <div className="mt-4 flex flex-wrap gap-x-10 gap-y-3 border-t border-edge pt-4">
                  <Stat label="Plus bas" value={formatEur(min)} />
                  <Stat label="Plus haut" value={formatEur(max)} />
                  <Stat label="Moyenne" value={formatEur(avg)} />
                  {v7 != null && <Stat label="7 jours" value={pct(v7)} tone={varTone(v7)} />}
                  {v30 != null && <Stat label="30 jours" value={pct(v30)} tone={varTone(v30)} />}
                </div>
              )}
            </>
          );
        })()}
      </section>

      {/* Mes lots : ce que chaque lot a coûté, ce qu'il vaut, la différence */}
      {lots.length > 0 && (
        <section className="panel mt-6 p-5">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-base font-semibold">Mes lots</h2>
            <p className="text-xs text-muted">
              {owned} exemplaire{owned > 1 ? "s" : ""} · payé {formatEur(paid)}
              {cote ? ` · valeur ${formatEur(estimated)}` : ""}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left">
                  <th className="label-xs pb-2 font-semibold">Quantité</th>
                  <th className="label-xs pb-2 font-semibold">Payé</th>
                  <th className="label-xs pb-2 font-semibold">Date</th>
                  <th className="label-xs pb-2 text-right font-semibold">Valeur</th>
                  <th className="label-xs pb-2 text-right font-semibold">Plus-value</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-edge">
                {lots.map((l) => {
                  const unit = l.manual_price ?? cote?.value ?? null;
                  const value = unit != null ? unit * l.quantity : null;
                  const lotPaid = l.purchase_price != null ? l.purchase_price * l.quantity : null;
                  const lotGain = value != null && lotPaid != null ? value - lotPaid : null;
                  return (
                    <tr key={l.id}>
                      <td className="num py-2.5 font-semibold">{l.quantity} ×</td>
                      <td className="num py-2.5">
                        {l.purchase_price != null ? (
                          <>
                            {formatEur(l.purchase_price)}
                            {l.quantity > 1 && <span className="text-xs text-muted"> · {formatEur(lotPaid!)}</span>}
                          </>
                        ) : (
                          <span className="text-faint">non renseigné</span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted">{l.purchase_date ? fmtDate(l.purchase_date) : "—"}</td>
                      <td className="num py-2.5 text-right">
                        {value != null ? formatEur(value) : <span className="text-faint">—</span>}
                        {l.manual_price != null && <span className="block text-[11px] text-muted">estimation saisie</span>}
                      </td>
                      <td className={`num py-2.5 text-right font-semibold ${lotGain == null ? "text-faint" : lotGain > 0 ? "text-gain" : lotGain < 0 ? "text-loss" : ""}`}>
                        {lotGain != null ? signed(lotGain) : "—"}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <form action={removeSealedItem}>
                          <input type="hidden" name="id" value={l.id} />
                          <button
                            type="submit"
                            title="Retirer ce lot"
                            aria-label="Retirer ce lot"
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-loss"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
