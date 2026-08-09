import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CardmarketPricing } from "@/lib/tcgdex";

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
      // Carte qui n'existe qu'en holo (Prime, EX…) : la série -holo est la
      // cote pertinente, `trend` mélange toutes les versions
      const holoOnly = card.variants?.holo === true && card.variants?.normal === false;
      const trend =
        (holoOnly ? cm?.["trend-holo"] ?? cm?.trend : cm?.trend ?? cm?.["trend-holo"]) ??
        null;
      const low =
        (holoOnly ? cm?.["low-holo"] ?? cm?.low : cm?.low ?? cm?.["low-holo"]) ?? null;
      const avg30 =
        (holoOnly ? cm?.["avg30-holo"] ?? cm?.avg30 : cm?.avg30 ?? cm?.["avg30-holo"]) ??
        null;

      if (trend == null && low == null && avg30 == null) {
        skipped++;
      } else {
        const { error: upsertError } = await admin
          .from("price_snapshots")
          .upsert(
            { tcgdex_id: id, captured_at: today, trend, low, avg30 },
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
