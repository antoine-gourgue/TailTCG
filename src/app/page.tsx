import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";
import {
  CollectionClient,
  type CollectionItem,
  type SourceRef,
} from "@/components/collection-client";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>;
}) {
  const { source: initialSource } = await searchParams;
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
        "id, tcgdex_id, card_name, set_name, set_id, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, source_id, graded, grade, created_at, current_price, gain"
      )
      .order("created_at", { ascending: false }),
    supabase.from("sources").select("id, name").order("name"),
  ]);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Collection
          </h1>
          <Link
            href="/recherche"
            className="rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white"
          >
            + Ajouter une carte
          </Link>
        </div>
        <CollectionClient
          items={(items ?? []) as CollectionItem[]}
          sources={(sources ?? []) as SourceRef[]}
          initialSource={initialSource ?? ""}
        />
      </main>
    </>
  );
}
