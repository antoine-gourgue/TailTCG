import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { Logo } from "@/components/logo";
import {
  CollectionClient,
  type CollectionItem,
} from "@/components/collection-client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Titre dynamique : le nom du classeur apparaît dans l'aperçu du lien
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { id } = await params;
  let title = "Classeur partagé — TailTCG";
  if (UUID_RE.test(id)) {
    const admin = createAdminClient();
    const { data: binder } = await admin
      .from("binders")
      .select("name")
      .eq("id", id)
      .maybeSingle();
    if (binder?.name) title = `${binder.name} — TailTCG`;
  }
  return {
    title,
    description: "Un classeur partagé en lecture seule, propulsé par TailTCG.",
    twitter: { card: "summary_large_image" as const },
  };
}

// Un classeur de la vitrine publique, en lecture seule
export default async function SharedBinderPage({
  params,
}: {
  params: Promise<{ token: string; id: string }>;
}) {
  const { token, id } = await params;
  if (!UUID_RE.test(token) || !UUID_RE.test(id)) notFound();

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("user_settings")
    .select("owner_id")
    .eq("share_token", token)
    .maybeSingle();
  if (!settings) notFound();

  const { data: binder } = await admin
    .from("binders")
    .select("id, name, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!binder || binder.owner_id !== settings.owner_id) notFound();

  const { data: links } = await admin
    .from("binder_items")
    .select("item_id, position")
    .eq("binder_id", binder.id);
  const memberIds = (links ?? []).map((l) => l.item_id);
  const positionByItem = new Map(
    (links ?? []).map((l) => [l.item_id, l.position])
  );

  const { data: items } =
    memberIds.length > 0
      ? await admin
          .from("collection_value")
          .select(
            "id, tcgdex_id, card_name, set_name, set_id, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, manual_price, source_id, graded, grade, created_at, current_price, gain, sold_price, sold_at"
          )
          .in("id", memberIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  const { data: shareGradings } = await admin
    .from("item_gradings")
    .select("item_id, rectified_path")
    .eq("owner_id", settings.owner_id)
    .order("created_at", { ascending: false });

  const signedItems = (
    await applyRectifiedImages(
      shareGradings,
      await signStorageImages((items ?? []) as CollectionItem[])
    )
  ).map((i) => ({ ...i, position: positionByItem.get(i.id) ?? null }));

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo variant="mark" size={36} />
          <div>
            <h1 className="display text-2xl font-bold tracking-tight">
              {binder.name}
            </h1>
            <p className="text-sm text-muted">
              Un classeur de cette collection partagée.
            </p>
          </div>
        </div>
        <Link href={`/v/${token}`} className="btn btn-ghost">
          ← Toute la collection
        </Link>
      </div>

      {signedItems.length === 0 ? (
        <p className="text-sm text-muted">Ce classeur est vide.</p>
      ) : (
        <CollectionClient
          items={signedItems}
          sources={[]}
          readOnly
          binderContext={{ id: binder.id, name: binder.name }}
        />
      )}
    </main>
  );
}
