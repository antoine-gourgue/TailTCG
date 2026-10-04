import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sealedCotes } from "@/lib/sealed-prices";

// Données de la coquille : compte, valeur totale (cartes + scellés, comme le
// tableau de bord) et compteurs affichés dans le Dock
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const [{ data: items }, { data: settings }, { data: sealed }, { count: binders }, { count: wishes }, { count: graded }] = await Promise.all([
    supabase.from("collection_value").select("quantity, current_price, purchase_price, sold_at"),
    supabase.from("user_settings").select("display_name").eq("owner_id", user.id).maybeSingle(),
    supabase.from("sealed_items").select("quantity, purchase_price, manual_price, product:sealed_products(id, cardmarket_id, price_usd)"),
    supabase.from("binders").select("id", { count: "exact", head: true }),
    supabase.from("wishlist").select("id", { count: "exact", head: true }),
    supabase.from("item_gradings").select("item_id", { count: "exact", head: true }),
  ]);

  let count = 0;
  let value = 0;
  let invested = 0;
  let hasValue = false;
  for (const i of items ?? []) {
    if (i.sold_at != null) continue;
    const qty = i.quantity ?? 1;
    count += qty;
    invested += (i.purchase_price ?? 0) * qty;
    if (i.current_price != null) {
      value += i.current_price * qty;
      hasValue = true;
    }
  }
  // Scellés : cote (ou estimation saisie) × quantité, prix payé ; même calcul que la page Scellés
  type Prod = { id: number; cardmarket_id: number | null; price_usd: number | null };
  const lots = (sealed ?? []).map((s) => ({ ...s, product: (Array.isArray(s.product) ? s.product[0] : s.product) as Prod | null })).filter((s) => s.product);
  const cotes = lots.length > 0 ? await sealedCotes(lots.map((l) => l.product!)) : new Map();
  let sealedCount = 0;
  for (const l of lots) {
    const qty = l.quantity ?? 1;
    sealedCount += qty;
    const unit = l.manual_price ?? cotes.get(l.product!.id)?.value ?? null;
    if (l.purchase_price != null) invested += l.purchase_price * qty;
    if (unit != null) {
      value += unit * qty;
      hasValue = true;
    }
  }

  const { isAdminEmail } = await import("@/lib/admin");

  return NextResponse.json({
    email: user.email ?? "",
    count,
    value: hasValue ? value : null,
    invested,
    gain: hasValue ? value - invested : null,
    sealedCount,
    binders: binders ?? 0,
    wishes: wishes ?? 0,
    graded: graded ?? 0,
    displayName: settings?.display_name ?? null,
    isAdmin: isAdminEmail(user.email),
  });
}
