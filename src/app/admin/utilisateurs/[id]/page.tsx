import Link from "next/link";
import { notFound } from "next/navigation";
import {
  LayoutGrid,
  Award,
  NotebookTabs,
  Star,
  MapPin,
  BadgeEuro,
  Camera,
  ExternalLink,
} from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEur } from "@/lib/domain";
import { UserAdminActions } from "@/components/admin/user-admin-actions";
import { AdminCardsTable, type AdminItem } from "@/components/admin/admin-cards-table";
import { AdminBindersList, AdminSourcesList } from "@/components/admin/admin-owned-lists";
import { SlabReportTile } from "@/components/slab-report-tile";
import type { GradingReportData } from "@/components/grading-report";

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof LayoutGrid;
  label: string;
  value: string | number;
}) {
  return (
    <div className="panel flex flex-col gap-1 p-4">
      <span className="label-xs flex items-center gap-2">
        <Icon size={13} aria-hidden />
        {label}
      </span>
      <span className="display num text-xl font-bold leading-none">{value}</span>
    </div>
  );
}

export default async function AdminUserDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = createAdminClient();

  const { data: userRes } = await db.auth.admin.getUserById(id);
  const account = userRes?.user;
  if (!account) notFound();

  const [
    { data: settings },
    { data: items },
    { data: gradings },
    { data: binders },
    { data: binderLinks },
    { data: sources },
    { data: wishlist },
    { data: photos },
  ] = await Promise.all([
    db.from("user_settings").select("*").eq("owner_id", id).maybeSingle(),
    db.from("items").select("id, card_name, set_name, local_id, tcgdex_id, condition, card_type, language, quantity, purchase_price, manual_price, graded, grade, sold_at, sold_price, deleted_at, created_at, notes").eq("owner_id", id).order("created_at", { ascending: false }),
    db.from("item_gradings").select("item_id, grade, centering, corners, edges, surface, created_at, rectified_path, rectified_verso_path, ratios, details").eq("owner_id", id).order("created_at", { ascending: false }),
    db.from("binders").select("id, name").eq("owner_id", id).order("created_at"),
    db.from("binder_items").select("binder_id").eq("owner_id", id),
    db.from("sources").select("id, name, kind, city").eq("owner_id", id).order("name"),
    db.from("wishlist").select("id").eq("owner_id", id),
    db.from("item_photos").select("id").eq("owner_id", id),
  ]);

  const allItems = (items ?? []) as AdminItem[];
  const live = allItems.filter((i) => i.deleted_at == null);
  const cards = live.reduce((n, i) => n + (i.quantity ?? 1), 0);
  const value = live.reduce((n, i) => n + (i.sold_at == null && i.manual_price != null ? i.manual_price * (i.quantity ?? 1) : 0), 0);
  const invested = live.reduce((n, i) => n + (i.purchase_price != null ? i.purchase_price * (i.quantity ?? 1) : 0), 0);
  const trash = allItems.filter((i) => i.deleted_at != null).length;

  // Pré-gradations (dernière par carte) + visuels signés pour le rapport
  const latestGrading = new Map<string, NonNullable<typeof gradings>[number]>();
  for (const g of gradings ?? []) if (!latestGrading.has(g.item_id)) latestGrading.set(g.item_id, g);
  const gradingList = [...latestGrading.values()];
  const gradePaths = gradingList.flatMap((g) =>
    [g.rectified_path, g.rectified_verso_path].filter((p): p is string => p != null)
  );
  const gradeUrl = new Map<string, string | null>();
  if (gradePaths.length > 0) {
    const { data: signed } = await db.storage.from("card-photos").createSignedUrls(gradePaths, 3600);
    gradePaths.forEach((p, i) => gradeUrl.set(p, signed?.[i]?.signedUrl ?? null));
  }
  const itemById = new Map(allItems.map((i) => [i.id, i]));
  const slabs = gradingList
    .map((g) => ({ g, item: itemById.get(g.item_id) }))
    .filter((s): s is { g: (typeof s)["g"]; item: AdminItem } => s.item != null)
    .map(({ g, item }) => ({
      itemId: g.item_id,
      imageUrl: g.rectified_path ? gradeUrl.get(g.rectified_path) ?? null : null,
      report: {
        grade: g.grade ?? 0,
        centering: g.centering ?? 0,
        corners: g.corners ?? 0,
        edges: g.edges ?? 0,
        surface: g.surface ?? 0,
        createdAt: g.created_at,
        ratios: (g.ratios as GradingReportData["ratios"]) ?? null,
        annotations: ((g.details as { annotations?: GradingReportData["annotations"] })?.annotations) ?? [],
        rectoUrl: g.rectified_path ? gradeUrl.get(g.rectified_path) ?? null : null,
        versoUrl: g.rectified_verso_path ? gradeUrl.get(g.rectified_verso_path) ?? null : null,
        cardName: item.card_name,
        setName: item.set_name,
        localId: item.local_id,
      } satisfies GradingReportData,
    }));

  const binderCount = new Map<string, number>();
  for (const l of binderLinks ?? []) binderCount.set(l.binder_id, (binderCount.get(l.binder_id) ?? 0) + 1);
  const bindersWithCount = (binders ?? []).map((b) => ({
    id: b.id,
    name: b.name,
    count: binderCount.get(b.id) ?? 0,
  }));

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/utilisateurs" className="text-sm text-muted transition hover:text-foreground">
          ← Tous les utilisateurs
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="display flex items-center gap-2 text-2xl font-bold tracking-tight">
              {settings?.display_name ?? "— (pas de pseudo)"}
              {account.banned_until && (
                <span className="rounded-full bg-loss/15 px-2 py-0.5 text-xs font-semibold text-loss">
                  Suspendu
                </span>
              )}
            </h2>
            <p className="text-sm text-muted">{account.email}</p>
          </div>
          {settings?.share_token && (
            <Link href={`/v/${settings.share_token}`} target="_blank" className="btn btn-ghost">
              Voir la vitrine
              <ExternalLink size={14} aria-hidden />
            </Link>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <div><dt className="label-xs">Inscrit</dt><dd className="num">{fmt(account.created_at)}</dd></div>
          <div><dt className="label-xs">Dernière connexion</dt><dd className="num">{fmt(account.last_sign_in_at)}</dd></div>
          <div><dt className="label-xs">Email confirmé</dt><dd>{account.email_confirmed_at ? "Oui" : "Non"}</dd></div>
          <div><dt className="label-xs">Partage</dt><dd>{settings?.share_token ? (settings.share_show_values ? "Actif (valeurs)" : "Actif") : "—"}</dd></div>
        </dl>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Stat icon={LayoutGrid} label="Cartes" value={cards} />
        <Stat icon={BadgeEuro} label="Valeur" value={formatEur(value)} />
        <Stat icon={BadgeEuro} label="Investi" value={formatEur(invested)} />
        <Stat icon={Award} label="Cartes pré-gradées" value={latestGrading.size} />
        <Stat icon={NotebookTabs} label="Classeurs" value={(binders ?? []).length} />
        <Stat icon={Star} label="Recherchées" value={(wishlist ?? []).length} />
        <Stat icon={MapPin} label="Sources" value={(sources ?? []).length} />
        <Stat icon={Camera} label="Photos" value={(photos ?? []).length} />
      </section>

      <UserAdminActions
        userId={id}
        email={account.email ?? ""}
        shared={settings?.share_token != null}
        banned={account.banned_until != null}
      />

      {/* Cartes détaillées + actions */}
      <section>
        <h3 className="display mb-3 text-lg font-semibold">
          Cartes{" "}
          <span className="text-sm font-normal text-muted">
            ({live.length} actives{trash ? ` · ${trash} en corbeille` : ""})
          </span>
        </h3>
        <AdminCardsTable items={allItems} ownerId={id} />
      </section>

      {/* Pré-gradées */}
      {slabs.length > 0 && (
        <section>
          <h3 className="display mb-3 text-lg font-semibold">
            Pré-gradées{" "}
            <span className="text-sm font-normal text-muted">
              ({slabs.length}) — clique un boîtier pour le rapport
            </span>
          </h3>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {slabs.map((s) => (
              <li key={s.itemId}>
                <SlabReportTile data={s.report} imageUrl={s.imageUrl} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Classeurs & sources */}
      <section className="grid gap-4 lg:grid-cols-2">
        <AdminBindersList ownerId={id} binders={bindersWithCount} />
        <AdminSourcesList ownerId={id} sources={sources ?? []} />
      </section>
    </div>
  );
}
