import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Données du widget de la sidebar : email + valeur de la collection active
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const [{ data: items }, { data: settings }] = await Promise.all([
    supabase.from("collection_value").select("quantity, current_price, sold_at"),
    supabase
      .from("user_settings")
      .select("display_name")
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  let count = 0;
  let value = 0;
  let hasValue = false;
  for (const i of items ?? []) {
    if (i.sold_at != null) continue;
    const qty = i.quantity ?? 1;
    count += qty;
    if (i.current_price != null) {
      value += i.current_price * qty;
      hasValue = true;
    }
  }

  return NextResponse.json({
    email: user.email ?? "",
    count,
    value: hasValue ? value : null,
    displayName: settings?.display_name ?? null,
  });
}
