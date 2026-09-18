import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cardmarketReference, pickCardmarket, type CardmarketPricing } from "@/lib/tcgdex";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { guideReference } from "@/lib/cardmarket";

// Cron Vercel quotidien (vercel.json, 0 6 * * *) : relève les cotes Cardmarket
// via TCGdex pour chaque carte possédée et alimente price_snapshots.
// Sert aussi de ping quotidien à Supabase (évite la pause du projet gratuit).

export const maxDuration = 60;

const TCGDEX_BASE = "https://api.tcgdex.net/v2/fr";
const DELAY_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Purge de la corbeille : suppression définitive après 30 jours
  await admin
    .from("items")
    .delete()
    .lt(
      "deleted_at",
      new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()
    );

  const { data: rows, error } = await admin.from("items").select("tcgdex_id");
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Les cartes ajoutées à la main (custom:) n'existent pas chez TCGdex
  const ids = [...new Set((rows ?? []).map((r) => r.tcgdex_id))].filter(
    (id) => !id.startsWith("custom:")
  );
  const today = new Date().toISOString().slice(0, 10);
  let updated = 0;
  let skipped = 0;

  for (const id of ids) {
    try {
      const res = await fetch(`${TCGDEX_BASE}/cards/${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        skipped++;
        continue;
      }
      const card: {
        pricing?: { cardmarket?: CardmarketPricing };
        variants?: { normal?: boolean; holo?: boolean };
      } = await res.json();
      const cm = card.pricing?.cardmarket;
      const { trend, low, avg30 } = pickCardmarket(cm, card.variants);

      // Prix de référence : idProduct corrigé → guide public → repli TCGdex
      const idProduct = overrideCardmarketId(id, cm?.idProduct);
      let reference = cardmarketReference(cm);
      if (idProduct != null) {
        const { data: g } = await admin
          .from("cardmarket_price_guide")
          .select("trend, avg7, avg30, avg1, avg")
          .eq("id_product", idProduct)
          .maybeSingle();
        const gr = g ? guideReference(g) : null;
        if (gr != null) reference = gr;
      }

      if (trend == null && low == null && avg30 == null && reference == null) {
        skipped++;
      } else {
        const { error: upsertError } = await admin
          .from("price_snapshots")
          .upsert(
            { tcgdex_id: id, captured_at: today, trend, low, avg30, reference },
            { onConflict: "tcgdex_id,captured_at" }
          );
        if (upsertError) skipped++;
        else updated++;
      }
    } catch {
      skipped++;
    }
    await sleep(DELAY_MS);
  }

  return NextResponse.json({ cards: ids.length, updated, skipped, date: today });
}
