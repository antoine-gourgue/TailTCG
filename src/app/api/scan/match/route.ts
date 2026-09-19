import { NextResponse, type NextRequest } from "next/server";
import { canScan } from "@/lib/scan/access";
import { loadCaptureByToken } from "@/lib/capture";
import sharp from "sharp";
import { hashCardVariants } from "@/lib/scan/phash.mjs";
import { matchCard } from "@/lib/scan/index";

// Reconnaît une carte à partir d'une image (JPEG de la carte redressée).
// Accessible au téléphone via un jeton de session de capture (relais QR) ou
// à un compte connecté (scan direct sur mobile).
export const maxDuration = 10;
const MAX_BYTES = 1_500_000;

export async function POST(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  if (token) {
    const session = await loadCaptureByToken(token);
    if (!session || session.kind !== "detect" || session.status !== "pending") {
      return NextResponse.json({ error: "session" }, { status: 403 });
    }
  } else if (!(await canScan())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES) {
    return NextResponse.json({ error: "image" }, { status: 400 });
  }
  try {
    // Plusieurs cadrages de la même photo : tolère un cadre décalé ou tourné
    let result = matchCard(await hashCardVariants(buf));
    if (result.status === "none") {
      // Carte tenue à l'envers : on retente tête en bas
      const flipped = await sharp(buf).rotate(180).jpeg({ quality: 85 }).toBuffer();
      const again = matchCard(await hashCardVariants(flipped));
      if (again.status !== "none") result = again;
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "image" }, { status: 400 });
  }
}
