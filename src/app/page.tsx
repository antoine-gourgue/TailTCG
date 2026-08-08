import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { daysAgoISO } from "@/lib/domain";
import { signStorageImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import {
  CollectionClient,
  type CollectionItem,
  type SourceRef,
} from "@/components/collection-client";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; set?: string }>;
}) {
  const { source: initialSource, set: initialSet } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [{ data: items }, { data: sources }] = await Promise.all([
    supabase
      .from("collection_value")
      .select(
        "id, tcgdex_id, card_name, set_name, set_id, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, manual_price, source_id, graded, grade, created_at, current_price, gain, sold_price, sold_at"
      )
      .order("created_at", { ascending: false }),
    supabase.from("sources").select("id, name").order("name"),
  ]);

  // Rappel de réévaluation : cartes dont la valeur date de plus de N semaines
  const { data: settings } = await supabase
    .from("user_settings")
    .select("revalue_weeks")
    .eq("owner_id", user.id)
    .maybeSingle();

  let staleItems: { id: string; card_name: string }[] = [];
  const weeks = settings?.revalue_weeks ?? null;
  if (weeks && items && items.length > 0) {
    const { data: hist } = await supabase
      .from("item_value_history")
      .select("item_id, recorded_at")
      .order("recorded_at", { ascending: false });
    const lastByItem = new Map<string, string>();
    for (const h of hist ?? []) {
      if (!lastByItem.has(h.item_id)) lastByItem.set(h.item_id, h.recorded_at);
    }
    const cutoff = daysAgoISO(weeks * 7);
    staleItems = items
      .filter((i) => {
        const last = i.id ? lastByItem.get(i.id) : null;
        return last != null && last < cutoff;
      })
      .map((i) => ({ id: i.id as string, card_name: i.card_name as string }));
  }

  return (
    <>
      <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display text-3xl font-bold tracking-tight">Collection</h1>
          <Link href="/recherche" className="btn btn-primary">
            + Ajouter une carte
          </Link>
        </div>

        {staleItems.length > 0 && (
          <div className="panel mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-accent/40 bg-accent-soft/60 px-5 py-3.5 text-sm">
            <BellRing size={16} className="shrink-0 text-accent-strong" aria-hidden />
            <span className="font-medium">
              {staleItems.length} carte{staleItems.length > 1 ? "s" : ""} à
              réévaluer :
            </span>
            {staleItems.slice(0, 5).map((i, idx) => (
              <Link
                key={i.id}
                href={`/carte/${i.id}?edit`}
                className="text-accent-strong underline-offset-2 hover:underline"
              >
                {i.card_name}
                {idx < Math.min(staleItems.length, 5) - 1 ? "," : ""}
              </Link>
            ))}
            {staleItems.length > 5 && (
              <span className="text-muted">et {staleItems.length - 5} autres…</span>
            )}
          </div>
        )}
        <CollectionClient
          items={await signStorageImages((items ?? []) as CollectionItem[])}
          sources={(sources ?? []) as SourceRef[]}
          initialSource={initialSource ?? ""}
          initialSet={initialSet ?? ""}
        />
      </main>
      </AppShell>
    </>
  );
}
