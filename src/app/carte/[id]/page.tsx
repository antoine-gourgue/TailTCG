import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil, ExternalLink, X, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCard } from "@/lib/tcgdex";
import { formatEur, CONDITIONS } from "@/lib/domain";
import { AppShell } from "@/components/app-shell";
import { ItemForm } from "@/components/item-form";
import { DeleteItemButton } from "@/components/delete-item-button";
import { PhotoGallery, type GalleryPhoto } from "@/components/photo-gallery";
import { CardImage } from "@/components/card-image";
import type { SourceOption } from "@/app/items/actions";

export const metadata = {
  title: "Fiche carte — TailTCG",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label-xs mb-1">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function CartePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const [{ id }, { edit }] = await Promise.all([params, searchParams]);
  const editing = edit != null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: item }, { data: sources }, { data: photoRows }, { data: siblings }] =
    await Promise.all([
      supabase.from("collection_value").select("*").eq("id", id).single(),
      supabase.from("sources").select("id, name, kind, city, url").order("name"),
      supabase
        .from("item_photos")
        .select("id, path, label, position")
        .eq("item_id", id)
        .order("position"),
      // Même ordre que la grille (ajout récent d'abord) pour feuilleter
      supabase
        .from("items")
        .select("id")
        .order("created_at", { ascending: false }),
    ]);

  if (!item) notFound();

  // Feuilletage : carte précédente / suivante dans le classeur
  const ids = (siblings ?? []).map((s) => s.id);
  const idx = ids.indexOf(id);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

  // Fiche officielle TCGdex (cache 24 h), défensif si l'API est indisponible
  const tcgdexCard = item.tcgdex_id ? await getCard(item.tcgdex_id) : null;

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

  const condition = CONDITIONS.find((c) => c.code === item.condition);
  const source = item.source_id
    ? (sources ?? []).find((s) => s.id === item.source_id)
    : null;
  const purchaseDate = item.purchase_date
    ? new Date(item.purchase_date).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
          >
            ← Collection
          </Link>
          <div className="flex items-center gap-1">
            {prevId ? (
              <Link
                href={`/carte/${prevId}`}
                title="Carte précédente"
                aria-label="Carte précédente"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
              >
                <ChevronLeft size={16} aria-hidden />
              </Link>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-faint opacity-40">
                <ChevronLeft size={16} aria-hidden />
              </span>
            )}
            {nextId ? (
              <Link
                href={`/carte/${nextId}`}
                title="Carte suivante"
                aria-label="Carte suivante"
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
              >
                <ChevronRight size={16} aria-hidden />
              </Link>
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-faint opacity-40">
                <ChevronRight size={16} aria-hidden />
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-8 lg:flex-row">
          {/* Image officielle en haute qualité */}
          <aside className="w-full max-w-sm shrink-0 lg:sticky lg:top-8 lg:self-start">
            <div className="card-tile aspect-[63/88]">
              <CardImage
                base={item.image_url || null}
                alt={item.card_name ?? ""}
                quality="high"
              />
            </div>
            {tcgdexCard && (
              <section className="panel mt-5 p-5">
                <h2 className="display mb-4 text-base font-semibold">La carte</h2>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {tcgdexCard.rarity && (
                    <Field label="Rareté">{tcgdexCard.rarity}</Field>
                  )}
                  {tcgdexCard.category && (
                    <Field label="Catégorie">{tcgdexCard.category}</Field>
                  )}
                  {tcgdexCard.types && tcgdexCard.types.length > 0 && (
                    <Field label="Type">{tcgdexCard.types.join(" / ")}</Field>
                  )}
                  {tcgdexCard.hp != null && (
                    <Field label="PV">
                      <span className="num">{tcgdexCard.hp}</span>
                    </Field>
                  )}
                  {tcgdexCard.stage && (
                    <Field label="Stade">{tcgdexCard.stage}</Field>
                  )}
                  {tcgdexCard.illustrator && (
                    <Field label="Illustrateur">{tcgdexCard.illustrator}</Field>
                  )}
                  <Field label="Set">
                    {tcgdexCard.set.name}
                    {tcgdexCard.set.cardCount?.official ? (
                      <span className="num text-muted">
                        {" "}
                        · {item.local_id} / {tcgdexCard.set.cardCount.official}
                      </span>
                    ) : null}
                  </Field>
                </dl>
              </section>
            )}
          </aside>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="display text-3xl font-bold tracking-tight">
                  {item.card_name}
                </h1>
                <p className="mt-1 text-muted">
                  {item.set_name}{" "}
                  <span className="num text-faint">· {item.local_id}</span>
                </p>
              </div>
              {editing ? (
                <Link href={`/carte/${id}`} className="btn btn-ghost">
                  <X size={15} aria-hidden />
                  Annuler
                </Link>
              ) : (
                <Link href={`/carte/${id}?edit`} className="btn btn-primary">
                  <Pencil size={15} aria-hidden />
                  Modifier
                </Link>
              )}
            </div>

            {/* Valeurs clés */}
            <div className="panel mb-6 mt-5 flex flex-wrap items-center gap-x-10 gap-y-4 px-6 py-4">
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
                  Cardmarket
                  <ExternalLink size={13} aria-hidden />
                </a>
              )}
            </div>

            {editing ? (
              <>
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
              </>
            ) : (
              <>
                {/* Détails de l'exemplaire */}
                <section className="panel mb-6 p-5">
                  <h2 className="display mb-4 text-base font-semibold">
                    Cet exemplaire
                  </h2>
                  <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
                    <Field label="État">
                      <span className="inline-flex items-baseline gap-1.5">
                        <span className="num rounded-md bg-accent-soft px-1.5 py-0.5 text-[13px] font-bold text-accent-strong">
                          {item.condition}
                        </span>
                        {condition && (
                          <span className="text-muted">{condition.label}</span>
                        )}
                      </span>
                    </Field>
                    <Field label="Type">{item.card_type ?? "—"}</Field>
                    <Field label="Langue">{item.language}</Field>
                    <Field label="Quantité">
                      <span className="num">×{item.quantity}</span>
                    </Field>
                    <Field label="Gradée">
                      {item.graded ? (
                        <span className="rounded-md bg-accent px-1.5 py-0.5 text-[13px] font-semibold text-accent-ink">
                          {item.grade ?? "Oui"}
                        </span>
                      ) : (
                        "Non"
                      )}
                    </Field>
                    <Field label="Date d'achat">{purchaseDate ?? "—"}</Field>
                    <Field label="Source">
                      {source ? (
                        <>
                          {source.name}
                          {source.kind === "shop" && source.city
                            ? ` (${source.city})`
                            : ""}
                        </>
                      ) : (
                        "—"
                      )}
                    </Field>
                    <Field label="N° dans le set">
                      <span className="num">{item.local_id}</span>
                    </Field>
                    <Field label="Ajoutée le">
                      {item.created_at
                        ? new Date(item.created_at).toLocaleDateString("fr-FR")
                        : "—"}
                    </Field>
                  </dl>
                  {item.notes && (
                    <div className="mt-5 border-t border-edge pt-4">
                      <p className="label-xs mb-1.5">Notes</p>
                      <p className="whitespace-pre-wrap text-sm text-muted">
                        {item.notes}
                      </p>
                    </div>
                  )}
                </section>

                <PhotoGallery itemId={item.id ?? id} photos={photos} />
              </>
            )}
          </div>
        </div>
      </main>
    </AppShell>
  );
}
