import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCaptureByToken } from "@/lib/capture";

// Téléphone : dépose le résultat de détection (requête de recherche)
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
  const query = str("query", 120);
  // Carte reconnue par image : son id TCGdex ouvre directement la fiche d'ajout
  const cardId = str("cardId", 60);
  if (!query && !cardId) return NextResponse.json({ error: "empty" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db
    .from("capture_sessions")
    .update({
      status: "done",
      result: {
        query,
        cardId: cardId || null,
        lang: str("lang", 5),
        name: str("name", 120),
        setName: str("setName", 120),
        localId: str("localId", 20),
        image: str("image", 200),
      },
    })
    .eq("id", session.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
