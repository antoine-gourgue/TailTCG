import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { formatEur } from "@/lib/domain";
import { kindLabel, sealedSetName } from "@/lib/sealed";
import { sealedCotes } from "@/lib/sealed-prices";
import { removeSealedItem } from "./actions";

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

const one = (p: Row["product"]): Product | null => (Array.isArray(p) ? (p[0] ?? null) : p);

// Collection de produits scellés : chaque lot avec son prix d'achat et sa cote
export default async function ScellesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("sealed_items")
    .select(
      "id, quantity, purchase_price, purchase_date, manual_price, product:sealed_products(id, name, kind, set_name, set_name_fr, image, cardmarket_id, price_usd)",
    )
    .order("created_at", { ascending: false });

  const items = ((data ?? []) as Row[]).map((r) => ({ ...r, product: one(r.product) })).filter((r) => r.product) as (Omit<
    Row,
    "product"
  > & { product: Product })[];

  const cotes = await sealedCotes(items.map((r) => r.product));

  const lines = items.map((r) => {
    const cote = cotes.get(r.product.id) ?? null;
    const est = r.manual_price ?? cote?.value ?? null;
    return { ...r, cote, est };
  });
  const count = lines.reduce((n, r) => n + r.quantity, 0);
  const totalBuy = lines.reduce((n, r) => n + (r.purchase_price ?? 0) * r.quantity, 0);
  const totalEst = lines.reduce((n, r) => n + (r.est != null ? r.est * r.quantity : 0), 0);

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">Scellés</h1>
            <p className="text-sm text-muted">Boosters, displays, coffrets et tins que tu gardes fermés, avec leur cote.</p>
          </div>
          <Link href="/scelles/ajouter" className="btn btn-primary">
            <Plus size={16} aria-hidden />
            Ajouter un produit
          </Link>
        </div>

        {lines.length > 0 && (
          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="panel p-4">
              <p className="label-xs text-muted">Produits</p>
              <p className="display mt-1 text-2xl font-bold">{count}</p>
            </div>
            <div className="panel p-4">
              <p className="label-xs text-muted">Prix d&apos;achat</p>
              <p className="display mt-1 text-2xl font-bold">{formatEur(totalBuy)}</p>
            </div>
            <div className="panel p-4">
              <p className="label-xs text-muted">Valeur estimée</p>
              <p className="display mt-1 text-2xl font-bold">{formatEur(totalEst)}</p>
              {totalBuy > 0 && (
                <p className={`mt-0.5 text-xs ${totalEst - totalBuy >= 0 ? "text-gain" : "text-loss"}`}>
                  {totalEst - totalBuy >= 0 ? "+" : ""}
                  {formatEur(totalEst - totalBuy)}
                </p>
              )}
            </div>
          </div>
        )}

        {lines.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <Boxes size={32} className="text-muted" aria-hidden />
            <p className="display text-xl font-semibold">Aucun produit scellé</p>
            <p className="max-w-md text-sm text-muted">
              Ajoute tes boosters, displays et coffrets fermés : ils sont cotés automatiquement d&apos;après Cardmarket.
            </p>
            <Link href="/scelles/ajouter" className="btn btn-primary mt-2">
              <Plus size={16} aria-hidden />
              Ajouter un produit
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {lines.map((r) => (
              <li key={r.id} className="panel flex flex-col overflow-hidden">
                <div className="flex aspect-square items-center justify-center bg-white p-3">
                  {r.product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.product.image} alt={r.product.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                  ) : (
                    <Boxes size={40} className="text-muted" aria-hidden />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-tight">{r.product.name}</p>
                  <p className="text-xs text-muted">
                    {kindLabel(r.product.kind)} · {sealedSetName(r.product)}
                  </p>
                  <p className="num mt-1 text-sm">
                    <span className="text-muted">{r.quantity} × </span>
                    {r.purchase_price != null ? formatEur(r.purchase_price) : <span className="text-faint">—</span>}
                    <span className="text-muted"> → </span>
                    {r.est != null ? (
                      <span className="font-semibold">{formatEur(r.est)}</span>
                    ) : (
                      <span className="text-faint">pas de cote</span>
                    )}
                  </p>
                  {r.cote?.source === "tcgplayer" && r.manual_price == null && (
                    <p className="text-[11px] text-faint">Estimation d&apos;après le marché US</p>
                  )}
                  <form action={removeSealedItem} className="mt-auto pt-2">
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="btn btn-ghost w-full justify-center text-xs">
                      <Trash2 size={13} aria-hidden />
                      Retirer
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
