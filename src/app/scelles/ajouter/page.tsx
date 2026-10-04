import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
  const { products: rows, cotes } = await getSealedCatalog();
  const tree = buildSealedTree(rows, new Map(cotes));

  return (
    <AppShell>
      <main className="page py-8">
        <Link href="/scelles" className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
          <ArrowLeft size={14} aria-hidden />
          Scellés
        </Link>
        <PageHead kicker="Scellés" title="Ajouter un scellé" count={rows.length} sub="Par série puis par extension, ou cherche directement un nom." />
        <CatalogClient series={tree} />
      </main>
    </AppShell>
  );
}
