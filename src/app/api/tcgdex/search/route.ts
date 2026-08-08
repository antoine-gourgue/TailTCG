import { NextResponse, type NextRequest } from "next/server";
import { searchCards, type CardSearchResult } from "@/lib/tcgdex";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ cards: [] });
  }

  try {
    // Mes cartes hors catalogue d'abord (nom ou numéro)
    const supabase = await createClient();
    const safe = q.replace(/[(),%]/g, " ").trim();
    const { data: customs } = await supabase
      .from("custom_cards")
      .select("id, name, set_name, local_id, image_path")
      .or(`name.ilike.%${safe}%,local_id.ilike.%${safe}%`)
      .limit(20);

    let customResults: CardSearchResult[] = [];
    if (customs && customs.length > 0) {
      const admin = createAdminClient();
      const { data: signed } = await admin.storage
        .from("card-photos")
        .createSignedUrls(
          customs.map((c) => c.image_path),
          3600
        );
      customResults = customs.map((c, i) => ({
        id: `custom:${c.id}`,
        localId: c.local_id,
        name: c.name,
        image: signed?.[i]?.signedUrl ?? null,
        setId: "custom",
        setName: c.set_name,
      }));
    }

    const cards = await searchCards(q);
    return NextResponse.json({ cards: [...customResults, ...cards] });
  } catch {
    return NextResponse.json(
      { cards: [], error: "TCGdex est injoignable, réessaie dans un instant." },
      { status: 502 }
    );
  }
}
