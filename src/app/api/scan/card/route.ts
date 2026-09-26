import { NextResponse, type NextRequest } from "next/server";
import { canScan } from "@/lib/scan/access";
import { loadCaptureByToken } from "@/lib/capture";
import { catalogCard } from "@/lib/catalog";
import { isScanLang } from "@/lib/scan/url";

// Fiche minimale d'une carte reconnue sur l'appareil (nom du set, visuel de
// référence) pour l'ajouter à la collection. Même accès que la reconnaissance.
export type ScanCardInfo = { name: string; setId: string; setName: string; localId: string; image: string | null };

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

  // Une carte japonaise reconnue sous une autre locale : son id n'existe qu'en JA
  let card = await catalogCard(id, lang).catch(() => null);
  if (!card && lang !== "ja") card = await catalogCard(id, "ja").catch(() => null);
  if (!card) return NextResponse.json({ error: "unknown" }, { status: 404 });
  const out: ScanCardInfo = { name: card.name, setId: card.set.id, setName: card.set.name, localId: card.localId, image: card.image ?? null };
  return NextResponse.json(out, { headers: { "cache-control": "private, max-age=3600" } });
}
