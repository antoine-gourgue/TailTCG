import { NextResponse, type NextRequest } from "next/server";
import { currentUserId } from "@/lib/supabase/server";
import { loadCaptureByToken } from "@/lib/capture";
import { hashCardVariants } from "@/lib/scan/phash.mjs";
import { matchCard } from "@/lib/scan/index";

// Reconnaît une carte à partir d'une image (JPEG recadré sur le cadre-guide).
// Accessible au téléphone via un jeton de session de capture (relais QR) ou à
// un utilisateur connecté (scan direct sur mobile). ~300 ms bout en bout.
export const maxDuration = 10;
const MAX_BYTES = 1_500_000;

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const session = await loadCaptureByToken(token);
    if (!session || session.kind !== "detect" || session.status !== "pending") {
      return NextResponse.json({ error: "session" }, { status: 403 });
    }
  } else if (!(await currentUserId())) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "image" }, { status: 400 });
  }
  try {
    // Plusieurs cadrages de la même photo : tolère un cadre décalé ou tourné
    const variants = await hashCardVariants(buf);
    return NextResponse.json(matchCard(variants));
  } catch {
    return NextResponse.json({ error: "image" }, { status: 400 });
  }
}
