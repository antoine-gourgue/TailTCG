import { redirect } from "next/navigation";
import { NotebookTabs } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { binderColorHex } from "@/lib/binder-colors";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import { BindersGrid } from "@/components/binders-grid";
import { NewBinderButton } from "@/components/new-binder-button";

export const metadata = {
  title: "Classeurs — TailTCG",
};

type CoverItem = { image_url: string };

export default async function ClasseursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: binders }, { data: links }, { data: items }] = await Promise.all([
    supabase
      .from("binders")
      .select("id, name, created_at, color, cover_item_ids, style")
      .order("position", { nullsFirst: false })
      .order("created_at"),
    supabase
      .from("binder_items")
      .select("binder_id, item_id, added_at")
      .order("added_at"),
    supabase
      .from("collection_value")
      .select("id, image_url, quantity, current_price"),
  ]);
  const { data: gradings } = await supabase
    .from("item_gradings")
    .select("item_id, rectified_path")
    .order("created_at", { ascending: false });

  const signedItems = await signStorageImages(
    (items ?? []) as { id: string; image_url: string; quantity: number; current_price: number | null }[],
    user.id
  );
  const rectifiedItems = await applyRectifiedImages(gradings, signedItems, user.id);
  const itemById = new Map(rectifiedItems.map((i) => [i.id, i]));

  const enriched = (binders ?? []).map((b) => {
    const memberIds = (links ?? [])
      .filter((l) => l.binder_id === b.id)
      .map((l) => l.item_id);
    let count = 0;
    let value = 0;
    let hasValue = false;
    const covers: CoverItem[] = [];
    for (const id of memberIds) {
      const item = itemById.get(id);
      if (!item) continue;
      count += item.quantity;
      if (item.current_price != null) {
        value += item.current_price * item.quantity;
        hasValue = true;
      }
      if (covers.length < 4 && item.image_url) covers.push(item);
    }
    // Couverture choisie par l'utilisateur, sinon les 4 premières
    const chosen = (b.cover_item_ids ?? [])
      .map((id) => itemById.get(id))
      .filter((i): i is NonNullable<typeof i> => i != null && !!i.image_url);
    return {
      id: b.id,
      name: b.name,
      style: b.style,
      colorHex: binderColorHex(b.color),
      count,
      value: hasValue ? value : null,
      covers: chosen.length > 0 ? chosen : covers,
    };
  });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display text-3xl font-bold tracking-tight">Classeurs</h1>
          <NewBinderButton />
        </div>

        {enriched.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <NotebookTabs size={48} strokeWidth={1.2} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Aucun classeur</p>
            <p className="max-w-sm text-sm text-muted">
              Crée des sous-collections thématiques — toutes tes Pikachu, tes
              primes, tes gradées — puis sélectionne les cartes de ta collection
              à y ranger.
            </p>
          </div>
        ) : (
          <BindersGrid
            key={enriched.map((b) => b.id).join("|")}
            binders={enriched}
          />
        )}
      </main>
    </AppShell>
  );
}
