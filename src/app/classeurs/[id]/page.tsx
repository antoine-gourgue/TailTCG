import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Trash2, ListChecks, ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { binderColorHex } from "@/lib/binder-colors";
import { binderDesign } from "@/lib/binder-design";
import { pageGrid, pocketsPerPage } from "@/lib/binder-pages";
import { coverRenderFor } from "@/lib/binder-cover-server";
import { AppShell } from "@/components/app-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { RenameBinderButton } from "@/components/rename-binder-button";
import { BinderStyleButton } from "@/components/binder-style-button";
import { BinderShareButton } from "@/components/binder-share-button";
import { BinderPages, type PocketItem } from "@/components/binder-pages";
import { ViewToggle } from "@/components/view-toggle";
import { deleteBinder } from "@/app/classeurs/actions";
import {
  CollectionClient,
  type CollectionItem,
  type SourceRef,
} from "@/components/collection-client";

export const metadata = {
  title: "Classeur — TailTCG",
};

export default async function ClasseurPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const [{ id }, { vue }] = await Promise.all([params, searchParams]);
  // Pages (classeur simulé) par défaut, grille classique sur demande
  const mode = vue === "grille" ? "grille" : "pages";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: binder } = await supabase
    .from("binders")
    .select("id, name, color, cover_item_ids, style, page_grid, design, page_count, cover")
    .eq("id", id)
    .maybeSingle();
  if (!binder) notFound();
  const design = binderDesign(binder.design);

  const [
    { data: links },
    { data: sources },
    { data: allBinders },
    { data: settings },
    { data: wanted },
  ] = await Promise.all([
      supabase
        .from("binder_items")
        .select("item_id, position")
        .eq("binder_id", id),
      supabase.from("sources").select("id, name").order("name"),
      supabase.from("binders").select("id, name").order("name"),
      supabase
        .from("user_settings")
        .select("share_token")
        .eq("owner_id", user.id)
        .maybeSingle(),
      // Cartes hors collection rangées dans ce classeur
      supabase
        .from("binder_placeholders")
        .select("id, tcgdex_id, card_name, set_name, local_id, image_url, position, created_at")
        .eq("binder_id", id),
    ]);

  const memberIds = (links ?? []).map((l) => l.item_id);
  const memberSet = new Set(memberIds);
  // Toute la collection : les cartes du classeur, et les candidates pour
  // remplir une pochette vide depuis les pages
  const { data: items } = await supabase
    .from("collection_value")
    .select(
      "id, tcgdex_id, card_name, set_name, set_id, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, manual_price, source_id, graded, grade, created_at, current_price, gain, sold_price, sold_at"
    )
    .order("created_at", { ascending: false });
  const allIds = (items ?? [])
    .map((i) => i.id)
    .filter((id): id is string => id != null);

  // Photos perso en secours de vignette (cartes sans scan officiel)
  const photoFallbacks = new Map<string, string>();
  if (allIds.length > 0) {
    const { data: allPhotos } = await supabase
      .from("item_photos")
      .select("item_id, path, position")
      .in("item_id", allIds)
      .order("position");
    const firstByItem = new Map<string, string>();
    for (const p of allPhotos ?? []) {
      if (!firstByItem.has(p.item_id)) firstByItem.set(p.item_id, p.path);
    }
    if (firstByItem.size > 0) {
      const admin = createAdminClient();
      const paths = [...firstByItem.values()];
      const { data: signed } = await admin.storage
        .from("card-photos")
        .createSignedUrls(paths, 3600);
      const urlByPath = new Map(paths.map((p, i) => [p, signed?.[i]?.signedUrl]));
      for (const [itemId, path] of firstByItem) {
        const url = urlByPath.get(path);
        if (url) photoFallbacks.set(itemId, url);
      }
    }
  }

  const { data: gradings } = await supabase
    .from("item_gradings")
    .select("item_id, rectified_path")
    .order("created_at", { ascending: false });

  const positionByItem = new Map(
    (links ?? []).map((l) => [l.item_id, l.position])
  );
  const signedAll = (
    await applyRectifiedImages(
      gradings,
      await signStorageImages((items ?? []) as CollectionItem[], user.id),
      user.id
    )
  ).map((i) => ({
    ...i,
    photo_fallback: photoFallbacks.get(i.id) ?? null,
    position: positionByItem.get(i.id) ?? null,
  }));
  const signedItems = signedAll.filter((i) => memberSet.has(i.id));
  // Pochettes : exemplaires possédés et cartes hors collection
  const pocketItems: PocketItem[] = [
    ...signedItems.map((i) => ({
      id: `i:${i.id}`,
      kind: "owned" as const,
      card_name: i.card_name,
      set_name: i.set_name,
      local_id: i.local_id,
      tcgdex_id: i.tcgdex_id,
      image_url: i.image_url,
      photo_fallback: i.photo_fallback,
      quantity: i.quantity,
      position: i.position,
      created_at: i.created_at,
    })),
    ...(wanted ?? []).map((w) => ({
      id: `w:${w.id}`,
      kind: "wanted" as const,
      card_name: w.card_name,
      set_name: w.set_name,
      local_id: w.local_id,
      tcgdex_id: w.tcgdex_id,
      image_url: w.image_url ?? "",
      quantity: 1,
      position: w.position,
      created_at: w.created_at ?? "",
    })),
  ];
  // Résumé d'en-tête : pages réellement occupées selon le format
  const grid = pageGrid(binder.page_grid);
  const lastPocket = Math.max(-1, ...pocketItems.map((p) => p.position ?? -1));
  const pagesUsed = Math.max(
    1,
    Math.ceil((lastPocket + 1) / pocketsPerPage(grid)),
    binder.page_count
  );
  const candidates = signedAll
    .filter((i) => i.sold_at == null)
    .map((i) => ({
      id: i.id,
      tcgdex_id: i.tcgdex_id,
      card_name: i.card_name,
      set_name: i.set_name,
      local_id: i.local_id,
      image_url: i.image_url,
      photo_fallback: i.photo_fallback,
      quantity: i.quantity,
    }));
  // Couverture fermée : cartes choisies, sinon les quatre premières avec image
  const withImage = signedItems
    .map((i) => ({ id: i.id, image_url: i.image_url || i.photo_fallback || "" }))
    .filter((i) => i.image_url);
  const chosen = (binder.cover_item_ids ?? [])
    .map((id) => withImage.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => i != null);
  const covers = chosen.length > 0 ? chosen : withImage.slice(0, 4);
  // Couverture sur mesure (style « custom ») : images signées, cartes résolues
  const coverRender = await coverRenderFor(
    binder.style,
    binder.cover,
    user.id,
    (itemId) => signedAll.find((i) => i.id === itemId)?.image_url || null
  );

  return (
    <AppShell>
      <main
        className={`relative z-10 mx-auto w-full px-4 ${
          // Les pages face à face ont besoin de largeur, et de toute la
          // hauteur de l'écran : en-tête compact
          mode === "pages" ? "max-w-[1400px] pb-3 pt-5" : "max-w-6xl py-8"
        }`}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/classeurs"
              aria-label="Retour aux classeurs"
              title="Classeurs"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
            >
              <ChevronLeft size={16} aria-hidden />
            </Link>
            <div className="min-w-0">
              <h1 className="display truncate text-2xl font-bold tracking-tight">
                {binder.name}
              </h1>
              <p className="num text-xs text-muted">
                {pocketItems.length} carte{pocketItems.length > 1 ? "s" : ""} ·{" "}
                {pagesUsed} page{pagesUsed > 1 ? "s" : ""} · {grid.cols}×{grid.rows}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewToggle base={`/classeurs/${binder.id}`} current={mode} />
            <BinderShareButton
              binderId={binder.id}
              shareToken={settings?.share_token ?? null}
            />
            <BinderStyleButton
              binderId={binder.id}
              name={binder.name}
              color={binder.color}
              styleCode={binder.style}
              pageGridCode={binder.page_grid}
              design={design}
              coverRender={coverRender}
              coverIds={binder.cover_item_ids ?? []}
              items={signedItems.map((i) => ({
                id: i.id,
                card_name: i.card_name,
                image_url: i.photo_fallback && !i.image_url ? i.photo_fallback : i.image_url,
              }))}
            />
            <RenameBinderButton binderId={binder.id} currentName={binder.name} />
            <ConfirmAction
              action={deleteBinder}
              fields={{ binder_id: binder.id }}
              title="Supprimer ce classeur ?"
              message="Le classeur disparaît mais tes cartes restent dans ta collection — rien n'est vendu ni supprimé."
              trigger={<Trash2 size={15} aria-hidden />}
              triggerClassName="btn btn-ghost !px-2.5"
              triggerAriaLabel="Supprimer le classeur"
            />
          </div>
        </div>

        {mode === "pages" ? (
          <BinderPages
            binderId={binder.id}
            name={binder.name}
            items={pocketItems}
            candidates={candidates}
            gridCode={binder.page_grid}
            colorHex={binderColorHex(binder.color)}
            cover={{ style: binder.style, covers, layout: coverRender }}
            design={design}
            pageCount={binder.page_count}
            hrefBase="/carte/"
          />
        ) : signedItems.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <ListChecks size={44} strokeWidth={1.3} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Ce classeur est vide</p>
            <p className="max-w-sm text-sm text-muted">
              Ouvre ta collection en mode sélection, coche les cartes à ranger
              ici, puis « Ajouter à un classeur ».
            </p>
            <Link href="/?select" className="btn btn-primary mt-2">
              Choisir des cartes
            </Link>
          </div>
        ) : (
          // L'ordre des pochettes fait référence : la grille n'est plus réordonnable
          <CollectionClient
            items={signedItems}
            sources={(sources ?? []) as SourceRef[]}
            binders={(allBinders ?? []).filter((b) => b.id !== binder.id)}
            binderContext={{ id: binder.id, name: binder.name }}
          />
        )}
      </main>
    </AppShell>
  );
}
