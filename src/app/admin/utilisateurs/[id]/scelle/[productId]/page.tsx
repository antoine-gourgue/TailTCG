import Link from "next/link";
import { notFound } from "next/navigation";
import { Boxes, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAdminData } from "@/lib/admin-data";
import { SEALED_SELECT, sealedCotes, sealedHistory, variation } from "@/lib/sealed-prices";
import { kindLabel, sealedSetName } from "@/lib/sealed";
import { shortDate } from "@/lib/admin-format";
import { cardmarketUrl } from "@/lib/tcgdex";
import { formatEur } from "@/lib/domain";
import { ValueHistoryChart } from "@/components/value-history-chart";
import { SetLogo } from "@/components/game/set-logo";
import { Avatar, Badge, HeroStat, OwnerBack, PanelHead } from "@/components/admin/admin-ui";
import { SealedLots } from "@/components/admin/sealed-lots";

const pct = (v: number) => `${v > 0 ? "+" : ""}${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const SOURCE_LABEL = { cardmarket: "Cote Cardmarket", "cardmarket-low": "À partir de", tcgplayer: "Estimation" } as const;

export default async function AdminSealedDetail({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId: raw } = await params;
  const productId = Number(raw);
  if (!Number.isInteger(productId) || productId <= 0) notFound();
  const db = createAdminClient();

  const [{ data: product }, { data: lots }, d, history] = await Promise.all([
    db.from("sealed_products").select(SEALED_SELECT).eq("id", productId).maybeSingle(),
    db.from("sealed_items").select("id, quantity, purchase_price, purchase_date, manual_price, created_at").eq("owner_id", id).eq("product_id", productId).order("created_at", { ascending: false }),
    loadAdminData(),
    sealedHistory(productId),
  ]);
  if (!product || !lots || lots.length === 0) notFound();
  const owner = d.accounts.find((a) => a.id === id);
  const ownerName = owner?.name ?? owner?.email ?? "Compte";

  const cote = (await sealedCotes([product], db)).get(productId) ?? null;
  const qty = lots.reduce((n, l) => n + l.quantity, 0);
  const paidKnown = lots.some((l) => l.purchase_price != null);
  const paid = lots.reduce((n, l) => n + (l.purchase_price ?? 0) * l.quantity, 0);
  const valued = lots.some((l) => l.manual_price != null || cote != null);
  const value = lots.reduce((n, l) => n + (l.manual_price ?? cote?.value ?? 0) * l.quantity, 0);
  const manual = lots.find((l) => l.manual_price != null)?.manual_price ?? null;
  const gain = valued && paidKnown ? value - paid : null;
  const v7 = variation(history, 7);
  const v30 = variation(history, 30);
  const prices = history.map((h) => h.price);

  // Aussi détenu par d'autres comptes
  const others = new Map<string, number>();
  for (const l of d.sealed) if (l.product.id === productId && l.owner_id !== id) others.set(l.owner_id, (others.get(l.owner_id) ?? 0) + l.quantity);
  const byId = new Map(d.accounts.map((a) => [a.id, a]));

  return (
    <div className="flex flex-col gap-3.5">
      <OwnerBack href={`/admin/utilisateurs/${id}`} name={ownerName} hue={owner?.hue ?? 200} />

      <section className="panel overflow-hidden p-5 sm:p-6" style={{ background: "radial-gradient(70% 90% at 0% 0%, color-mix(in srgb, var(--sealed) 14%, var(--surface)), var(--surface) 65%)" }}>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[240px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] md:items-center">
          <div className="mx-auto flex aspect-square w-full max-w-[240px] items-center justify-center rounded-3xl bg-white p-5 shadow-[0_30px_60px_rgba(0,0,0,.45)] md:max-w-none">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image.replace(/_400w\.jpg$/, "_in_1000x1000.jpg")} alt={product.name} className="max-h-full max-w-full object-contain" />
            ) : (
              <Boxes size={56} className="text-neutral-400" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge tone="sealed">{kindLabel(product.kind)}</Badge>
              {product.set_logo && (
                <span className="flex h-6 items-center">
                  <SetLogo logo={product.set_logo} className="max-h-6 max-w-16 object-contain" />
                </span>
              )}
              <span className="font-medium text-foreground">{sealedSetName(product)}</span>
              {product.serie && <span>· {product.serie}</span>}
              {product.released_on && <span>· sortie le {shortDate(product.released_on, d.now)}</span>}
            </p>
            <h2 className="display mt-1.5 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{product.name}</h2>

            <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
              <HeroStat label={cote ? SOURCE_LABEL[cote.source] : "Cote"} value={cote ? formatEur(cote.value) : "—"} sub={v7 != null ? `${pct(v7)} sur 7 j` : cote?.source === "tcgplayer" ? "marché US converti" : "relevée chaque nuit"} tone={cote ? undefined : "faint"} />
              <HeroStat label={`Valeur · × ${qty}`} value={valued ? formatEur(value) : "—"} sub={manual != null ? `saisie à ${formatEur(manual)} l'unité` : "à la cote"} />
              <HeroStat label="Payé" value={paidKnown ? formatEur(paid) : "—"} sub={`${lots.length} lot${lots.length > 1 ? "s" : ""}`} tone={paidKnown ? undefined : "faint"} />
              <HeroStat label="Plus-value" value={gain != null ? `${gain >= 0 ? "+" : ""}${formatEur(gain)}` : "—"} sub={gain != null && paid > 0 ? pct((gain / paid) * 100) : "prix d'achat inconnu"} tone={gain == null ? "faint" : gain >= 0 ? "up" : "down"} />
            </div>
            {product.cardmarket_id != null && (
              <a href={cardmarketUrl({ idProduct: product.cardmarket_id, name: product.name })} target="_blank" rel="noopener noreferrer" className="btn btn-ghost mt-5">
                Voir sur Cardmarket <ExternalLink size={13} aria-hidden />
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="panel p-5">
          <PanelHead title="Évolution de la cote" hint={history.length ? `${history.length} relevé${history.length > 1 ? "s" : ""} · du ${shortDate(history[0].day, d.now)} au ${shortDate(history.at(-1)!.day, d.now)}` : "Relevée chaque nuit à partir de maintenant"} />
          {history.length >= 2 ? (
            <>
              <ValueHistoryChart points={history.map((h) => ({ recorded_at: h.day, value: h.price }))} minSpanRatio={0.08} height={180} />
              <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ring pt-4 sm:grid-cols-4">
                {[
                  ["Plus bas", formatEur(Math.min(...prices))],
                  ["Plus haut", formatEur(Math.max(...prices))],
                  ["7 jours", v7 != null ? pct(v7) : "—"],
                  ["30 jours", v30 != null ? pct(v30) : "—"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{k}</p>
                    <p className="num mt-0.5 font-bold">{v}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">La courbe se dessine dès le deuxième relevé.</p>
          )}
        </section>
        <section className="panel p-5">
          <PanelHead title="Aussi détenu par" hint="Les autres comptes qui ont ce produit" />
          {others.size === 0 ? (
            <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">Aucun autre compte.</p>
          ) : (
            <ul className="divide-y divide-ring">
              {[...others.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([oid, n]) => {
                  const a = byId.get(oid);
                  return (
                    <li key={oid}>
                      <Link href={`/admin/utilisateurs/${oid}/scelle/${productId}`} className="flex items-center gap-3 py-2.5 transition hover:text-accent-strong">
                        <Avatar name={a?.name ?? a?.email ?? "?"} hue={a?.hue ?? 200} />
                        <span className="min-w-0 flex-1 truncate font-semibold">{a?.name ?? a?.email ?? "Compte supprimé"}</span>
                        <span className="num text-sm text-muted">× {n}</span>
                      </Link>
                    </li>
                  );
                })}
            </ul>
          )}
        </section>
      </section>

      <SealedLots lots={lots} ownerId={id} productId={productId} cote={cote?.value ?? null} now={d.now} />
    </div>
  );
}
