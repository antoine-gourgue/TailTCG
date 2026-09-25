import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCaptureByToken } from "@/lib/capture";

export const maxDuration = 60;

// Téléphone : dépose les calques recto (et verso) redressés d'une pré-gradation
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await loadCaptureByToken(token);
  if (!session || session.kind !== "grade" || session.status !== "pending") {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const form = await req.formData();
  const db = createAdminClient();
  const result: { recto?: string; verso?: string; recto_raw?: boolean; verso_raw?: boolean } = {};
  // prise brute = photo entière, l'atelier retrouvera le cadre
  if (form.get("recto_raw") === "1") result.recto_raw = true;
  if (form.get("verso_raw") === "1") result.verso_raw = true;
  for (const face of ["recto", "verso"] as const) {
    const file = form.get(face);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > 5_000_000 || !file.type.startsWith("image/")) continue;
    const webp = file.type === "image/webp";
    const path = `${session.owner_id}/captures/${session.id}-${face}.${webp ? "webp" : "jpg"}`;
    const { error } = await db.storage.from("card-photos").upload(path, file, { contentType: webp ? "image/webp" : "image/jpeg", upsert: true });
    if (!error) result[face] = path;
  }
  if (!result.recto) return NextResponse.json({ error: "empty" }, { status: 400 });
  await db.from("capture_sessions").update({ status: "done", result }).eq("id", session.id);
  return NextResponse.json({ ok: true });
}
