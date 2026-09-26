import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { searchCatalog } from "@/lib/catalog-search";
import type { CatalogSearchResult } from "@/lib/tcgdex";

/** Recherche dans le catalogue TailTCG (base) : mes cartes hors catalogue d'abord, puis FR et JA */
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ cards: [] });

  try {
    const supabase = await createClient();
    const safe = q.replace(/[(),%]/g, " ").trim();
    const [{ data: customs }, cards] = await Promise.all([
      supabase
        .from("custom_cards")
        .select("id, name, set_name, local_id, image_path")
        .or(`name.ilike.%${safe}%,local_id.ilike.%${safe}%`)
        .limit(20),
      searchCatalog(supabase, q),
    ]);

    let customResults: CatalogSearchResult[] = [];
    if (customs && customs.length > 0) {
      const { data: signed } = await createAdminClient()
        .storage.from("card-photos")
        .createSignedUrls(customs.map((c) => c.image_path), 3600);
      customResults = customs.map((c, i) => ({
        id: `custom:${c.id}`,
        localId: c.local_id,
        name: c.name,
        image: signed?.[i]?.signedUrl ?? null,
        setId: "custom",
        setName: c.set_name,
        lang: "fr",
        source: "custom",
      }));
    }
    return NextResponse.json({ cards: [...customResults, ...cards] });
  } catch {
    return NextResponse.json({ cards: [], error: "Catalogue indisponible, réessaie dans un instant." }, { status: 502 });
  }
}
