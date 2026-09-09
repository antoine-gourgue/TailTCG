import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { binderColorHex } from "@/lib/binder-colors";
import { binderDesign } from "@/lib/binder-design";
import { coverRenderFor } from "@/lib/binder-cover-server";
import { fetchSetsIndex } from "@/lib/tcgdex";
import { BinderPages, type PocketItem } from "@/components/binder-pages";
import { CleanViewProvider, CleanViewToggle } from "@/components/binder-clean-view";
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
    .select(
      "id, name, owner_id, color, page_grid, style, cover_item_ids, design, cover, page_count"
    )
    .eq("id", binderId)
    .maybeSingle();
  if (!binder || binder.owner_id !== id) notFound();

  // Toutes les cartes vivantes de l'utilisateur + appartenance au classeur,
  // cartes hors collection rangées dans ce classeur
  const [{ data: rawItems }, { data: links }, { data: placeholders }, { data: gradings }, { data: allPhotos }] =
    await Promise.all([
      db
        .from("items")
        .select("id, card_name, set_name, local_id, tcgdex_id, image_url, quantity, created_at")
        .eq("owner_id", id)
        .is("deleted_at", null),
      db.from("binder_items").select("item_id, position").eq("binder_id", binderId),
      db
        .from("binder_placeholders")
        .select("id, tcgdex_id, card_name, set_name, local_id, image_url, position, created_at")
        .eq("binder_id", binderId),
      db
        .from("item_gradings")
        .select("item_id, rectified_path")
        .eq("owner_id", id)
        .order("created_at", { ascending: false }),
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
      await signStorageImages((rawItems ?? []) as (BinderCard & { quantity: number; tcgdex_id: string; created_at: string })[], id),
      id
    )
  ).map((i) => ({ ...i, photo_fallback: photoUrl.get(i.id) ?? null }));

  const positionByItem = new Map((links ?? []).map((l) => [l.item_id, l.position]));
  const memberIds = new Set((links ?? []).map((l) => l.item_id));
  const members = all.filter((i) => memberIds.has(i.id));
  const candidates = all.filter((i) => !memberIds.has(i.id));

  // Pochettes : exemplaires possédés + cartes hors collection
  const pocketItems: PocketItem[] = [
    ...members.map((i) => ({
      id: `i:${i.id}`,
      kind: "owned" as const,
      card_name: i.card_name,
      set_name: i.set_name,
      local_id: i.local_id,
      tcgdex_id: i.tcgdex_id,
      image_url: i.image_url,
      photo_fallback: i.photo_fallback,
      quantity: i.quantity,
      position: positionByItem.get(i.id) ?? null,
      created_at: i.created_at,
    })),
    ...(placeholders ?? []).map((w) => ({
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

  // Couverture (cartes choisies, sinon premières possédées) + rendu sur mesure
  const withImage = members.filter((i) => i.image_url);
  const chosen = (binder.cover_item_ids ?? [])
    .map((cid) => members.find((i) => i.id === cid))
    .filter((i): i is NonNullable<typeof i> => i != null && !!i.image_url);
  const covers = (chosen.length > 0 ? chosen : withImage.slice(0, 4)).map((i) => ({
    image_url: i.image_url,
  }));
  const coverRender = await coverRenderFor(
    binder.style,
    binder.cover,
    id,
    (itemId) => all.find((i) => i.id === itemId)?.image_url || null
  );

  // Total officiel par set (« 12 / 102 » dans le détail d'une carte)
  const setCounts: Record<string, number> = {};
  {
    const setIds = new Set(
      pocketItems
        .map((p) => p.tcgdex_id)
        .filter((t): t is string => !!t && t.includes("-"))
        .map((t) => t.slice(0, t.lastIndexOf("-")))
    );
    if (setIds.size > 0) {
      const index = await fetchSetsIndex().catch(() => new Map());
      for (const sid of setIds) {
        const n = index.get(sid)?.cardCount?.official ?? index.get(sid)?.cardCount?.total;
        if (n) setCounts[sid] = n;
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/utilisateurs/${id}`} className="text-sm text-muted transition hover:text-foreground">
        ← Retour au compte
      </Link>

      <div>
        <h2 className="display text-2xl font-bold tracking-tight">{binder.name}</h2>
        <p className="num mt-1 text-sm text-muted">
          {pocketItems.length} carte{pocketItems.length > 1 ? "s" : ""}
        </p>
      </div>

      {/* Le classeur tel que l'utilisateur le voit (lecture seule) */}
      {pocketItems.length > 0 && (
        <CleanViewProvider>
          <div className="max-w-[1000px]">
            <div className="mb-3 flex justify-end">
              <CleanViewToggle />
            </div>
            <BinderPages
              binderId={binder.id}
              name={binder.name}
              items={pocketItems}
              gridCode={binder.page_grid}
              colorHex={binderColorHex(binder.color)}
              cover={{ style: binder.style, covers, layout: coverRender }}
              design={binderDesign(binder.design)}
              pageCount={binder.page_count}
              setCounts={setCounts}
              readOnly
            />
          </div>
        </CleanViewProvider>
      )}

      <AdminBinderRename binderId={binderId} ownerId={id} initialName={binder.name} />

      <AdminBinderCards binderId={binderId} ownerId={id} members={members} candidates={candidates} />
    </div>
  );
}
