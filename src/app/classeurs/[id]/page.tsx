import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Trash2, ListChecks } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import { ConfirmAction } from "@/components/confirm-action";
import { RenameBinderButton } from "@/components/rename-binder-button";
import { BinderStyleButton } from "@/components/binder-style-button";
import { BinderShareButton } from "@/components/binder-share-button";
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
    .select("id, name, color, cover_item_ids, style")
    .eq("id", id)
    .maybeSingle();
  if (!binder) notFound();

  const [{ data: links }, { data: sources }, { data: allBinders }, { data: settings }] =
    await Promise.all([
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
    ]);

  const memberIds = (links ?? []).map((l) => l.item_id);
  const { data: items } =
    memberIds.length > 0
      ? await supabase
          .from("collection_value")
          .select(
            "id, tcgdex_id, card_name, set_name, set_id, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, manual_price, source_id, graded, grade, created_at, current_price, gain, sold_price, sold_at"
          )
          .in("id", memberIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  // Photos perso en secours de vignette (cartes sans scan officiel)
  const photoFallbacks = new Map<string, string>();
  if (memberIds.length > 0) {
    const { data: allPhotos } = await supabase
      .from("item_photos")
      .select("item_id, path, position")
      .in("item_id", memberIds)
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
  const signedItems = (
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

  return (
    <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <Link
          href="/classeurs"
          className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
        >
          ← Classeurs
        </Link>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display text-3xl font-bold tracking-tight">
            {binder.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <BinderShareButton
              binderId={binder.id}
              shareToken={settings?.share_token ?? null}
            />
            <BinderStyleButton
              binderId={binder.id}
              color={binder.color}
              styleCode={binder.style}
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

        {signedItems.length === 0 ? (
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
          <CollectionClient
            items={signedItems}
            sources={(sources ?? []) as SourceRef[]}
            binders={(allBinders ?? []).filter((b) => b.id !== binder.id)}
            binderContext={{ id: binder.id, name: binder.name }}
            orderable
          />
        )}
      </main>
    </AppShell>
  );
}
