import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEur, sourceKindLabel } from "@/lib/domain";
import { AdminSourceEdit } from "@/components/admin/admin-source-edit";

export default async function AdminSourceDetail({
  params,
}: {
  params: Promise<{ id: string; sourceId: string }>;
}) {
  const { id, sourceId } = await params;
  const db = createAdminClient();

  const { data: source } = await db
    .from("sources")
    .select("id, name, kind, city, url, address, notes, owner_id")
    .eq("id", sourceId)
    .maybeSingle();
  if (!source || source.owner_id !== id) notFound();

  const { data: linked } = await db
    .from("items")
    .select("id, card_name, set_name, local_id, purchase_price, quantity")
    .eq("source_id", sourceId)
    .is("deleted_at", null);

  const items = linked ?? [];
  const spent = items.reduce((n, i) => n + (i.purchase_price != null ? i.purchase_price * (i.quantity ?? 1) : 0), 0);

  return (
    <div className="flex flex-col gap-6">
      <Link href={`/admin/utilisateurs/${id}`} className="text-sm text-muted transition hover:text-foreground">
        ← Retour au compte
      </Link>

      <div>
        <h2 className="display text-2xl font-bold tracking-tight">{source.name}</h2>
        <p className="mt-1 text-sm text-muted">
          {sourceKindLabel(source.kind)}
          {source.city ? ` · ${source.city}` : ""} · {items.length} carte(s) · {formatEur(spent)} dépensés
        </p>
      </div>

      <AdminSourceEdit
        sourceId={sourceId}
        ownerId={id}
        defaults={{ name: source.name, kind: source.kind, city: source.city, url: source.url }}
      />

      <section>
        <h3 className="display mb-3 text-lg font-semibold">Cartes de cette source</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted">Aucune carte rattachée.</p>
        ) : (
          <div className="panel overflow-hidden !p-0">
            <table className="w-full text-sm">
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t border-edge/50 first:border-t-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/admin/utilisateurs/${id}/carte/${i.id}`} className="font-medium hover:text-accent-strong">
                        {i.card_name}
                      </Link>
                      <span className="block text-xs text-muted">
                        {i.set_name} <span className="num text-faint">· {i.local_id}</span>
                      </span>
                    </td>
                    <td className="num px-4 py-2.5 text-right text-muted">{formatEur(i.purchase_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
