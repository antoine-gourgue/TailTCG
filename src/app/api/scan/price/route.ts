import { NextResponse, type NextRequest } from "next/server";
import { canScan } from "@/lib/scan/access";
import { loadCaptureByToken } from "@/lib/capture";
import { createAdminClient } from "@/lib/supabase/admin";
import { guideReference } from "@/lib/cardmarket";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { cardmarketReference, cardmarketUrl } from "@/lib/tcgdex";
import { catalogCard } from "@/lib/catalog";
import { isScanLang } from "@/lib/scan/url";

// Cote Cardmarket d'une carte reconnue par le scan : guide local d'abord
// (par idProduct, lu en service role : le téléphone en relais QR n'est pas
// connecté), bloc TCGdex en repli ; sans cote, le lien mène à la recherche
// Cardmarket par nom. Même accès que la reconnaissance.
export type ScanPrice = { price: number | null; url: string | null };

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const session = await loadCaptureByToken(token);
    if (!session || session.kind !== "detect" || session.status !== "pending") {
      return NextResponse.json({ error: "session" }, { status: 403 });
    }
  } else if (!(await canScan())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const lang = request.nextUrl.searchParams.get("lang") ?? "fr";
  if (!id || !isScanLang(lang)) return NextResponse.json({ error: "card" }, { status: 400 });

  const card = await catalogCard(id, lang).catch(() => null);
  const block = card?.pricing?.cardmarket;
  const cmId = overrideCardmarketId(id, block?.idProduct);
  let price: number | null = null;
  if (cmId != null) {
    const { data } = await createAdminClient()
      .from("cardmarket_price_guide")
      .select("id_product, trend, avg7, avg30, avg1, avg")
      .eq("id_product", cmId)
      .maybeSingle();
    if (data) price = guideReference(data);
  }
  price ??= cardmarketReference(block);
  const url = card ? cardmarketUrl({ idProduct: cmId, name: card.name, localId: card.localId }) : null;
  const out: ScanPrice = { price, url };
  return NextResponse.json(out, { headers: { "cache-control": "private, max-age=600" } });
}
