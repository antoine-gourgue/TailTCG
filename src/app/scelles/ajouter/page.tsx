import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
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
  if (!user) redirect("/login");

  // Catalogue en cache partagé : la page ne refait pas 2 700 lignes + le guide à chaque ouverture
  const { products: rows, cotes } = await getSealedCatalog();
  const tree = buildSealedTree(rows, new Map(cotes));

  return (
    <AppShell>
      <main className="page py-8">
        <Link href="/scelles" className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
          <ArrowLeft size={14} aria-hidden />
          Scellés
        </Link>
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">Ajouter un produit scellé</h1>
        <p className="mb-6 text-sm text-muted">{rows.length} produits, par série puis par extension. Ou cherche directement un nom.</p>
        <CatalogClient series={tree} />
      </main>
    </AppShell>
  );
}
