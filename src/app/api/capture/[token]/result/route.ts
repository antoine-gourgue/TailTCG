import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCaptureByToken } from "@/lib/capture";
import { isScanLang } from "@/lib/scan/url";

// Téléphone : dépose une carte reconnue. La session reste ouverte, on peut
// en envoyer autant qu'on veut ; elles s'affichent en direct sur
// l'ordinateur (/scan/<session>), qui les ajoute une à une ou d'un coup.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await loadCaptureByToken(token);
  if (!session || session.kind !== "detect" || session.status !== "pending") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const str = (k: string, max: number) => String(body?.[k] ?? "").slice(0, max).trim();
  const cardId = str("cardId", 60);
  const name = str("name", 120);
  const setId = str("setId", 40);
  const setName = str("setName", 120);
  const localId = str("localId", 20);
  if (!cardId || !name || !setId || !setName || !localId) {
    return NextResponse.json({ error: "empty" }, { status: 400 });
  }
  const langRaw = str("lang", 5);
  const lang = isScanLang(langRaw) ? langRaw : "fr";

  const db = createAdminClient();
  const { error } = await db.from("capture_scans").insert({
    session_id: session.id,
    owner_id: session.owner_id,
    tcgdex_id: cardId,
    lang,
    name,
    set_id: setId,
    set_name: setName,
    local_id: localId,
    image: str("image", 200),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const { count } = await db
    .from("capture_scans")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session.id);
  return NextResponse.json({ ok: true, count: count ?? 0 });
}
