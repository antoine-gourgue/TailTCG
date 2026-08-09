import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Users,
  LayoutGrid,
  Award,
  NotebookTabs,
  Star,
  MapPin,
  BadgeEuro,
  Share2,
  ShieldCheck,
} from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatEur } from "@/lib/domain";
import { AppShell } from "@/components/app-shell";

export const metadata = { title: "Back-office — TailTCG" };

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: typeof Users;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="panel flex flex-col gap-1 p-4">
      <span className="flex items-center gap-2 label-xs">
        <Icon size={13} aria-hidden />
        {label}
      </span>
      <span className="display num text-2xl font-bold leading-none">{value}</span>
      {sub && <span className="text-xs text-faint">{sub}</span>}
    </div>
  );
}

function fmtDate(d: string | null | undefined): string {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const db = createAdminClient();

  // Comptes (auth) + réglages + données brutes agrégées côté serveur
  const [
    { data: authData },
    { data: settings },
    { data: items },
    { data: gradings },
    { data: binders },
    { data: sources },
    { data: wishlist },
    { data: snapshots },
  ] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("user_settings").select("owner_id, display_name, share_token, share_show_values, revalue_weeks"),
    db.from("items").select("owner_id, manual_price, quantity, sold_price, sold_at, deleted_at, created_at, card_name, set_name"),
    db.from("item_gradings").select("owner_id, grade, created_at"),
    db.from("binders").select("owner_id"),
    db.from("sources").select("owner_id"),
    db.from("wishlist").select("owner_id"),
    db.from("price_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(1),
  ]);

  const users = authData?.users ?? [];
  const settingsByOwner = new Map(
    (settings ?? []).map((s) => [s.owner_id, s])
  );

  // Agrégats par utilisateur (sur les items vivants)
  type Agg = { cards: number; value: number; sold: number; deleted: number; gradings: number; binders: number; sources: number; wishlist: number };
  const agg = new Map<string, Agg>();
  const blank = (): Agg => ({ cards: 0, value: 0, sold: 0, deleted: 0, gradings: 0, binders: 0, sources: 0, wishlist: 0 });
  const get = (id: string) => {
    let a = agg.get(id);
    if (!a) { a = blank(); agg.set(id, a); }
    return a;
  };

  let totalCards = 0;
  let totalValue = 0;
  let totalSold = 0;
  let totalDeleted = 0;
  for (const i of items ?? []) {
    const a = get(i.owner_id);
    if (i.deleted_at != null) { a.deleted += 1; totalDeleted += 1; continue; }
    if (i.sold_at != null) { a.sold += 1; totalSold += 1; }
    const qty = i.quantity ?? 1;
    a.cards += qty;
    totalCards += qty;
    if (i.manual_price != null && i.sold_at == null) {
      a.value += i.manual_price * qty;
      totalValue += i.manual_price * qty;
    }
  }
  for (const g of gradings ?? []) get(g.owner_id).gradings += 1;
  for (const b of binders ?? []) get(b.owner_id).binders += 1;
  for (const s of sources ?? []) get(s.owner_id).sources += 1;
  for (const w of wishlist ?? []) get(w.owner_id).wishlist += 1;

  const activeShares = (settings ?? []).filter((s) => s.share_token != null).length;

  // Lignes utilisateurs, triées par valeur de collection décroissante
  const rows = users
    .map((u) => {
      const a = agg.get(u.id) ?? blank();
      const s = settingsByOwner.get(u.id);
      return {
        id: u.id,
        email: u.email ?? "—",
        name: s?.display_name ?? null,
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at ?? null,
        shared: s?.share_token != null,
        ...a,
      };
    })
    .sort((x, y) => y.value - x.value);

  // Derniers ajouts (tous comptes)
  const recentItems = [...(items ?? [])]
    .filter((i) => i.deleted_at == null)
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .slice(0, 12);
  const nameByOwner = new Map(rows.map((r) => [r.id, r.name ?? r.email]));

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex items-center gap-2.5">
          <ShieldCheck size={22} className="text-accent-strong" aria-hidden />
          <h1 className="display text-3xl font-bold tracking-tight">Back-office</h1>
        </div>

        {/* KPIs globaux */}
        <section className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <Kpi icon={Users} label="Utilisateurs" value={users.length} />
          <Kpi icon={LayoutGrid} label="Cartes" value={totalCards} sub={`${totalDeleted} en corbeille`} />
          <Kpi icon={BadgeEuro} label="Valeur cumulée" value={formatEur(totalValue)} sub={`${totalSold} vendues`} />
          <Kpi icon={Award} label="Pré-gradations" value={(gradings ?? []).length} />
          <Kpi icon={NotebookTabs} label="Classeurs" value={(binders ?? []).length} />
          <Kpi icon={Star} label="Recherchées" value={(wishlist ?? []).length} />
          <Kpi icon={MapPin} label="Boutiques/sources" value={(sources ?? []).length} />
          <Kpi icon={Share2} label="Partages actifs" value={activeShares} sub={`sur ${users.length}`} />
        </section>

        {/* Utilisateurs */}
        <section className="mb-8">
          <h2 className="display mb-3 text-lg font-semibold">Utilisateurs</h2>
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-edge text-left">
                  <th className="label-xs px-4 py-3">Compte</th>
                  <th className="label-xs px-4 py-3">Inscrit</th>
                  <th className="label-xs px-4 py-3">Dernière connexion</th>
                  <th className="label-xs px-4 py-3 text-right">Cartes</th>
                  <th className="label-xs px-4 py-3 text-right">Valeur</th>
                  <th className="label-xs px-4 py-3 text-right">Grad.</th>
                  <th className="label-xs px-4 py-3 text-right">Class.</th>
                  <th className="label-xs px-4 py-3">Partage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-edge/50 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{r.name ?? "—"}</span>
                      <span className="block text-xs text-muted">{r.email}</span>
                    </td>
                    <td className="num px-4 py-2.5 text-muted">{fmtDate(r.createdAt)}</td>
                    <td className="num px-4 py-2.5 text-muted">{fmtDate(r.lastSignIn)}</td>
                    <td className="num px-4 py-2.5 text-right">{r.cards}</td>
                    <td className="num px-4 py-2.5 text-right font-medium">{formatEur(r.value)}</td>
                    <td className="num px-4 py-2.5 text-right">{r.gradings}</td>
                    <td className="num px-4 py-2.5 text-right">{r.binders}</td>
                    <td className="px-4 py-2.5">
                      {r.shared ? (
                        <span className="rounded-full bg-gain/15 px-2 py-0.5 text-[11px] font-semibold text-gain">
                          Actif
                        </span>
                      ) : (
                        <span className="text-xs text-faint">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Derniers ajouts */}
        <section>
          <h2 className="display mb-3 text-lg font-semibold">Derniers ajouts</h2>
          <div className="panel divide-y divide-edge/60 !p-0">
            {recentItems.length === 0 ? (
              <p className="px-4 py-4 text-sm text-muted">Aucun ajout.</p>
            ) : (
              recentItems.map((i, idx) => (
                <div key={idx} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{i.card_name}</span>{" "}
                    <span className="text-muted">{i.set_name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {nameByOwner.get(i.owner_id) ?? "—"}
                  </span>
                  <span className="num shrink-0 text-xs text-faint">
                    {fmtDate(i.created_at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>

        <p className="mt-8 text-xs text-faint">
          Dernier relevé de cotes (cron) :{" "}
          {snapshots?.[0]?.captured_at ? fmtDate(snapshots[0].captured_at) : "aucun"}.
          {" "}Connecté en tant qu&apos;admin : {admin.email}.
        </p>
        <Link href="/" className="mt-2 inline-block text-sm text-muted hover:text-foreground">
          ← Retour au site
        </Link>
      </main>
    </AppShell>
  );
}
