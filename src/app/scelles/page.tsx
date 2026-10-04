import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { formatEur } from "@/lib/domain";
import { kindLabel, sealedSetName } from "@/lib/sealed";
import { sealedCotes, sealedVariations } from "@/lib/sealed-prices";

export const metadata = {
  title: "Scellés — TailTCG",
};

type Product = {
  id: number;
  name: string;
  kind: string;
  set_name: string;
  set_name_fr: string | null;
  image: string;
  cardmarket_id: number | null;
  price_usd: number | null;
};
type Row = {
  id: string;
  quantity: number;
  purchase_price: number | null;
  purchase_date: string | null;
  manual_price: number | null;
  product: Product | Product[] | null;
};
const fmtShort = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const pct = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} %`;
const one = (p: Row["product"]): Product | null => (Array.isArray(p) ? (p[0] ?? null) : p);

// Collection de produits scellés, regroupée par produit : possédés, payé, cote, variation
export default async function ScellesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data } = await supabase
    .from("sealed_items")
    .select("id, quantity, purchase_price, purchase_date, manual_price, product:sealed_products(id, name, kind, set_name, set_name_fr, image, cardmarket_id, price_usd)")
    .order("created_at", { ascending: false });

  const lots = ((data ?? []) as Row[]).map((r) => ({ ...r, product: one(r.product) })).filter((r): r is Row & { product: Product } => !!r.product);

  // Un bloc par produit (plusieurs lots possibles)
  const byProduct = new Map<number, { product: Product; quantity: number; paid: number; pricedQty: number; manual: number | null; since: string | null }>();
  for (const l of lots) {
    const g = byProduct.get(l.product.id) ?? { product: l.product, quantity: 0, paid: 0, pricedQty: 0, manual: null, since: null };
    g.quantity += l.quantity;
    if (l.purchase_price != null) {
      g.paid += l.purchase_price * l.quantity;
      g.pricedQty += l.quantity;
    }
    if (l.manual_price != null) g.manual = l.manual_price;
    if (l.purchase_date && (!g.since || l.purchase_date < g.since)) g.since = l.purchase_date;
    byProduct.set(l.product.id, g);
  }
  const groups = [...byProduct.values()];
  const [cotes, variations] = await Promise.all([
    sealedCotes(groups.map((g) => g.product)),
    sealedVariations(groups.map((g) => g.product.id), 7),
  ]);

  const lines = groups.map((g) => {
    const cote = cotes.get(g.product.id) ?? null;
    const unit = g.manual ?? cote?.value ?? null;
    const estimated = unit != null ? unit * g.quantity : null;
    // plus-value sur la part au prix connu, comme le tableau de bord
    const gain = estimated != null && unit != null && g.pricedQty > 0 ? unit * g.pricedQty - g.paid : null;
    return { ...g, cote, unit, estimated, gain, gainPct: gain != null && g.paid > 0 ? (gain / g.paid) * 100 : null, v7: variations.get(g.product.id) ?? null };
  });
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const pricedCount = lines.reduce((n, l) => n + l.pricedQty, 0);
  const totalPaid = lines.reduce((n, l) => n + l.paid, 0);
  const totalEst = lines.reduce((n, l) => n + (l.estimated ?? 0), 0);
  const gain = lines.reduce((n, l) => n + (l.gain ?? 0), 0);
  const usEstimated = lines.filter((l) => l.cote?.source === "tcgplayer").length;
  const lowBased = lines.filter((l) => l.cote?.source === "cardmarket-low").length;
  // Variation 7 j de l'ensemble, pondérée par la valeur des produits relevés
  const withV7 = lines.filter((l) => l.v7 != null && l.estimated != null);
  const v7Base = withV7.reduce((n, l) => n + l.estimated!, 0);
  const v7All = v7Base > 0 ? withV7.reduce((n, l) => n + l.estimated! * l.v7!, 0) / v7Base : null;
  const best = lines.filter((l) => l.gain != null).sort((a, b) => b.gain! - a.gain!)[0] ?? null;

  return (
    <AppShell>
      <main className="page py-8">
        <PageHead kicker="Ma collection" title="Scellés" count={count || null} sub={lines.length === 0 ? "Boosters, displays, coffrets et tins gardés fermés, cotés d'après Cardmarket." : undefined}>
          <Link href="/scelles/ajouter" className="btn btn-primary shadow-lg shadow-accent/30">
            <Plus size={16} aria-hidden />
            <span className="hidden sm:inline">Ajouter un scellé</span>
            <span className="sm:hidden">Ajouter</span>
          </Link>
        </PageHead>

        {lines.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <Boxes size={32} className="text-muted" aria-hidden />
            <p className="display text-xl font-semibold">Aucun produit scellé</p>
            <p className="max-w-md text-sm text-muted">
              Parcours le catalogue par série et extension, ou cherche un produit : chaque fiche montre sa cote et son évolution.
            </p>
            <Link href="/scelles/ajouter" className="btn btn-primary mt-2">
              <Plus size={16} aria-hidden />
              Parcourir le catalogue
            </Link>
          </div>
        ) : (
          <>
            {/* Chiffres clés */}
            <div className="mb-5">
              <StatStrip cols={5}>
                <StatCard label="Produits" value={count} sub={`${lines.length} référence${lines.length > 1 ? "s" : ""}${pricedCount < count ? ` · ${pricedCount} au prix connu` : ""}`} />
                <StatCard label="Payé" value={formatEur(totalPaid)} />
                <StatCard
                  label="Cote"
                  value={formatEur(totalEst)}
                  sub={[lowBased > 0 ? `${lowBased} dès` : null, usEstimated > 0 ? `${usEstimated} ≈ US` : null].filter(Boolean).join(" · ") || "Cardmarket"}
                />
                <StatCard
                  label="Plus-value"
                  value={totalPaid > 0 ? `${gain > 0 ? "+" : ""}${formatEur(gain)}` : "—"}
                  sub={totalPaid > 0 ? pct((gain / totalPaid) * 100) : "prix d'achat inconnu"}
                  tone={totalPaid > 0 ? (gain > 0 ? "up" : gain < 0 ? "down" : undefined) : undefined}
                />
                <StatCard
                  label="7 jours"
                  value={v7All != null ? `${v7All > 0 ? "+" : ""}${v7All.toFixed(1).replace(".", ",")} %` : "—"}
                  sub={v7All != null ? `${withV7.length} produit${withV7.length > 1 ? "s" : ""} relevé${withV7.length > 1 ? "s" : ""}` : "relevé en cours"}
                  tone={v7All != null ? (v7All > 0 ? "up" : v7All < 0 ? "down" : undefined) : undefined}
                />
              </StatStrip>
              {best && best.gain! > 0 && (
                <p className="mt-2 text-xs text-muted">
                  Meilleure plus-value : <span className="font-medium text-foreground">{best.product.name}</span> <span className="num text-gain">+{formatEur(best.gain!)}</span>
                </p>
              )}
            </div>

            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {lines.map((l) => (
                <li key={l.product.id}>
                  <Link
                    href={`/scelles/produit/${l.product.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-3xl bg-surface ring-1 ring-ring transition hover:-translate-y-0.5 hover:shadow-xl hover:ring-accent/40"
                  >
                    <div className="relative aspect-[4/3] overflow-hidden bg-white">
                      {l.product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.product.image} alt="" className="absolute inset-0 h-full w-full object-contain p-5 transition group-hover:scale-[1.03]" loading="lazy" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <Boxes size={40} className="text-neutral-400" aria-hidden />
                        </span>
                      )}
                      {l.quantity > 1 && (
                        <span className="num absolute right-3 top-3 rounded-full bg-black/80 px-2 py-0.5 text-xs font-semibold text-white">× {l.quantity}</span>
                      )}
                      {l.gainPct != null ? (
                        <span
                          className={`num absolute left-3 top-3 rounded-full px-2 py-0.5 text-xs font-bold ${l.gainPct >= 0 ? "bg-gain/90 text-black" : "bg-loss/90 text-white"}`}
                          title="Plus-value depuis le prix payé"
                        >
                          {pct(l.gainPct)}
                        </span>
                      ) : (
                        l.v7 != null && (
                          <span
                            className={`num absolute left-3 top-3 rounded-full px-2 py-0.5 text-xs font-semibold ${l.v7 >= 0 ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"}`}
                            title="Variation de la cote sur 7 jours"
                          >
                            {l.v7 >= 0 ? "+" : ""}
                            {l.v7.toFixed(1).replace(".", ",")} %
                          </span>
                        )
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-4">
                      <p className="line-clamp-2 text-sm font-semibold leading-tight">{l.product.name}</p>
                      <p className="truncate text-xs text-muted">
                        {kindLabel(l.product.kind)} · {sealedSetName(l.product)}
                      </p>
                      {l.since && <p className="text-[11px] text-faint">Acheté le {fmtShort(l.since)}</p>}
                      <div className="mt-auto flex flex-wrap items-baseline justify-between gap-x-2 pt-2">
                        <span className="num order-2 whitespace-nowrap text-[11px] text-muted sm:order-none sm:text-xs">{l.paid > 0 ? `payé ${formatEur(l.paid)}` : "prix inconnu"}</span>
                        <span
                          className={`num text-sm font-bold ${l.estimated == null ? "text-faint" : ""}`}
                          title={
                            l.manual != null
                              ? "Estimation saisie à la main"
                              : l.cote?.source === "tcgplayer"
                                ? "Estimation d'après le marché US"
                                : l.cote?.source === "cardmarket-low"
                                  ? "À partir de : annonce Cardmarket la moins chère, pas encore de vente"
                                  : "Cote Cardmarket"
                          }
                        >
                          {l.cote?.source === "cardmarket-low" && l.manual == null && <span className="mr-1 text-[10px] font-normal text-faint">dès</span>}
                          {l.estimated != null ? formatEur(l.estimated) : "—"}
                          {l.cote?.source === "tcgplayer" && l.manual == null && <span className="ml-1 text-[10px] font-normal text-faint">≈ US</span>}
                        </span>
                      </div>
                      {l.gain != null && (
                        <p className={`num flex items-baseline justify-between text-[11px] font-semibold sm:text-xs ${l.gain > 0 ? "text-gain" : l.gain < 0 ? "text-loss" : "text-muted"}`}>
                          <span className="font-normal text-faint">plus-value</span>
                          <span>
                            {l.gain > 0 ? "+" : ""}
                            {formatEur(l.gain)}
                          </span>
                        </p>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </AppShell>
  );
}
