import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages } from "@/lib/images";
import { Logo } from "@/components/logo";
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
    .select("owner_id")
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

  const [{ data: items }, { data: sources }] = await Promise.all([
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
  ]);

  const signedItems = await signStorageImages((items ?? []) as CollectionItem[]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Logo variant="mark" size={36} />
          <div>
            <h1 className="display text-2xl font-bold tracking-tight">
              Collection partagée
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

      <CollectionClient
        items={signedItems}
        sources={(sources ?? []) as SourceRef[]}
        readOnly
      />
    </main>
  );
}
