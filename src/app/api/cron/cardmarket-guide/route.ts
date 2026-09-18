import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { refreshPriceGuide } from "@/lib/cardmarket-guide";

// Cron quotidien : rafraîchit le miroir du fichier public de Cardmarket
// (price_guide_6.json). Planifié après sa régénération (~02:49 Paris).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const report = await refreshPriceGuide(createAdminClient());
  const status = report.status === "error" ? 500 : 200;
  return NextResponse.json(report, { status });
}
