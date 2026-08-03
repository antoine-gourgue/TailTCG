import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEur } from "@/lib/domain";
import { AppShell } from "@/components/app-shell";
import { ItemForm } from "@/components/item-form";
import { DeleteItemButton } from "@/components/delete-item-button";
import { PhotoGallery, type GalleryPhoto } from "@/components/photo-gallery";
import { CardImage } from "@/components/card-image";
import type { SourceOption } from "@/app/items/actions";

export const metadata = {
  title: "Fiche carte — TailTCG",
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
      <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
        >
          ← Collection
        </Link>

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Image officielle en haute qualité */}
          <aside className="w-full max-w-sm shrink-0 lg:sticky lg:top-20 lg:self-start">
            <div className="card-tile aspect-[63/88]">
              <CardImage
                base={item.image_url || null}
                alt={item.card_name ?? ""}
                quality="high"
              />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            <h1 className="display text-3xl font-bold tracking-tight">
              {item.card_name}
            </h1>
            <p className="mb-5 mt-1 text-muted">
              {item.set_name} <span className="num text-faint">· {item.local_id}</span>
            </p>

            <div className="panel mb-6 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
              <div className="flex flex-col gap-0.5">
                <span className="label-xs">Payé</span>
                <span className="display num text-xl font-bold leading-none">
                  {formatEur(item.purchase_price)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="label-xs">Valeur estimée</span>
                <span className="display num text-xl font-bold leading-none">
                  {formatEur(item.current_price)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="label-xs">Plus-value</span>
                <span
                  className={`display num text-xl font-bold leading-none ${
                    item.gain == null
                      ? "text-faint"
                      : item.gain > 0
                        ? "text-gain"
                        : item.gain < 0
                          ? "text-loss"
                          : ""
                  }`}
                >
                  {item.gain != null && item.gain > 0 ? "+" : ""}
                  {formatEur(item.gain)}
                </span>
              </div>
              {item.cardmarket_url && (
                <a
                  href={item.cardmarket_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-ghost ml-auto !py-1.5 text-[13px]"
                >
                  Cardmarket ↗
                </a>
              )}
            </div>

            <div className="mb-8">
              <PhotoGallery itemId={item.id ?? id} photos={photos} />
            </div>

            <h2 className="display mb-4 text-xl font-semibold">Modifier</h2>
            <ItemForm
              mode="edit"
              itemId={item.id ?? id}
              defaults={{
                card_type: item.card_type,
                language: item.language ?? "FR",
                condition: item.condition,
                quantity: item.quantity ?? 1,
                purchase_price: item.purchase_price,
                manual_price: item.manual_price,
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
      </AppShell>
    </>
  );
}
