import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { daysAgoISO } from "@/lib/domain";
import { repairCatalogImages, signStorageImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import { RevalueClient, type RevalueItem } from "./revalue-client";

export const metadata = {
  title: "Réévaluer — TailTCG",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Réévaluation des cartes : valeur actuelle et sa date, cote Cardmarket du
 * dernier relevé (lien vers la carte), nouvelle valeur carte par carte ou en
 * masse. `?ids=` : cartes choisies dans la sélection de la page Cartes.
 */
export default async function RevaluePage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: items }, { data: settings }, { data: hist }] = await Promise.all([
    supabase
      .from("collection_value")
      .select(
        "id, tcgdex_id, card_name, set_name, local_id, image_url, language, condition, quantity, graded, grade, manual_price, purchase_price, sold_at"
      )
      .is("sold_at", null)
      .order("created_at", { ascending: false }),
    supabase.from("user_settings").select("revalue_weeks").eq("owner_id", user.id).maybeSingle(),
    supabase.from("item_value_history").select("item_id, recorded_at").order("recorded_at", { ascending: false }),
  ]);

  const lastByItem = new Map<string, string>();
  for (const h of hist ?? []) if (!lastByItem.has(h.item_id)) lastByItem.set(h.item_id, h.recorded_at);

  // Cote Cardmarket du dernier relevé (moins de 10 jours), comme la page Cartes
  const marketByTcgdex = new Map<string, number>();
  const tcgIds = [
    ...new Set((items ?? []).map((i) => i.tcgdex_id).filter((x): x is string => !!x && !x.startsWith("custom:"))),
  ];
  if (tcgIds.length > 0) {
    const admin = createAdminClient();
    for (let i = 0; i < tcgIds.length; i += 500) {
      const { data: snaps } = await admin
        .from("price_snapshots")
        .select("tcgdex_id, reference, captured_at")
        .in("tcgdex_id", tcgIds.slice(i, i + 500))
        .not("reference", "is", null)
        .gte("captured_at", daysAgoISO(10))
        .order("captured_at", { ascending: false });
      for (const s of snaps ?? []) {
        if (s.reference != null && !marketByTcgdex.has(s.tcgdex_id)) marketByTcgdex.set(s.tcgdex_id, s.reference);
      }
    }
  }

  const weeks = settings?.revalue_weeks ?? null;
  const cutoff = weeks ? daysAgoISO(weeks * 7) : null;
  const rows = await signStorageImages(
    await repairCatalogImages(
      supabase,
      (items ?? []).filter((i): i is typeof i & { id: string } => !!i.id)
    ),
    user.id
  );

  const list: RevalueItem[] = rows.map((i) => {
    const last = lastByItem.get(i.id) ?? null;
    return {
      id: i.id,
      tcgdex_id: i.tcgdex_id,
      card_name: i.card_name ?? "Carte",
      set_name: i.set_name ?? "",
      local_id: i.local_id ?? "",
      image_url: i.image_url,
      language: i.language ?? "FR",
      condition: i.condition ?? "NM",
      quantity: i.quantity ?? 1,
      graded: i.graded ?? false,
      grade: i.grade ?? null,
      manual_price: i.manual_price,
      purchase_price: i.purchase_price,
      last_valued: last,
      stale: last != null && cutoff != null && last < cutoff,
      market: i.tcgdex_id ? marketByTcgdex.get(i.tcgdex_id) ?? null : null,
    };
  });

  const picked = (ids ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => UUID_RE.test(s));

  return (
    <AppShell>
      <main className="relative z-10 page py-6 sm:py-8">
        <RevalueClient items={list} weeks={weeks} picked={picked} />
      </main>
    </AppShell>
  );
}
