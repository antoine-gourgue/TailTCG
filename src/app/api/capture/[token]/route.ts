import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadCaptureByToken } from "@/lib/capture";

// Desktop (authentifié) : interroge l'état de SA session de capture
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const session = await loadCaptureByToken(token);
  if (!session || session.owner_id !== user.id) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  // Pré-gradation : le desktop a besoin de lire les calques déposés (bucket privé) → URLs signées 1 h
  if (session.kind === "grade" && session.status === "done") {
    const r = (session.result ?? {}) as { recto?: string; verso?: string; recto_raw?: boolean; verso_raw?: boolean };
    const paths = [r.recto, r.verso].filter((p): p is string => !!p);
    const { data: signed } = await createAdminClient().storage.from("card-photos").createSignedUrls(paths, 3600);
    const urlOf = (path?: string) => (path ? (signed?.[paths.indexOf(path)]?.signedUrl ?? null) : null);
    return NextResponse.json({
      status: session.status,
      kind: session.kind,
      result: { rectoUrl: urlOf(r.recto), versoUrl: urlOf(r.verso), raw: { recto: !!r.recto_raw, verso: !!r.verso_raw } },
    });
  }
  return NextResponse.json({
    status: session.status,
    kind: session.kind,
    result: session.result,
  });
}
