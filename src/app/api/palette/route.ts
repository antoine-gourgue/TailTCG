import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Données de la palette de commande : cartes et classeurs de l'utilisateur
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const [{ data: cards }, { data: binders }] = await Promise.all([
    supabase
      .from("collection_value")
      .select("id, card_name, set_name, local_id, sold_at")
      .order("created_at", { ascending: false }),
    supabase.from("binders").select("id, name").order("name"),
  ]);

  return NextResponse.json({
    cards: (cards ?? []).map((c) => ({
      id: c.id,
      name: c.card_name,
      set: c.set_name,
      localId: c.local_id,
      sold: c.sold_at != null,
    })),
    binders: binders ?? [],
  });
}
