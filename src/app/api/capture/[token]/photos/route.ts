import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCaptureByToken } from "@/lib/capture";

export const maxDuration = 60;

// Téléphone : envoie une ou plusieurs photos rattachées à l'exemplaire
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await loadCaptureByToken(token);
  if (!session || session.kind !== "photos" || !session.item_id) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const form = await req.formData();
  const files = form.getAll("photos").filter((f): f is File => f instanceof File);
  if (files.length === 0) return NextResponse.json({ error: "empty" }, { status: 400 });

  const db = createAdminClient();
  const { count } = await db
    .from("item_photos")
    .select("id", { count: "exact", head: true })
    .eq("item_id", session.item_id);

  let uploaded = 0;
  for (const [i, file] of files.slice(0, 10).entries()) {
    if (file.size === 0 || file.size > 5_000_000 || !file.type.startsWith("image/")) continue;
    const path = `${session.owner_id}/${session.item_id}/${randomUUID()}.jpg`;
    const { error: upErr } = await db.storage
      .from("card-photos")
      .upload(path, file, { contentType: "image/jpeg" });
    if (upErr) continue;
    const { error: dbErr } = await db.from("item_photos").insert({
      owner_id: session.owner_id,
      item_id: session.item_id,
      path,
      label: null,
      position: (count ?? 0) + i,
    });
    if (dbErr) {
      await db.storage.from("card-photos").remove([path]);
      continue;
    }
    uploaded += 1;
  }

  if (uploaded > 0) {
    await db.from("capture_sessions").update({ status: "done", result: { uploaded } }).eq("id", session.id);
  }
  return NextResponse.json({ ok: true, uploaded });
}
