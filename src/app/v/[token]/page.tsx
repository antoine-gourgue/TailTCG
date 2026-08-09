import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages } from "@/lib/images";
import { formatEur } from "@/lib/domain";
import { binderColorHex } from "@/lib/binder-colors";
import { Logo } from "@/components/logo";
import { BinderCover } from "@/components/binder-cover";
import {
  CollectionClient,
  type CollectionItem,
  type SourceRef,
} from "@/components/collection-client";

export const metadata = {
  title: "Collection partagée — TailTCG",
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    .select("owner_id, display_name")
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

  const signedItems = await signStorageImages((items ?? []) as CollectionItem[]);

  // Tuiles de classeurs : mêmes couvertures stylées que côté propriétaire
  const itemById = new Map(signedItems.map((i) => [i.id, i]));
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
        sources={(sources ?? []) as SourceRef[]}
        readOnly
      />
    </main>
  );
}
