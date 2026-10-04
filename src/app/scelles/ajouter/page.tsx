import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Boxes } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { buildSealedTree } from "@/lib/sealed";
import { getSealedCatalog } from "@/lib/sealed-prices";
import { CatalogClient } from "./catalog-client";

export const metadata = {
  title: "Ajouter un produit scellé — TailTCG",
};

// Catalogue des produits scellés (synchronisé chaque nuit), organisé en
// séries → extensions → produits, récents en premier, avec la cote de chacun.
export default async function AjouterScellePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  // Catalogue en cache partagé : la page ne refait pas 2 700 lignes + le guide à chaque ouverture
  const [{ products: rows, cotes }, { data: mine }] = await Promise.all([
    getSealedCatalog(),
    // Ce que tu possèdes déjà : repères « ✓ ×n » et « Encore un ? »
    supabase.from("sealed_items").select("product_id, quantity, created_at").order("created_at", { ascending: false }),
  ]);
  const tree = buildSealedTree(rows, new Map(cotes));
  const ownedQty: Record<number, number> = {};
  const recentIds: number[] = [];
  for (const m of mine ?? []) {
    ownedQty[m.product_id] = (ownedQty[m.product_id] ?? 0) + m.quantity;
    if (!recentIds.includes(m.product_id) && recentIds.length < 8) recentIds.push(m.product_id);
  }

  return (
    <AppShell>
      <main className="relative z-10 page py-8">
        <Link href="/scelles" className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
          <ChevronLeft size={16} aria-hidden />
          Scellés
        </Link>
        <PageHead kicker="Scellés" title="Ajouter un scellé" count={rows.length} sub="Cherche un produit, filtre par type, ou feuillette les extensions : la cote Cardmarket est relevée chaque nuit.">
          <Link href="/scelles" className="btn btn-ghost">
            <Boxes size={15} aria-hidden /> Mes scellés
          </Link>
        </PageHead>
        <CatalogClient series={tree} ownedQty={ownedQty} recentIds={recentIds} />
      </main>
    </AppShell>
  );
}
