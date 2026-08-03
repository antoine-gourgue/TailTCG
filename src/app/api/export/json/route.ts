import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Export JSON complet : la sauvegarde de secours (pas de backup auto sur
// le plan gratuit Supabase). Tout sauf les fichiers photos eux-mêmes.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "non connecté" }, { status: 401 });
  }

  const [{ data: items }, { data: sources }, { data: photos }] =
    await Promise.all([
      supabase.from("items").select("*").order("created_at"),
      supabase.from("sources").select("*").order("created_at"),
      supabase.from("item_photos").select("*").order("created_at"),
    ]);

  const ids = [...new Set((items ?? []).map((i) => i.tcgdex_id))];
  const { data: snapshots } = ids.length
    ? await supabase
        .from("price_snapshots")
        .select("*")
        .in("tcgdex_id", ids)
        .order("captured_at")
    : { data: [] };

  const date = new Date().toISOString().slice(0, 10);
  const payload = {
    exported_at: new Date().toISOString(),
    account: user.email,
    items: items ?? [],
    sources: sources ?? [],
    item_photos: photos ?? [],
    price_snapshots: snapshots ?? [],
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="pokedex-collection-${date}.json"`,
    },
  });
}
