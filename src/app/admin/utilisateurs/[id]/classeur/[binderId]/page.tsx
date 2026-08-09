import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { AdminBinderRename } from "@/components/admin/admin-binder-rename";
import { AdminBinderCards, type BinderCard } from "@/components/admin/admin-binder-cards";

export default async function AdminBinderDetail({
  params,
}: {
  params: Promise<{ id: string; binderId: string }>;
}) {
  const { id, binderId } = await params;
  const db = createAdminClient();

  const { data: binder } = await db
    .from("binders")
    .select("id, name, owner_id")
    .eq("id", binderId)
    .maybeSingle();
  if (!binder || binder.owner_id !== id) notFound();

  // Toutes les cartes vivantes de l'utilisateur + appartenance au classeur
  const [{ data: rawItems }, { data: links }, { data: gradings }, { data: allPhotos }] = await Promise.all([
    db.from("items").select("id, card_name, set_name, local_id, image_url").eq("owner_id", id).is("deleted_at", null),
    db.from("binder_items").select("item_id").eq("binder_id", binderId),
    db.from("item_gradings").select("item_id, rectified_path").eq("owner_id", id).order("created_at", { ascending: false }),
    db.from("item_photos").select("item_id, path, position").eq("owner_id", id).order("position"),
  ]);

  // Photo perso (1re par carte) en repli de vignette
  const firstPhoto = new Map<string, string>();
  for (const p of allPhotos ?? []) if (!firstPhoto.has(p.item_id)) firstPhoto.set(p.item_id, p.path);
  const photoUrl = new Map<string, string>();
  if (firstPhoto.size > 0) {
    const paths = [...firstPhoto.values()];
    const { data: signed } = await db.storage.from("card-photos").createSignedUrls(paths, 3600);
    const byPath = new Map(paths.map((p, i) => [p, signed?.[i]?.signedUrl]));
    for (const [itemId, path] of firstPhoto) {
      const u = byPath.get(path);
      if (u) photoUrl.set(itemId, u);
    }
  }

  const all = (
    await applyRectifiedImages(
      gradings,
      await signStorageImages((rawItems ?? []) as BinderCard[], id),
      id
    )
  ).map((i) => ({ ...i, photo_fallback: photoUrl.get(i.id) ?? null }));
  const memberIds = new Set((links ?? []).map((l) => l.item_id));
  const members = all.filter((i) => memberIds.has(i.id));
  const candidates = all.filter((i) => !memberIds.has(i.id));

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/utilisateurs/${id}`} className="text-sm text-muted transition hover:text-foreground">
        ← Retour au compte
      </Link>

      <div>
        <h2 className="display text-2xl font-bold tracking-tight">{binder.name}</h2>
      </div>

      <AdminBinderRename binderId={binderId} ownerId={id} initialName={binder.name} />

      <AdminBinderCards
        binderId={binderId}
        ownerId={id}
        members={members}
        candidates={candidates}
      />
    </div>
  );
}
