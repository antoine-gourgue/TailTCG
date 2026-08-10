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
  const query = String(body?.query ?? "").slice(0, 120).trim();
  if (!query) return NextResponse.json({ error: "empty" }, { status: 400 });

  const db = createAdminClient();
  const { error } = await db
    .from("capture_sessions")
    .update({ status: "done", result: { query } })
    .eq("id", session.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
