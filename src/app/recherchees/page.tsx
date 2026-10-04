import Link from "next/link";
import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages } from "@/lib/images";
import { daysAgoISO, formatEur } from "@/lib/domain";
import { cardmarketUrl, getCard } from "@/lib/tcgdex";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { resolveCardmarketPrice } from "@/lib/cardmarket";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { WishlistClient, type WishItem } from "@/components/recherchees-client";
import type { WishPriority } from "./actions";

export const metadata = {
  title: "Recherchées — TailTCG",
};

const PRICED_MAX = 80;
const WINDOW_DAYS = 30;

export default async function WishlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { data: rows } = await supabase
    .from("wishlist")
    .select("id, tcgdex_id, card_name, set_name, set_id, local_id, image_url, created_at, priority, target_price")
    .order("created_at", { ascending: false });

  const wishes = await signStorageImages(rows ?? [], user.id);
  const catalogIds = wishes.filter((w) => !w.tcgdex_id.startsWith("custom:")).map((w) => w.tcgdex_id);

  // Cote Cardmarket, rareté et lien produit : fiche TCGdex (cache 24 h) puis guide local
  const details = new Map<string, { price: number | null; rarity: string | null; cmUrl: string | null; total: number | null }>();
  const [, { data: snaps }] = await Promise.all([
    Promise.all(
      catalogIds.slice(0, PRICED_MAX).map(async (id) => {
        const card = await getCard(id).catch(() => null);
        if (!card) return;
        const cmId = overrideCardmarketId(card.id, card.pricing?.cardmarket?.idProduct);
        const price = await resolveCardmarketPrice(cmId, card.pricing?.cardmarket);
        details.set(id, { price, rarity: card.rarity ?? null, cmUrl: cardmarketUrl({ idProduct: cmId, name: card.name, localId: card.localId }), total: card.set.cardCount?.official ?? null });
      })
    ),
    // Relevés nocturnes des 30 derniers jours : courbe et variation
    catalogIds.length > 0
      ? createAdminClient()
          .from("price_snapshots")
          .select("tcgdex_id, captured_at, reference")
          .in("tcgdex_id", catalogIds)
          .not("reference", "is", null)
          .gte("captured_at", daysAgoISO(WINDOW_DAYS))
          .order("captured_at")
      : Promise.resolve({ data: null }),
  ]);
  const series = new Map<string, number[]>();
  for (const s of snaps ?? []) {
    const v = Number(s.reference);
    if (!Number.isFinite(v) || v <= 0) continue;
    (series.get(s.tcgdex_id) ?? series.set(s.tcgdex_id, []).get(s.tcgdex_id)!).push(v);
  }

  const items: WishItem[] = wishes.map((w) => {
    const d = details.get(w.tcgdex_id);
    const ser = series.get(w.tcgdex_id) ?? [];
    const delta = ser.length > 1 && ser[0] > 0 ? ((ser[ser.length - 1] - ser[0]) / ser[0]) * 100 : null;
    return {
      id: w.id,
      tcgdexId: w.tcgdex_id,
      name: w.card_name,
      setId: w.set_id,
      setName: w.set_name,
      localId: w.local_id,
      total: d?.total ?? null,
      image: w.image_url || null,
      rarity: d?.rarity ?? null,
      price: d?.price ?? null,
      cmUrl: d?.cmUrl ?? null,
      delta,
      series: ser.slice(-30),
      priority: (w.priority as WishPriority) ?? "normal",
      target: w.target_price,
      createdAt: w.created_at ?? "",
    };
  });

  // Chiffres
  const priced = items.filter((i) => i.price != null);
  const budget = priced.reduce((s, i) => s + i.price!, 0);
  const setCount = new Set(items.map((i) => i.setId)).size;
  const drops = items.filter((i) => i.delta != null && i.delta <= -0.5).sort((a, b) => a.delta! - b.delta!);
  const under = items.filter((i) => i.price != null && i.target != null && i.price <= i.target);

  return (
    <AppShell>
      <main className="page py-8">
        <PageHead
          kicker="Ma collection"
          title="Recherchées"
          count={items.length || null}
          sub="Ton carnet de chasse : cote suivie chaque nuit, prix cible, et la carte sort de la liste quand tu l’ajoutes."
        >
          <Link href="/catalogue" className="btn btn-ghost">
            Parcourir le catalogue
          </Link>
          <Link href="/catalogue" className="btn btn-primary shadow-lg shadow-accent/30">
            <Star size={15} aria-hidden /> Ajouter une recherchée
          </Link>
        </PageHead>

        {items.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <Star size={32} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Aucune carte recherchée</p>
            <p className="max-w-sm text-sm text-muted">Sur une fiche carte ou une page d&apos;extension, clique sur l&apos;étoile « Je la cherche » pour la garder à l&apos;œil.</p>
            <Link href="/catalogue" className="btn btn-primary mt-2">
              Parcourir le catalogue
            </Link>
          </div>
        ) : (
          <div className="rise-in flex flex-col gap-5">
            <StatStrip cols={4}>
              <StatCard label="Cartes" value={items.length} sub={`dans ${setCount} set${setCount > 1 ? "s" : ""}`} />
              <StatCard label="Budget au cours" value={priced.length ? formatEur(budget) : "—"} sub={priced.length ? `${priced.length} carte${priced.length > 1 ? "s" : ""} cotée${priced.length > 1 ? "s" : ""} sur ${items.length}` : "aucune cote connue"} />
              <StatCard label="En baisse · 30 j" value={drops.length} tone={drops.length ? "down" : undefined} sub={drops[0] ? `dont ${drops[0].name} ${Math.round(drops[0].delta!)} %` : "rien ne baisse"} />
              <StatCard label="Sous le prix cible" value={under.length} tone={under.length ? "up" : undefined} sub={under[0] ? `${under[0].name} · ${formatEur(under[0].price!)}` : "fixe des prix cibles"} />
            </StatStrip>
            <WishlistClient items={items} />
          </div>
        )}
      </main>
    </AppShell>
  );
}
