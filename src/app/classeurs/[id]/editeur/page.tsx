import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { fetchSeriesWithSets } from "@/lib/tcgdex";
import { binderDesign } from "@/lib/binder-design";
import { coverLayout, coverStoragePaths } from "@/lib/binder-cover";
import { AppShell } from "@/components/app-shell";
import { BinderEditor } from "@/components/binder-editor";

export const metadata = {
  title: "Personnaliser le classeur — TailTCG",
};

type CardRow = { id: string; card_name: string; image_url: string };

// Éditeur unifié du classeur : couverture + intérieur, aperçu fermé/ouvert
export default async function EditeurPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: binder } = await supabase
    .from("binders")
    .select("id, name, color, style, page_grid, cover_item_ids, design, cover")
    .eq("id", id)
    .maybeSingle();
  if (!binder) notFound();

  const [{ data: links }, { data: gradings }, series] = await Promise.all([
    supabase.from("binder_items").select("item_id").eq("binder_id", id),
    supabase
      .from("item_gradings")
      .select("item_id, rectified_path")
      .order("created_at", { ascending: false }),
    // Logos et symboles d'extension (TCGdex, cache 24 h) — vide si injoignable
    fetchSeriesWithSets("fr").catch(() => []),
  ]);

  // Cartes du classeur : cartes de couverture, fond ou zones, aperçu ouvert
  const memberIds = (links ?? []).map((l) => l.item_id);
  const { data: items } =
    memberIds.length > 0
      ? await supabase
          .from("collection_value")
          .select("id, card_name, image_url")
          .in("id", memberIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  const cards = (
    await applyRectifiedImages(
      gradings,
      await signStorageImages((items ?? []) as CardRow[], user.id),
      user.id
    )
  )
    .filter((i) => i.image_url)
    .map((i) => ({ id: i.id, name: i.card_name, image_url: i.image_url }));

  // Images déjà importées : URLs signées 1 h, bornées au propriétaire
  const layout = coverLayout(binder.cover);
  const paths = coverStoragePaths(layout).filter((p) => p.startsWith(`${user.id}/`));
  const urls: Record<string, string> = {};
  if (paths.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin.storage.from("card-photos").createSignedUrls(paths, 3600);
    paths.forEach((p, i) => {
      const u = data?.[i]?.signedUrl;
      if (u) urls[p] = u;
    });
  }

  const sets = series.flatMap((s) =>
    s.sets
      .filter((x) => x.logo || x.symbol)
      .map((x) => ({
        id: x.id,
        name: x.name,
        serie: s.name,
        logo: x.logo ?? null,
        symbol: x.symbol ?? null,
      }))
  );

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 pb-8 pt-5">
        <BinderEditor
          binderId={binder.id}
          name={binder.name}
          initialStyle={binder.style}
          initialColor={binder.color}
          initialCoverIds={binder.cover_item_ids ?? []}
          initialGrid={binder.page_grid}
          initialDesign={binderDesign(binder.design)}
          initialLayout={layout}
          initialUrls={urls}
          cards={cards}
          sets={sets}
        />
      </main>
    </AppShell>
  );
}
