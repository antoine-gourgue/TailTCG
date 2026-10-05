import Link from "next/link";
import { BrushCleaning, ChevronRight, Database, Euro, ChartLine } from "lucide-react";
import { loadAdminData, loadAdminHealth } from "@/lib/admin-data";
import { clock, fmtInt, shortDate } from "@/lib/admin-format";
import { formatEur } from "@/lib/domain";
import { StatCard, StatStrip } from "@/components/stat-card";
import { TopCardsGrid, topOwned } from "@/components/admin/top-cards";
import { ActivityPanel } from "@/components/admin/activity-panel";
import { EventFeed } from "@/components/admin/event-feed";
import { Avatar, Badge, HealthCard, PanelHead } from "@/components/admin/admin-ui";

const WEEK = 7 * 86_400_000;

export default async function AdminOverview() {
  const [d, h] = await Promise.all([loadAdminData(), loadAdminHealth()]);
  const byId = new Map(d.accounts.map((a) => [a.id, a]));
  const t = d.accounts.reduce(
    (acc, a) => ({
      cards: acc.cards + a.cards,
      refs: acc.refs + a.refs,
      value: acc.value + (a.value ?? 0),
      invested: acc.invested + a.invested,
      sealed: acc.sealed + a.sealed,
      sealedOwners: acc.sealedOwners + (a.sealed > 0 ? 1 : 0),
    }),
    { cards: 0, refs: 0, value: 0, invested: 0, sealed: 0, sealedOwners: 0 },
  );
  const active7 = d.accounts.filter((a) => a.lastActivity && d.now - new Date(a.lastActivity).getTime() <= WEEK).length;
  const langs = new Set(d.items.map((i) => i.language)).size;

  const maxValue = Math.max(...d.accounts.map((a) => a.value ?? 0), 1);
  const gain = t.value - t.invested;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Santé : ce qui tourne la nuit, et le ménage */}
      <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <HealthCard
          icon={ChartLine}
          tone={h.cards.status === "ok" ? "ok" : "warn"}
          dot={h.cards.status === "ok" ? "ok" : "warn"}
          title="Cotes des cartes"
          line={h.cards.lastDay ? `Relevées le ${shortDate(h.cards.lastDay, h.now)}` : "Aucun relevé récent"}
          detail={`${fmtInt(h.cards.lastCount)} cartes · cron Vercel`}
        />
        <HealthCard
          icon={Euro}
          tone={h.guide.status === "ok" ? "ok" : "warn"}
          dot={h.guide.status === "ok" ? "ok" : "warn"}
          title="Guide Cardmarket"
          line={h.guide.fileAt ? `Fichier du ${shortDate(h.guide.fileAt, h.now)}, à jour` : "Jamais rafraîchi"}
          detail={`${fmtInt(h.guide.rows)} produits · miroir à ${clock(h.guide.refreshedAt)}`}
        />
        <HealthCard
          icon={Database}
          tone={h.catalog.status === "ok" ? "ok" : "warn"}
          dot={h.catalog.status === "ok" ? "ok" : "warn"}
          title="Catalogue et scellés"
          line={h.catalog.lastSealedDay ? `Synchronisés le ${shortDate(h.catalog.lastSealedDay, h.now)}` : "Pas encore synchronisés"}
          detail={`${fmtInt(h.catalog.cards)} cartes · ${fmtInt(h.catalog.sealedProducts)} scellés`}
        />
        <Link href="/admin/systeme" className="block">
          <HealthCard
            icon={BrushCleaning}
            tone={h.expiredCaptures > 0 ? "warn" : "ok"}
            dot={h.expiredCaptures > 0 ? "warn" : "ok"}
            title="Ménage"
            line={`${fmtInt(h.trash)} carte${h.trash > 1 ? "s" : ""} en corbeille`}
            detail={h.expiredCaptures > 0 ? `${fmtInt(h.expiredCaptures)} captures expirées à nettoyer` : "Aucune capture expirée"}
          />
        </Link>
      </section>

      <StatStrip cols={5}>
        <StatCard label="Comptes" value={d.accounts.length} sub={`${active7} actif${active7 > 1 ? "s" : ""} sur 7 j`} />
        <StatCard label="Cartes suivies" value={fmtInt(t.cards)} sub={`${fmtInt(t.refs)} références · ${langs} langue${langs > 1 ? "s" : ""}`} />
        <StatCard label="Valeur suivie" value={formatEur(t.value)} sub={`${gain >= 0 ? "+" : ""}${formatEur(gain)} de plus-value`} />
        <StatCard label="Scellés" value={fmtInt(t.sealed)} sub={`dans ${t.sealedOwners} collection${t.sealedOwners > 1 ? "s" : ""}`} />
        <StatCard label="Boosters ouverts" value={fmtInt(d.openings.length)} sub={`${fmtInt(d.game.length)} cartes tirées`} />
      </StatStrip>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <ActivityPanel days={d.daily.days} cards={d.daily.cards} sealed={d.daily.sealed} openings={d.daily.openings} scans={d.daily.scans} />
        <section className="panel p-5">
          <PanelHead title="En direct" hint="Les derniers gestes, tous comptes" />
          <EventFeed events={d.events.slice(0, 6)} accounts={byId} now={d.now} />
        </section>
      </section>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Collectionneurs" hint="Classés par valeur suivie">
            <Link href="/admin/utilisateurs" className="flex items-center gap-1 text-xs text-muted transition hover:text-foreground">
              Tous <ChevronRight size={13} aria-hidden />
            </Link>
          </PanelHead>
          <ol className="divide-y divide-ring">
            {d.accounts.slice(0, 6).map((a, i) => (
              <li key={a.id}>
                <Link href={`/admin/utilisateurs/${a.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-90">
                  <span className="num w-3.5 text-xs text-faint">{i + 1}</span>
                  <Avatar name={a.name ?? a.email} hue={a.hue} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-semibold">
                      {a.name ?? a.email}
                      {a.admin && <Badge tone="accent">Admin</Badge>}
                    </p>
                    <div className="mt-1.5 h-2 max-w-[260px] overflow-hidden rounded-full bg-raised">
                      <i className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(2, ((a.value ?? 0) / maxValue) * 100)}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num font-bold">{a.value != null ? formatEur(a.value) : "—"}</p>
                    <p className="num mt-0.5 text-[11px] text-faint">
                      {fmtInt(a.cards)} cartes · {fmtInt(a.sealed)} scellés
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel p-5">
          <PanelHead title="Les plus possédées" hint="Toutes collections confondues">
            <Link href="/admin/collections" className="flex items-center gap-1 text-xs text-muted transition hover:text-foreground">
              Collections <ChevronRight size={13} aria-hidden />
            </Link>
          </PanelHead>
          <TopCardsGrid cards={topOwned(d.items)} />
        </section>
      </section>
    </div>
  );
}
