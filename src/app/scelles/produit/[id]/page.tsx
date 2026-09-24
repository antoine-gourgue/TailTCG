import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { sealedCotes, sealedHistory, variation } from "@/lib/sealed-prices";
import { ProductDetail } from "./product-detail";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("sealed_products").select("name").eq("id", Number(id)).maybeSingle();
  return { title: `${data?.name ?? "Produit scellé"} — TailTCG` };
}

// Fiche d'un produit scellé (données) ; l'affichage est dans product-detail.tsx
export default async function ProduitScellePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: product } = await supabase.from("sealed_products").select("*").eq("id", id).maybeSingle();
  if (!product) notFound();

  const [cotes, history, { data: lots }] = await Promise.all([
    sealedCotes([product]),
    sealedHistory(id),
    supabase
      .from("sealed_items")
      .select("id, quantity, purchase_price, purchase_date, manual_price")
      .eq("product_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <AppShell>
      <ProductDetail product={product} cote={cotes.get(id) ?? null} history={history} v7={variation(history, 7)} v30={variation(history, 30)} lots={lots ?? []} />
    </AppShell>
  );
}
