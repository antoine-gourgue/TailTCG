import {
  Users,
  LayoutGrid,
  Award,
  NotebookTabs,
  Star,
  MapPin,
  BadgeEuro,
  Share2,
} from "lucide-react";
import { loadAdminBundle, dailyCounts, todayISO } from "@/lib/admin-data";
import { formatEur } from "@/lib/domain";
import { MiniBars, RankBars } from "@/components/admin/mini-bars";

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
      <span className="label-xs flex items-center gap-2">
        <Icon size={13} aria-hidden />
        {label}
      </span>
      <span className="display num text-2xl font-bold leading-none">{value}</span>
      {sub && <span className="text-xs text-faint">{sub}</span>}
    </div>
  );
}

export default async function AdminOverview() {
  const b = await loadAdminBundle();
  const today = todayISO();

  const signups = dailyCounts(b.users.map((u) => u.createdAt), 30, today);
  const cardsAdded = dailyCounts(
    b.items.filter((i) => i.deleted_at == null).map((i) => i.created_at),
    30,
    today
  );

  // Répartitions — dernière pré-gradation par carte (pas chaque réévaluation)
  const latestGrade = new Map<string, number>();
  for (const g of b.gradings) if (!latestGrade.has(g.item_id)) latestGrade.set(g.item_id, g.grade);
  const grades = [...latestGrade.values()];
  const gradeDist = Array.from({ length: 10 }, (_, k) => {
    const g = 10 - k;
    return { label: `Note ${g}`, value: grades.filter((x) => x === g).length };
  }).filter((d) => d.value > 0);

  const setCount = new Map<string, number>();
  for (const i of b.items) {
    if (i.deleted_at != null) continue;
    setCount.set(i.set_name, (setCount.get(i.set_name) ?? 0) + (i.quantity ?? 1));
  }
  const topSets = [...setCount.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, x) => x.value - a.value)
    .slice(0, 8);

  const condCount = new Map<string, number>();
  for (const i of b.items) {
    if (i.deleted_at != null) continue;
    condCount.set(i.condition, (condCount.get(i.condition) ?? 0) + (i.quantity ?? 1));
  }
  const conditions = [...condCount.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, x) => x.value - a.value);

  return (
    <div className="flex flex-col gap-8">
      {/* KPIs */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi icon={Users} label="Utilisateurs" value={b.totals.users} />
        <Kpi icon={LayoutGrid} label="Cartes" value={b.totals.cards} sub={`${b.totals.deleted} en corbeille`} />
        <Kpi icon={BadgeEuro} label="Valeur cumulée" value={formatEur(b.totals.value)} sub={`${formatEur(b.totals.invested)} investis`} />
        <Kpi icon={Award} label="Cartes pré-gradées" value={b.totals.gradings} />
        <Kpi icon={NotebookTabs} label="Classeurs" value={b.totals.binders} />
        <Kpi icon={Star} label="Recherchées" value={b.totals.wishlist} />
        <Kpi icon={MapPin} label="Sources" value={b.totals.sources} />
        <Kpi icon={Share2} label="Partages actifs" value={b.totals.activeShares} sub={`${b.totals.valuesShared} avec valeurs`} />
      </section>

      {/* Croissance */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label-xs mb-3">Inscriptions · 30 jours</p>
          <MiniBars data={signups} />
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-3">Cartes ajoutées · 30 jours</p>
          <MiniBars data={cardsAdded} />
        </div>
      </section>

      {/* Répartitions */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label-xs mb-3">Sets les plus collectionnés</p>
          <RankBars data={topSets} />
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-3">États des cartes</p>
          <RankBars data={conditions} />
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-3">Notes de pré-gradation</p>
          <RankBars data={gradeDist} accent="var(--gain)" />
        </div>
        <div className="panel flex flex-col justify-center gap-2 p-5">
          <p className="label-xs">Moyennes par utilisateur</p>
          <p className="text-sm text-muted">
            <span className="num font-bold text-foreground">
              {b.totals.users ? Math.round(b.totals.cards / b.totals.users) : 0}
            </span>{" "}
            cartes ·{" "}
            <span className="num font-bold text-foreground">
              {formatEur(b.totals.users ? b.totals.value / b.totals.users : 0)}
            </span>{" "}
            de collection
          </p>
          <p className="text-sm text-muted">
            <span className="num font-bold text-foreground">{b.totals.customCards}</span>{" "}
            cartes hors catalogue ·{" "}
            <span className="num font-bold text-foreground">{b.totals.photos}</span>{" "}
            photos ·{" "}
            <span className="num font-bold text-foreground">{b.totals.sold}</span>{" "}
            ventes
          </p>
        </div>
      </section>
    </div>
  );
}
