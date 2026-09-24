import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CatalogClient, type CatalogProduct } from "./catalog-client";

export const metadata = {
  title: "Ajouter un produit scellé — TailTCG",
};

// Catalogue des produits scellés (synchronisé chaque nuit), récents en premier
export default async function AjouterScellePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("sealed_products")
    .select("id, name, kind, set_name, set_name_fr, set_id, released_on, image")
    .order("released_on", { ascending: false, nullsFirst: false })
    .limit(5000);

  const products: CatalogProduct[] = (data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    kind: p.kind,
    set: p.set_name_fr || p.set_name,
    setId: p.set_id ?? p.set_name,
    released: p.released_on ?? "",
    image: p.image,
  }));

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <Link href="/scelles" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
          <ArrowLeft size={14} aria-hidden />
          Scellés
        </Link>
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">Ajouter un produit scellé</h1>
        <p className="mb-6 text-sm text-muted">Cherche par nom ou par extension, filtre par type, puis renseigne quantité et prix d&apos;achat.</p>
        <CatalogClient products={products} />
      </main>
    </AppShell>
  );
}
