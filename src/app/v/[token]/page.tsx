import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { formatEur } from "@/lib/domain";
import { binderColorHex } from "@/lib/binder-colors";
import { Logo } from "@/components/logo";
import { BinderCover } from "@/components/binder-cover";
import { CardImage } from "@/components/card-image";
import { GradedSlab } from "@/components/graded-slab";
import {
  CollectionClient,
  type CollectionItem,
  type SourceRef,
} from "@/components/collection-client";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Titre dynamique : le pseudo apparaît dans l'aperçu du lien partagé
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let title = "Collection partagée — TailTCG";
  if (UUID_RE.test(token)) {
    const admin = createAdminClient();
    const { data: settings } = await admin
      .from("user_settings")
      .select("display_name")
      .eq("share_token", token)
      .maybeSingle();
    if (settings?.display_name) {
      title = `La collection de ${settings.display_name} — TailTCG`;
    }
  }
  return {
    title,
    description: "Vitrine en lecture seule, propulsée par TailTCG.",
    twitter: { card: "summary_large_image" as const },
    // Lien secret : jamais indexé (audit)
    robots: { index: false, follow: false, nocache: true },
  };
}

// Vitrine publique en lecture seule, accessible par jeton secret
export default async function SharedCollectionPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  if (!UUID_RE.test(token)) notFound();

  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("user_settings")
    .select("owner_id, display_name, share_show_values")
    .eq("share_token", token)
    .maybeSingle();

  // Visiteur déjà connecté : pas de CTA d'inscription
  const supabase = await createClient();
  const {
    data: { user: visitor },
  } = await supabase.auth.getUser();

  // Jeton bien formé mais inconnu : le partage a été coupé ou renouvelé
  if (!settings) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
        <Logo variant="mark" size={44} />
        <p className="label-xs mt-8 text-muted">Lien expiré</p>
        <h1 className="display mt-2 text-3xl font-bold tracking-tight">
          Cette collection n&apos;est plus partagée
        </h1>
        <p className="mt-3 max-w-sm text-sm text-muted">
          Le propriétaire a coupé le partage ou généré un nouveau lien.
          Demande-lui le lien à jour pour revoir sa collection.
        </p>
        {visitor ? (
          <Link href="/" className="btn btn-primary mt-8">
            Ma collection
          </Link>
        ) : (
          <Link href="/login" className="btn btn-primary mt-8">
            Créer ma collection
          </Link>
        )}
      </main>
    );
  }

  const [{ data: items }, { data: sources }, { data: binders }] =
    await Promise.all([
      admin
        .from("collection_value")
        .select(
          "id, tcgdex_id, card_name, set_name, set_id, local_id, image_url, card_type, language, condition, quantity, purchase_price, purchase_date, manual_price, source_id, graded, grade, created_at, current_price, gain, sold_price, sold_at"
        )
        .eq("owner_id", settings.owner_id)
        .order("created_at", { ascending: false }),
      admin
        .from("sources")
        .select("id, name")
        .eq("owner_id", settings.owner_id)
        .order("name"),
      admin
        .from("binders")
        .select(
          "id, name, color, style, cover_item_ids, created_at, binder_items(item_id)"
        )
        .eq("owner_id", settings.owner_id)
        .order("position", { nullsFirst: false })
        .order("created_at"),
    ]);

  const { data: shareGradings } = await admin
    .from("item_gradings")
    .select("item_id, rectified_path, grade, centering, corners, edges, surface, created_at")
    .eq("owner_id", settings.owner_id)
    .order("created_at", { ascending: false });

  const showValues = settings.share_show_values;
  const signedRaw = await applyRectifiedImages(
    shareGradings,
    await signStorageImages((items ?? []) as CollectionItem[], settings.owner_id),
    settings.owner_id
  );
  // Option de partage : masquer la dimension financière (défaut)
  const signedItems: CollectionItem[] = showValues
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

  // Tuiles de classeurs : mêmes couvertures stylées que côté propriétaire
  const itemById = new Map(signedItems.map((i) => [i.id, i]));

  // Boîtiers des cartes pré-gradées (dernière évaluation par exemplaire)
  const latestGrading = new Map<string, NonNullable<typeof shareGradings>[number]>();
  for (const g of shareGradings ?? []) {
    if (!latestGrading.has(g.item_id)) latestGrading.set(g.item_id, g);
  }
  const slabs = [...latestGrading.values()]
    .map((g) => ({ g, item: itemById.get(g.item_id) }))
    .filter(
      (s): s is { g: (typeof s)["g"]; item: NonNullable<(typeof s)["item"]> } =>
        s.item != null
    );
  const binderTiles = (binders ?? []).map((b) => {
    let count = 0;
    let value = 0;
    let hasValue = false;
    const covers: { image_url: string }[] = [];
    for (const link of b.binder_items) {
      const item = itemById.get(link.item_id);
      if (!item) continue;
      count += item.quantity;
      if (item.current_price != null) {
        value += item.current_price * item.quantity;
        hasValue = true;
      }
      if (covers.length < 4 && item.image_url) covers.push(item);
    }
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
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo variant="mark" size={36} />
          <div>
            <h1 className="display text-2xl font-bold tracking-tight">
              {settings.display_name
                ? `La collection de ${settings.display_name}`
                : "Collection partagée"}
            </h1>
            <p className="text-sm text-muted">
              Vitrine en lecture seule, propulsée par TailTCG.
            </p>
          </div>
        </div>
        {visitor ? (
          <Link href="/" className="btn btn-ghost">
            Ma collection →
          </Link>
        ) : (
          <Link href="/login" className="btn btn-ghost">
            Créer ma collection →
          </Link>
        )}
      </div>

      {signedItems.filter((i) => i.sold_at == null).length > 0 && (
        <section className="mb-8">
          <h2 className="display mb-3 text-lg font-semibold">
            Dernières acquisitions
          </h2>
          <div className="scrollbar-none flex gap-3 overflow-x-auto pb-1">
            {signedItems
              .filter((i) => i.sold_at == null)
              .slice(0, 8)
              .map((i) => (
                <div key={i.id} className="w-24 shrink-0 sm:w-28">
                  <div className="card-tile aspect-[63/88]">
                    <CardImage base={i.image_url || null} alt={i.card_name} />
                  </div>
                  <p className="mt-1.5 truncate text-xs text-muted">
                    {i.card_name}
                  </p>
                </div>
              ))}
          </div>
        </section>
      )}

      {slabs.length > 0 && (
        <section className="mb-8">
          <h2 className="display mb-3 text-lg font-semibold">Pré-gradées</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {slabs.map(({ g, item }) => (
              <li key={g.item_id}>
                <GradedSlab
                  name={item.card_name}
                  setName={item.set_name}
                  localId={item.local_id}
                  imageUrl={item.image_url || null}
                  grade={g.grade ?? 0}
                  centering={g.centering ?? 0}
                  corners={g.corners ?? 0}
                  edges={g.edges ?? 0}
                  surface={g.surface ?? 0}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {binderTiles.length > 0 && (
        <section className="mb-8">
          <h2 className="display mb-3 text-lg font-semibold">Classeurs</h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {binderTiles.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/v/${token}/c/${b.id}`}
                  className="panel group block overflow-hidden p-3 transition hover:border-edge-strong"
                >
                  <BinderCover
                    style={b.style}
                    covers={b.covers}
                    name={b.name}
                    colorHex={b.colorHex}
                  />
                  <p className="mt-2.5 truncate text-sm font-semibold group-hover:text-accent-strong">
                    {b.name}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    <span className="num">{b.count}</span> carte
                    {b.count > 1 ? "s" : ""}
                    {b.value != null && (
                      <>
                        {" "}
                        · <span className="num">{formatEur(b.value)}</span>
                      </>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CollectionClient
        items={signedItems}
        sources={showValues ? ((sources ?? []) as SourceRef[]) : []}
        readOnly
        hideValues={!showValues}
      />
    </main>
  );
}
