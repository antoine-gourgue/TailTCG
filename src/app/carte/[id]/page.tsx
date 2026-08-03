import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEur } from "@/lib/domain";
import { SiteHeader } from "@/components/site-header";
import { ItemForm } from "@/components/item-form";
import { DeleteItemButton } from "@/components/delete-item-button";
import { PhotoGallery, type GalleryPhoto } from "@/components/photo-gallery";
import type { SourceOption } from "@/app/items/actions";

export const metadata = {
  title: "Fiche carte — Pokédex Collection",
};

export default async function CartePage({
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

  const [{ data: item }, { data: sources }, { data: photoRows }] =
    await Promise.all([
      supabase.from("collection_value").select("*").eq("id", id).single(),
      supabase.from("sources").select("id, name, kind, city, url").order("name"),
      supabase
        .from("item_photos")
        .select("id, path, label, position")
        .eq("item_id", id)
        .order("position"),
    ]);

  if (!item) notFound();

  // URLs signées 1 h, générées côté serveur (bucket privé)
  let photos: GalleryPhoto[] = [];
  if (photoRows && photoRows.length > 0) {
    const admin = createAdminClient();
    const { data: signed } = await admin.storage
      .from("card-photos")
      .createSignedUrls(
        photoRows.map((p) => p.path),
        3600
      );
    photos = photoRows.flatMap((p, i) => {
      const url = signed?.[i]?.signedUrl;
      return url ? [{ id: p.id, url, label: p.label }] : [];
    });
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Link href="/" className="mb-6 inline-block text-sm text-muted hover:text-foreground">
          ← Collection
        </Link>

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Image officielle en haute qualité */}
          <aside className="w-full max-w-sm shrink-0">
            <div className="card-tile aspect-[63/88] bg-surface">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${item.image_url}/high.png`}
                  alt={item.card_name ?? ""}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-muted">🃏</div>
              )}
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
              {item.card_name}
            </h1>
            <p className="mb-4 text-muted">
              {item.set_name} <span className="num">· {item.local_id}</span>
            </p>

            <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2 rounded-xl border border-edge bg-surface p-4 text-sm">
              <p className="text-muted">
                Payé{" "}
                <span className="num text-base font-semibold text-foreground">
                  {formatEur(item.purchase_price)}
                </span>
              </p>
              <p className="text-muted">
                Cote actuelle{" "}
                <span className="num text-base font-semibold text-foreground">
                  {formatEur(item.current_price)}
                </span>
              </p>
              <p className="text-muted">
                Plus-value{" "}
                <span
                  className={`num text-base font-semibold ${
                    item.gain == null
                      ? "text-muted"
                      : item.gain > 0
                        ? "text-emerald-400"
                        : item.gain < 0
                          ? "text-red-400"
                          : ""
                  }`}
                >
                  {item.gain != null && item.gain > 0 ? "+" : ""}
                  {formatEur(item.gain)}
                </span>
              </p>
              {item.cardmarket_url && (
                <a
                  href={item.cardmarket_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto self-center text-muted underline transition hover:text-foreground"
                >
                  Voir sur Cardmarket ↗
                </a>
              )}
            </div>

            <div className="mb-8">
              <PhotoGallery itemId={item.id ?? id} photos={photos} />
            </div>

            <p className="mb-4 text-xs text-muted">
              L&apos;historique de cote arrivera avec le cron des prix (Phase 6).
            </p>

            <h2 className="mb-4 font-[family-name:var(--font-display)] text-xl font-semibold">
              Modifier
            </h2>
            <ItemForm
              mode="edit"
              itemId={item.id ?? id}
              defaults={{
                card_type: item.card_type,
                language: item.language ?? "FR",
                condition: item.condition,
                quantity: item.quantity ?? 1,
                purchase_price: item.purchase_price,
                purchase_date: item.purchase_date,
                source_id: item.source_id,
                cardmarket_url: item.cardmarket_url,
                graded: item.graded ?? false,
                grade: item.grade,
                notes: item.notes,
              }}
              sources={(sources ?? []) as SourceOption[]}
            />

            <div className="mt-8 border-t border-edge pt-6">
              <DeleteItemButton itemId={item.id ?? id} />
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
