import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
  return NextResponse.json({
    status: session.status,
    kind: session.kind,
    result: session.result,
  });
}
