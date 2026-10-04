import Link from "next/link";
import { Boxes, ChevronLeft, ExternalLink, Trash2 } from "lucide-react";
import { ValueHistoryChart } from "@/components/value-history-chart";
import { formatEur } from "@/lib/domain";
import { cardmarketUrl } from "@/lib/tcgdex";
import { kindLabel, sealedSetName } from "@/lib/sealed";
import type { SealedCote, SnapshotPoint } from "@/lib/sealed-prices";
import { removeSealedItem } from "../../actions";

const gainTone = (v: number | null) => (v == null ? "text-faint" : v > 0 ? "text-gain" : v < 0 ? "text-loss" : "");

function RemoveLotButton({ id }: { id: string }) {
  return (
    <form action={removeSealedItem}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" title="Retirer ce lot" aria-label="Retirer ce lot" className="flex h-9 w-9 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-loss sm:h-8 sm:w-8">
        <Trash2 size={14} aria-hidden />
      </button>
    </form>
  );
}
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

  const totalGain = gain;
  const gainPct = gain != null && paid > 0 ? (gain / paid) * 100 : null;
  const lotRows = lots.map((lot) => {
    const unit = lot.manual_price ?? cote?.value ?? null;
    const value = unit != null ? unit * lot.quantity : null;
    const lotPaid = lot.purchase_price != null ? lot.purchase_price * lot.quantity : null;
    const lotGain = value != null && lotPaid != null ? value - lotPaid : null;
    return { lot, value, lotPaid, lotGain };
  });

  return (
    <main className="page py-6 sm:py-8">
      <Link href="/scelles" className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
        <ChevronLeft size={16} aria-hidden />
        Scellés
      </Link>

      {/* Héros : visuel sur fond blanc, extension et série, cote et plus-value en grand, ajout */}
      <section className="relative overflow-hidden rounded-[28px] bg-surface ring-1 ring-ring sm:rounded-[32px]">
        <span className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <div className="relative grid grid-cols-1 gap-6 p-5 sm:p-8 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-center lg:gap-10">
          <div className="mx-auto flex aspect-square w-[220px] items-center justify-center rounded-3xl bg-white p-6 shadow-[0_30px_60px_rgba(0,0,0,.5)] sm:w-[260px] lg:w-auto">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image.replace(/_400w\.jpg$/, "_in_1000x1000.jpg")} alt={product.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <Boxes size={64} className="text-neutral-400" aria-hidden />
            )}
          </div>
          <div className="min-w-0 text-center lg:text-left">
            <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted lg:justify-start">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-strong">{kindLabel(product.kind)}</span>
              <span className="font-medium text-foreground">{sealedSetName(product)}</span>
              {product.serie && <span>· {product.serie}</span>}
              {product.released_on && <span>· sortie le {fmtDate(product.released_on)}</span>}
            </p>
            <h1 className="display mt-1.5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl lg:text-4xl">{product.name}</h1>

            <div className="mt-6 grid grid-cols-3 gap-3 text-left lg:flex lg:flex-wrap lg:items-end lg:justify-start lg:gap-x-10 lg:gap-y-4">
              <div>
                <p className="label-xs text-muted">{cote?.source === "tcgplayer" ? "Estimation" : cote?.source === "cardmarket-low" ? "À partir de" : "Cote Cardmarket"}</p>
                <p className={`display num mt-1.5 text-2xl font-bold leading-none sm:text-3xl lg:text-[40px] ${cote ? "" : "text-faint"}`}>{cote ? formatEur(cote.value) : "—"}</p>
                <p className="num mt-2 text-[10px] text-muted sm:text-xs">
                  {cote?.source === "tcgplayer" ? "marché US converti" : cote?.source === "cardmarket-low" ? "annonce la moins chère" : v7 != null ? `${pct(v7)} sur 7 j` : "relevée chaque nuit"}
                </p>
              </div>
              {owned > 0 ? (
                <>
                  <div>
                    <p className="label-xs text-muted">Ma réserve</p>
                    <p className="display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl">{formatEur(estimated)}</p>
                    <p className="num mt-2 text-[10px] text-muted sm:text-xs">
                      × {owned} · payé {formatEur(paid)}
                    </p>
                  </div>
                  <div>
                    <p className="label-xs text-muted">Plus-value</p>
                    <p className={`display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl ${totalGain == null ? "text-faint" : totalGain > 0 ? "text-gain" : totalGain < 0 ? "text-loss" : ""}`}>
                      {totalGain == null ? "—" : signed(totalGain)}
                    </p>
                    <p className="num mt-2 text-[10px] text-muted sm:text-xs">{gainPct != null ? <span className={gainPct >= 0 ? "text-gain" : "text-loss"}>{pct(gainPct)}</span> : "prix d'achat inconnu"}</p>
                  </div>
                </>
              ) : (
                <>
                  {v30 != null && (
                    <div>
                      <p className="label-xs text-muted">30 jours</p>
                      <p className={`display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl ${varTone(v30) === "gain" ? "text-gain" : varTone(v30) === "loss" ? "text-loss" : ""}`}>{pct(v30)}</p>
                    </div>
                  )}
                  {usdEur != null && (
                    <div>
                      <p className="label-xs text-muted">Marché US</p>
                      <p className="display num mt-1.5 text-xl font-bold leading-none sm:text-2xl lg:text-3xl">{formatEur(usdEur)}</p>
                      <p className="num mt-2 text-[10px] text-muted sm:text-xs">{product.price_usd!.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
              <AddForm productId={product.id} compact />
              {product.cardmarket_id != null && (
                <a href={cardmarketUrl({ idProduct: product.cardmarket_id, name: product.name })} target="_blank" rel="noopener noreferrer" className="btn btn-ghost">
                  Cardmarket <ExternalLink size={13} aria-hidden />
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Historique : courbe sur une échelle de temps, variation depuis le premier relevé, repères min/max/moyenne */}
      <section className="panel mt-4 p-5 sm:p-6">
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
                  <h2 className="display text-[15px] font-semibold">Évolution de la cote</h2>
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
                <ValueHistoryChart points={pts} minSpanRatio={0.08} height={190} />
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
        <section className="panel mt-4 p-5 sm:p-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="display text-[15px] font-semibold">Mes lots</h2>
            <p className="text-xs text-muted">
              {owned} exemplaire{owned > 1 ? "s" : ""} · payé {formatEur(paid)}
              {cote ? ` · valeur ${formatEur(estimated)}` : ""}
            </p>
          </div>
          {/* Mobile : une ligne compacte par lot, bouton de retrait toujours visible */}
          <ul className="divide-y divide-ring sm:hidden">
            {lotRows.map(({ lot: l, value, lotGain }) => (
              <li key={l.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="num text-sm font-semibold">
                    {l.quantity} ×{" "}
                    {l.purchase_price != null ? formatEur(l.purchase_price) : <span className="font-normal text-faint">prix non renseigné</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{l.purchase_date ? fmtDate(l.purchase_date) : "date non renseignée"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-sm">
                    {value != null ? formatEur(value) : <span className="text-faint">—</span>}
                    {l.manual_price != null && <span className="ml-1 text-[10px] text-muted">saisie</span>}
                  </p>
                  <p className={`num text-xs font-semibold ${gainTone(lotGain)}`}>{lotGain != null ? signed(lotGain) : "—"}</p>
                </div>
                <RemoveLotButton id={l.id} />
              </li>
            ))}
          </ul>

          <div className="-mx-5 hidden overflow-x-auto px-5 sm:-mx-6 sm:block sm:px-6">
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
                {lotRows.map(({ lot: l, value, lotPaid, lotGain }) => (
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
                    <td className={`num py-2.5 text-right font-semibold ${gainTone(lotGain)}`}>{lotGain != null ? signed(lotGain) : "—"}</td>
                    <td className="py-2.5 pl-3 text-right">
                      <RemoveLotButton id={l.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
