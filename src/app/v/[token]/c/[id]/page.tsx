import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { binderColorHex } from "@/lib/binder-colors";
import { binderDesign } from "@/lib/binder-design";
import { coverRenderFor } from "@/lib/binder-cover-server";
import { Logo } from "@/components/logo";
import { BinderPages, type PocketItem } from "@/components/binder-pages";
import { ViewToggle } from "@/components/view-toggle";
import { CleanViewProvider, CleanViewToggle } from "@/components/binder-clean-view";
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
  const { token, id } = await params;
  let title = "Classeur partagé — TailTCG";
  // Le nom n'est révélé que si le classeur appartient bien au jeton (audit)
  if (UUID_RE.test(token) && UUID_RE.test(id)) {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("owner_id")
      .eq("share_token", token)
      .maybeSingle();
    if (settings) {
      const { data: binder } = await admin
        .from("binders")
        .select("name, owner_id")
        .eq("id", id)
        .maybeSingle();
      if (binder && binder.owner_id === settings.owner_id) {
        title = `${binder.name} — TailTCG`;
      }
    }
  }
  return {
    title,
    description: "Un classeur partagé en lecture seule, propulsé par TailTCG.",
    twitter: { card: "summary_large_image" as const },
    robots: { index: false, follow: false, nocache: true },
  };
}

// Un classeur de la vitrine publique, en lecture seule
export default async function SharedBinderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string; id: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const [{ token, id }, { vue }] = await Promise.all([params, searchParams]);
  if (!UUID_RE.test(token) || !UUID_RE.test(id)) notFound();
  const mode = vue === "grille" ? "grille" : "pages";

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("user_settings")
    .select("owner_id, share_show_values")
    .eq("share_token", token)
    .maybeSingle();
  if (!settings) notFound();

  const { data: binder } = await admin
    .from("binders")
    .select("id, name, owner_id, color, page_grid, style, cover_item_ids, design, page_count, cover")
    .eq("id", id)
    .maybeSingle();
  if (!binder || binder.owner_id !== settings.owner_id) notFound();

  const [{ data: links }, { data: wanted }] = await Promise.all([
    admin.from("binder_items").select("item_id, position").eq("binder_id", binder.id),
    // Cartes hors collection : filtrées par propriétaire (client service role)
    admin
      .from("binder_placeholders")
      .select("id, tcgdex_id, card_name, set_name, local_id, image_url, position, created_at")
      .eq("binder_id", binder.id)
      .eq("owner_id", settings.owner_id),
  ]);
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
          // Sécurité : ne renvoyer que les items du propriétaire de la
          // vitrine, même si un item_id étranger s'était glissé dans le classeur
          .eq("owner_id", settings.owner_id)
          .in("id", memberIds)
          .order("created_at", { ascending: false })
      : { data: [] };

  const { data: shareGradings } = await admin
    .from("item_gradings")
    .select("item_id, rectified_path")
    .eq("owner_id", settings.owner_id)
    .order("created_at", { ascending: false });

  const showValues = settings.share_show_values;
  const signedRaw = (
    await applyRectifiedImages(
      shareGradings,
      await signStorageImages(
        (items ?? []) as CollectionItem[],
        settings.owner_id
      ),
      settings.owner_id
    )
  ).map((i) => ({ ...i, position: positionByItem.get(i.id) ?? null }));
  const signedItems = showValues
    ? signedRaw
    : signedRaw.map((i) => ({
        ...i,
        purchase_price: null,
        purchase_date: null,
        manual_price: null,
        current_price: null,
        gain: null,
        sold_price: null,
        source_id: null,
      }));
  // Couverture fermée : cartes choisies, sinon les quatre premières avec image
  const withImage = signedItems
    .map((i) => ({ id: i.id, image_url: i.image_url }))
    .filter((i) => i.image_url);
  const chosen = (binder.cover_item_ids ?? [])
    .map((id) => withImage.find((i) => i.id === id))
    .filter((i): i is NonNullable<typeof i> => i != null);
  const covers = chosen.length > 0 ? chosen : withImage.slice(0, 4);
  const coverRender = await coverRenderFor(
    binder.style,
    binder.cover,
    settings.owner_id,
    (itemId) => signedItems.find((i) => i.id === itemId)?.image_url || null
  );
  // Pochettes : exemplaires et cartes hors collection (visibles en vitrine)
  const pocketItems: PocketItem[] = [
    ...signedItems.map((i) => ({
      id: `i:${i.id}`,
      kind: "owned" as const,
      card_name: i.card_name,
      image_url: i.image_url,
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

  return (
    <main
      className={`mx-auto w-full px-4 ${
        mode === "pages" ? "max-w-[1400px] pb-3 pt-5" : "max-w-6xl py-8"
      }`}
    >
     <CleanViewProvider>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Logo variant="mark" size={36} />
          <div className="min-w-0">
            <h1 className="display truncate text-2xl font-bold tracking-tight">
              {binder.name}
            </h1>
            <p className="text-sm text-muted">
              Un classeur de cette collection partagée ·{" "}
              <span className="num">{pocketItems.length}</span> carte
              {pocketItems.length > 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {signedItems.length > 0 && (
            <ViewToggle base={`/v/${token}/c/${binder.id}`} current={mode} />
          )}
          {signedItems.length > 0 && mode === "pages" && <CleanViewToggle />}
          <Link href={`/v/${token}`} className="btn btn-ghost">
            ← Toute la collection
          </Link>
        </div>
      </div>

      {signedItems.length === 0 ? (
        <p className="text-sm text-muted">Ce classeur est vide.</p>
      ) : mode === "pages" ? (
        <BinderPages
          binderId={binder.id}
          name={binder.name}
          items={pocketItems}
          gridCode={binder.page_grid}
          colorHex={binderColorHex(binder.color)}
          cover={{ style: binder.style, covers, layout: coverRender }}
          design={binderDesign(binder.design)}
          pageCount={binder.page_count}
          readOnly
        />
      ) : (
        <CollectionClient
          items={signedItems}
          sources={[]}
          readOnly
          hideValues={!showValues}
          binderContext={{ id: binder.id, name: binder.name }}
        />
      )}
     </CleanViewProvider>
    </main>
  );
}
