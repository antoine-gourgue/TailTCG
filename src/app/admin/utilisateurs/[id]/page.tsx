import Link from "next/link";
import { notFound } from "next/navigation";
import { Award, Boxes, ChevronLeft, ExternalLink, KeyRound, LayoutGrid, MailCheck, MailWarning, MapPin, NotebookTabs, Package, Star, UserPlus } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { loadAdminData } from "@/lib/admin-data";
import { combineStats, loadCardStats, loadSealedStats } from "@/lib/stats-data";
import { sealedCotes } from "@/lib/sealed-prices";
import { signStorageImages } from "@/lib/images";
import { activityTone, fmtInt, relTime, shortDate } from "@/lib/admin-format";
import { rarityLabel } from "@/lib/rarity";
import { formatEur } from "@/lib/domain";
import { StatCard, StatStrip } from "@/components/stat-card";
import { CardImage } from "@/components/card-image";
import { ValueHistoryChart } from "@/components/value-history-chart";
import { SlabReportTile } from "@/components/slab-report-tile";
import type { GradingReportData } from "@/components/grading-report";
import { AdminCardsTable, type AdminItem } from "@/components/admin/admin-cards-table";
import { AdminBindersList, AdminSourcesList } from "@/components/admin/admin-owned-lists";
import { Avatar, Badge, Dot, PanelHead } from "@/components/admin/admin-ui";
import { EventFeed } from "@/components/admin/event-feed";
import { DangerZone, ResetLinkButton } from "@/components/admin/user-actions";
import { UserTabs, type UserTab } from "@/components/admin/user-tabs";
import { UserCardsBrowser, UserSealedBrowser, type AdminCardRow, type AdminSealedRow } from "@/components/admin/user-collection";
import { kindLabel, sealedSetName } from "@/lib/sealed";

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireAdmin();
  const db = createAdminClient();
  const d = await loadAdminData();
  const a = d.accounts.find((x) => x.id === id);
  if (!a) notFound();

  const [cardStats, sealedStats, { data: settings }, { data: items }, { data: gradings }, { data: binders }, { data: binderLinks }, { data: binderPlaceholders }, { data: sources }, { data: wishlist }] = await Promise.all([
    loadCardStats(db, id),
    (async () => {
      const lots = d.sealed.filter((l) => l.owner_id === id);
      const cotes = lots.length ? await sealedCotes(lots.map((l) => l.product), db) : new Map();
      return loadSealedStats(db, id, { cotes });
    })(),
    db.from("user_settings").select("share_token").eq("owner_id", id).maybeSingle(),
    db.from("items").select("id, card_name, set_name, local_id, tcgdex_id, image_url, condition, card_type, language, quantity, purchase_price, manual_price, graded, grade, sold_at, sold_price, deleted_at, created_at, notes").eq("owner_id", id).order("created_at", { ascending: false }),
    db.from("item_gradings").select("item_id, grade, centering, corners, edges, surface, created_at, rectified_path, rectified_verso_path, ratios, details").eq("owner_id", id).order("created_at", { ascending: false }),
    db.from("binders").select("id, name").eq("owner_id", id).order("created_at"),
    db.from("binder_items").select("binder_id").eq("owner_id", id),
    db.from("binder_placeholders").select("binder_id").eq("owner_id", id),
    db.from("sources").select("id, name, kind, city").eq("owner_id", id).order("name"),
    db.from("wishlist").select("id, card_name, set_name, image_url, priority, target_price").eq("owner_id", id).order("created_at", { ascending: false }),
  ]);
  const stats = combineStats(cardStats, sealedStats);

  // Pré-gradations : dernière par carte, visuels signés pour le rapport
  const allItems = (items ?? []) as AdminItem[];
  const latest = new Map<string, NonNullable<typeof gradings>[number]>();
  for (const g of gradings ?? []) if (!latest.has(g.item_id)) latest.set(g.item_id, g);
  const paths = [...latest.values()].flatMap((g) => [g.rectified_path, g.rectified_verso_path].filter((p): p is string => p != null));
  const signed = new Map<string, string | null>();
  if (paths.length) {
    const { data: urls } = await db.storage.from("card-photos").createSignedUrls(paths, 3600);
    paths.forEach((p, i) => signed.set(p, urls?.[i]?.signedUrl ?? null));
  }
  const itemById = new Map(allItems.map((i) => [i.id, i]));
  const slabs = [...latest.values()].flatMap((g) => {
    const item = itemById.get(g.item_id);
    if (!item) return [];
    const recto = g.rectified_path ? (signed.get(g.rectified_path) ?? null) : null;
    const report: GradingReportData = {
      grade: g.grade ?? 0,
      centering: g.centering ?? 0,
      corners: g.corners ?? 0,
      edges: g.edges ?? 0,
      surface: g.surface ?? 0,
      createdAt: g.created_at,
      ratios: (g.ratios as GradingReportData["ratios"]) ?? null,
      annotations: (g.details as { annotations?: GradingReportData["annotations"] })?.annotations ?? [],
      rectoUrl: recto,
      versoUrl: g.rectified_verso_path ? (signed.get(g.rectified_verso_path) ?? null) : null,
      cardName: item.card_name,
      setName: item.set_name,
      localId: item.local_id,
    };
    return [{ itemId: g.item_id, imageUrl: recto, report }];
  });

  const binderCount = new Map<string, number>();
  for (const l of [...(binderLinks ?? []), ...(binderPlaceholders ?? [])]) binderCount.set(l.binder_id, (binderCount.get(l.binder_id) ?? 0) + 1);
  const bindersWithCount = (binders ?? []).map((b) => ({ id: b.id, name: b.name, count: binderCount.get(b.id) ?? 0 }));

  // Toutes les cartes (vendues et corbeille comprises) : visuels hors catalogue signés, cote du jour
  const marketById = new Map(d.items.filter((i) => i.owner_id === id).map((i) => [i.id, i.market_trend]));
  const signedItems = await signStorageImages((items ?? []).map((i) => ({ ...i, image_url: i.image_url as string | null })), id);
  const cardRows: AdminCardRow[] = signedItems.map((i) => ({
    id: i.id,
    name: i.card_name,
    set: i.set_name,
    localId: i.local_id,
    image: i.image_url || null,
    condition: i.condition,
    language: i.language ?? "FR",
    qty: i.quantity ?? 1,
    value: i.manual_price,
    market: marketById.get(i.id) ?? null,
    sold: i.sold_at != null,
    trash: i.deleted_at != null,
    graded: i.graded ?? false,
    createdAt: i.created_at,
  }));
  // Tous les scellés, par produit
  const lots = d.sealed.filter((l) => l.owner_id === id);
  const products = new Map<number, AdminSealedRow & { valued: boolean; paidAny: boolean }>();
  for (const l of lots) {
    const p = l.product;
    const g = products.get(p.id) ?? { id: p.id, name: p.name, kind: kindLabel(p.kind), set: sealedSetName(p), image: p.image, qty: 0, lots: 0, value: 0, paid: 0, manual: false, lastAt: null, valued: false, paidAny: false };
    const unit = l.manual_price ?? d.sealedCote.get(p.id) ?? null;
    g.qty += l.quantity;
    g.lots += 1;
    if (unit != null) {
      g.value = (g.value ?? 0) + unit * l.quantity;
      g.valued = true;
    }
    if (l.purchase_price != null) {
      g.paid = (g.paid ?? 0) + l.purchase_price * l.quantity;
      g.paidAny = true;
    }
    if (l.manual_price != null) g.manual = true;
    if (l.created_at && (!g.lastAt || l.created_at > g.lastAt)) g.lastAt = l.created_at;
    products.set(p.id, g);
  }
  const sealedRows: AdminSealedRow[] = [...products.values()].map(({ valued, paidAny, ...r }) => ({ ...r, value: valued ? r.value : null, paid: paidAny ? r.paid : null }));
  const gameCards = d.game.filter((c) => c.owner_id === id);
  const rares = gameCards.filter((c) => (c.tier === "ultra" || c.tier === "secret") && c.image_url).slice(0, 8);
  const events = d.events.filter((e) => e.ownerId === id).slice(0, 6);
  const shareToken = settings?.share_token ?? null;
  const self = me?.id === id;
  const accounts = new Map([[a.id, a]]);

  const tabs: UserTab[] = [
    {
      key: "cartes",
      label: "Cartes",
      icon: <LayoutGrid size={14} aria-hidden />,
      count: a.cards,
      content: cardRows.length === 0 ? <Empty>Aucune carte.</Empty> : <UserCardsBrowser ownerId={id} cards={cardRows} table={<AdminCardsTable items={allItems} ownerId={id} />} />,
    },
    {
      key: "scelles",
      label: "Scellés",
      icon: <Boxes size={14} aria-hidden />,
      count: a.sealed,
      content: <UserSealedBrowser ownerId={id} products={sealedRows} />,
    },
    {
      key: "jeu",
      label: "Jeu",
      icon: <Package size={14} aria-hidden />,
      count: a.game,
      content:
        gameCards.length === 0 ? (
          <Empty>Aucun booster ouvert.</Empty>
        ) : (
          <div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Boosters", fmtInt(a.openings)],
                ["Cartes tirées", fmtInt(a.game)],
                ["Gradées", fmtInt(a.gameGraded)],
                ["À l'échange", fmtInt(gameCards.filter((c) => c.for_trade).length)],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-raised px-3 py-2">
                  <p className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</p>
                  <p className="num mt-0.5 font-bold">{v}</p>
                </div>
              ))}
            </div>
            {rares.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Derniers tirages rares</p>
                <ul className="grid grid-cols-4 gap-2.5 sm:grid-cols-8">
                  {rares.map((c, i) => (
                    <li key={i} className="min-w-0">
                      <div className="card-tile aspect-[63/88]">
                        <CardImage base={c.image_url} alt={c.card_name} placeholder="compact" />
                      </div>
                      <p className="mt-1 truncate text-[10px] text-faint">{rarityLabel(c.rarity)}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ),
    },
    ...(slabs.length
      ? [
          {
            key: "pregrades",
            label: "Pré-gradées",
            icon: <Award size={14} aria-hidden />,
            count: slabs.length,
            content: (
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {slabs.map((s) => (
                  <li key={s.itemId}>
                    <SlabReportTile data={s.report} imageUrl={s.imageUrl} />
                  </li>
                ))}
              </ul>
            ),
          },
        ]
      : []),
    { key: "classeurs", label: "Classeurs", icon: <NotebookTabs size={14} aria-hidden />, count: bindersWithCount.length, content: <AdminBindersList ownerId={id} binders={bindersWithCount} /> },
    {
      key: "recherchees",
      label: "Recherchées",
      icon: <Star size={14} aria-hidden />,
      count: (wishlist ?? []).length,
      content:
        (wishlist ?? []).length === 0 ? (
          <Empty>Aucune carte recherchée.</Empty>
        ) : (
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {(wishlist ?? []).map((w) => (
              <li key={w.id} className="min-w-0">
                <div className="card-tile aspect-[63/88]">
                  <CardImage base={w.image_url} alt={w.card_name} placeholder="compact" />
                </div>
                <p className="mt-1.5 truncate text-[11px]">{w.card_name}</p>
                <p className="truncate text-[10px] text-faint">
                  {w.priority === "high" ? "Priorité haute" : w.priority === "low" ? "Un jour" : w.set_name}
                  {w.target_price != null ? ` · cible ${formatEur(w.target_price)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ),
    },
    { key: "boutiques", label: "Boutiques", icon: <MapPin size={14} aria-hidden />, count: (sources ?? []).length, content: <AdminSourcesList ownerId={id} sources={sources ?? []} /> },
  ];

  return (
    <div className="flex flex-col gap-3.5">
      <Link href="/admin/utilisateurs" className="flex w-max items-center gap-1 text-[13px] text-muted transition hover:text-foreground">
        <ChevronLeft size={15} aria-hidden /> Utilisateurs
      </Link>

      {/* Identité */}
      <section className="panel p-5 sm:p-6" style={{ background: `radial-gradient(70% 120% at 0% 0%, hsl(${a.hue} 70% 50% / .16), var(--surface) 60%)` }}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 flex-1 basis-72">
            <div className="flex items-center gap-3.5">
              <Avatar name={a.name ?? a.email} hue={a.hue} size="lg" />
              <div className="min-w-0">
                <h2 className="display truncate text-2xl font-bold tracking-tight sm:text-[26px]">{a.name ?? "Sans pseudo"}</h2>
                <p className="mt-0.5 truncate text-[13px] text-muted">{a.email}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {a.admin && <Badge tone="accent">Admin</Badge>}
              {a.confirmed ? (
                <Badge tone="ok">
                  <MailCheck size={11} aria-hidden /> Email confirmé
                </Badge>
              ) : (
                <Badge tone="warn">
                  <MailWarning size={11} aria-hidden /> Email non confirmé
                </Badge>
              )}
              {a.banned && <Badge tone="ko">Suspendu</Badge>}
              <Badge tone={a.shared ? "ok" : "muted"}>{a.shared ? "Vitrine publique" : "Pas de vitrine"}</Badge>
              <span className="num rounded-md bg-raised px-1.5 py-0.5 text-[11px] text-muted">{a.id.slice(0, 8)}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
              <span className="flex items-center gap-1.5">
                <UserPlus size={13} aria-hidden /> Inscrit le <b className="text-foreground">{shortDate(a.createdAt, d.now)}</b>
              </span>
              <span className="flex items-center gap-1.5">
                <KeyRound size={13} aria-hidden /> Connexion le <b className="text-foreground">{shortDate(a.lastSignIn, d.now)}</b>
              </span>
              <span className="flex items-center gap-1.5 text-foreground">
                <Dot tone={activityTone(a.lastActivity, d.now)} /> Actif {relTime(a.lastActivity, d.now)}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ResetLinkButton email={a.email} />
            {shareToken ? (
              <Link href={`/vitrine/${shareToken}`} target="_blank" className="btn btn-ghost">
                <ExternalLink size={14} aria-hidden /> Voir sa vitrine
              </Link>
            ) : (
              <span className="btn btn-ghost pointer-events-none opacity-40">
                <ExternalLink size={14} aria-hidden /> Voir sa vitrine
              </span>
            )}
          </div>
        </div>
      </section>

      <StatStrip cols={5}>
        <StatCard label="Cartes" value={fmtInt(a.cards)} sub={`${fmtInt(a.refs)} références`} />
        <StatCard label="Valeur" value={stats.value != null ? formatEur(stats.value) : "—"} sub={stats.market != null ? `cote ${formatEur(stats.market)}` : "rien de valorisé"} />
        <StatCard label="Investi" value={formatEur(stats.invested)} sub="prix d'achat connus" />
        <StatCard
          label="Plus-value"
          value={stats.gain != null ? `${stats.gain >= 0 ? "+" : ""}${formatEur(stats.gain)}` : "—"}
          sub={stats.gainPct != null ? `${stats.gainPct >= 0 ? "+" : ""}${Math.round(stats.gainPct)} %` : "—"}
          tone={stats.gain != null ? (stats.gain >= 0 ? "up" : "down") : undefined}
        />
        <StatCard label="Scellés" value={fmtInt(a.sealed)} sub={`${a.sealedProducts} produit${a.sealedProducts > 1 ? "s" : ""}`} />
      </StatStrip>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="panel p-5">
          <PanelHead title="Valeur de la collection" hint="La même courbe que sur son tableau de bord : cartes et scellés" />
          {stats.valueSeries.length >= 2 ? (
            <ValueHistoryChart points={stats.valueSeries} minSpanRatio={0.08} height={190} />
          ) : (
            <Empty>Pas encore assez de relevés pour une courbe.</Empty>
          )}
        </section>
        <section className="panel p-5">
          <PanelHead title="Activité" hint="Ses derniers gestes" />
          <EventFeed events={events} accounts={accounts} now={d.now} />
        </section>
      </section>

      <UserTabs tabs={tabs} />
      <DangerZone userId={id} shared={shareToken != null} banned={a.banned} self={self} />
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">{children}</p>;
}
