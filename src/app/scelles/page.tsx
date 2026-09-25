import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
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
  manual_price: number | null;
  product: Product | Product[] | null;
};
const one = (p: Row["product"]): Product | null => (Array.isArray(p) ? (p[0] ?? null) : p);

// Collection de produits scellés, regroupée par produit : possédés, payé, cote, variation
export default async function ScellesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("sealed_items")
    .select("id, quantity, purchase_price, manual_price, product:sealed_products(id, name, kind, set_name, set_name_fr, image, cardmarket_id, price_usd)")
    .order("created_at", { ascending: false });

  const lots = ((data ?? []) as Row[]).map((r) => ({ ...r, product: one(r.product) })).filter((r): r is Row & { product: Product } => !!r.product);

  // Un bloc par produit (plusieurs lots possibles)
  const byProduct = new Map<number, { product: Product; quantity: number; paid: number; manual: number | null }>();
  for (const l of lots) {
    const g = byProduct.get(l.product.id) ?? { product: l.product, quantity: 0, paid: 0, manual: null };
    g.quantity += l.quantity;
    g.paid += (l.purchase_price ?? 0) * l.quantity;
    if (l.manual_price != null) g.manual = l.manual_price;
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
    return { ...g, cote, unit, estimated: unit != null ? unit * g.quantity : null, v7: variations.get(g.product.id) ?? null };
  });
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const totalPaid = lines.reduce((n, l) => n + l.paid, 0);
  const totalEst = lines.reduce((n, l) => n + (l.estimated ?? 0), 0);
  const gain = totalEst - totalPaid;

  return (
    <AppShell>
      <main className="page py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">Scellés</h1>
            <p className="text-sm text-muted">Boosters, displays, coffrets et tins gardés fermés, cotés d&apos;après Cardmarket.</p>
          </div>
          <Link href="/scelles/ajouter" className="btn btn-primary">
            <Plus size={16} aria-hidden />
            Ajouter un produit
          </Link>
        </div>

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
            {/* Valeurs clés */}
            <div className="panel mb-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="label-xs">Produits</span>
                <span className="display num text-xl font-bold leading-none">{count}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="label-xs">Payé</span>
                <span className="display num text-xl font-bold leading-none">{formatEur(totalPaid)}</span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="label-xs">Valeur estimée</span>
                <span className="display num text-xl font-bold leading-none">{formatEur(totalEst)}</span>
              </div>
              {totalPaid > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="label-xs">Plus-value</span>
                  <span className={`display num text-xl font-bold leading-none ${gain > 0 ? "text-gain" : gain < 0 ? "text-loss" : ""}`}>
                    {gain > 0 ? "+" : ""}
                    {formatEur(gain)}
                  </span>
                </div>
              )}
            </div>

            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {lines.map((l) => (
                <li key={l.product.id}>
                  <Link
                    href={`/scelles/produit/${l.product.id}`}
                    className="group flex h-full flex-col overflow-hidden rounded-2xl border border-edge bg-surface transition hover:-translate-y-0.5 hover:border-accent/60 hover:shadow-lg"
                  >
                    <div className="relative flex aspect-square items-center justify-center bg-white p-4">
                      {l.product.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={l.product.image} alt="" className="max-h-full max-w-full object-contain transition group-hover:scale-[1.03]" loading="lazy" />
                      ) : (
                        <Boxes size={40} className="text-neutral-400" aria-hidden />
                      )}
                      {l.quantity > 1 && (
                        <span className="num absolute right-2 top-2 rounded-full bg-black/75 px-2 py-0.5 text-xs font-semibold text-white">× {l.quantity}</span>
                      )}
                      {l.v7 != null && (
                        <span
                          className={`num absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-semibold ${l.v7 >= 0 ? "bg-gain/15 text-gain" : "bg-loss/15 text-loss"}`}
                          title="Variation de la cote sur 7 jours"
                        >
                          {l.v7 >= 0 ? "+" : ""}
                          {l.v7.toFixed(1).replace(".", ",")} %
                        </span>
                      )}
                    </div>
                    <div className="flex flex-1 flex-col gap-1 p-3">
                      <p className="line-clamp-2 text-sm font-semibold leading-tight">{l.product.name}</p>
                      <p className="text-xs text-muted">
                        {kindLabel(l.product.kind)} · {sealedSetName(l.product)}
                      </p>
                      <div className="mt-auto flex items-baseline justify-between gap-2 pt-2">
                        <span className="num text-xs text-muted">{l.paid > 0 ? `payé ${formatEur(l.paid)}` : "prix non renseigné"}</span>
                        <span className={`num text-sm font-bold ${l.estimated == null ? "text-faint" : ""}`}>{l.estimated != null ? formatEur(l.estimated) : "—"}</span>
                      </div>
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
