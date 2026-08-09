import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { signStorageImages, applyRectifiedImages } from "@/lib/images";
import { formatEur, CONDITIONS } from "@/lib/domain";
import { CardImage } from "@/components/card-image";
import { AdminItemEdit } from "@/components/admin/admin-item-edit";

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

export default async function AdminItemDetail({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  const db = createAdminClient();

  const { data: item } = await db
    .from("items")
    .select("*")
    .eq("id", itemId)
    .eq("owner_id", id)
    .maybeSingle();
  if (!item) notFound();

  const [{ data: sources }, { data: photoRows }, { data: gradings }] = await Promise.all([
    db.from("sources").select("id, name").eq("owner_id", id).order("name"),
    db.from("item_photos").select("id, path, label").eq("item_id", itemId).order("position"),
    db.from("item_gradings").select("rectified_path").eq("item_id", itemId).order("created_at", { ascending: false }).limit(1),
  ]);

  // Visuel : redressé de pré-gradation > custom signé > scan officiel
  const [{ image_url: signedImage }] = await applyRectifiedImages(
    [{ item_id: itemId, rectified_path: gradings?.[0]?.rectified_path ?? null }],
    await signStorageImages([{ id: itemId, image_url: item.image_url }], id),
    id
  );

  // Photos perso signées
  let photos: { url: string; label: string | null }[] = [];
  if (photoRows && photoRows.length > 0) {
    const { data: signed } = await db.storage
      .from("card-photos")
      .createSignedUrls(photoRows.map((p) => p.path), 3600);
    photos = photoRows.flatMap((p, i) =>
      signed?.[i]?.signedUrl ? [{ url: signed[i]!.signedUrl, label: p.label }] : []
    );
  }

  const condition = CONDITIONS.find((c) => c.code === item.condition);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/utilisateurs/${id}`} className="text-sm text-muted transition hover:text-foreground">
        ← Retour au compte
      </Link>

      <div className="flex flex-col gap-8 lg:flex-row">
        <aside className="w-full max-w-80 shrink-0">
          <div className="card-tile aspect-[63/88]">
            <CardImage base={signedImage || null} alt={item.card_name} quality="high" fallback={photos[0]?.url ?? null} />
          </div>
          {photos.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="card-tile aspect-[63/88]">
                  <CardImage base={p.url} alt={p.label ?? ""} direct />
                </div>
              ))}
            </div>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <h2 className="display text-2xl font-bold tracking-tight">{item.card_name}</h2>
          <p className="mt-1 text-muted">
            {item.set_name} <span className="num text-faint">· {item.local_id}</span>
            {item.deleted_at && (
              <span className="ml-2 rounded bg-loss/15 px-1.5 py-0.5 text-[10px] font-semibold text-loss">Corbeille</span>
            )}
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <div><dt className="label-xs">État</dt><dd className="num">{item.condition} {condition ? `· ${condition.label}` : ""}</dd></div>
            <div><dt className="label-xs">Langue</dt><dd>{item.language}</dd></div>
            <div><dt className="label-xs">Type</dt><dd>{item.card_type ?? "—"}</dd></div>
            <div><dt className="label-xs">Quantité</dt><dd className="num">×{item.quantity}</dd></div>
            <div><dt className="label-xs">Payé</dt><dd className="num">{formatEur(item.purchase_price)}</dd></div>
            <div><dt className="label-xs">Estimé</dt><dd className="num">{formatEur(item.manual_price)}</dd></div>
            <div><dt className="label-xs">Gradée</dt><dd>{item.graded ? item.grade ?? "Oui" : "Non"}</dd></div>
            <div><dt className="label-xs">Ajoutée</dt><dd className="num">{fmt(item.created_at)}</dd></div>
            <div><dt className="label-xs">TCGdex</dt><dd className="num truncate">{item.tcgdex_id}</dd></div>
          </dl>
        </div>
      </div>

      <AdminItemEdit
        itemId={itemId}
        ownerId={id}
        sources={sources ?? []}
        defaults={{
          condition: item.condition,
          quantity: item.quantity ?? 1,
          purchase_price: item.purchase_price,
          manual_price: item.manual_price,
          language: item.language ?? "FR",
          card_type: item.card_type,
          graded: item.graded ?? false,
          grade: item.grade,
          source_id: item.source_id,
          notes: item.notes,
        }}
      />
    </div>
  );
}
