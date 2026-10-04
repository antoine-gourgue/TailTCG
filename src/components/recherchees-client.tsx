"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { removeFromWishlist, updateWish, type WishPriority } from "@/app/recherchees/actions";
import { formatEur } from "@/lib/domain";
import { raritySymbol } from "@/lib/rarity";
import { CardImage } from "@/components/card-image";
import { Sheet } from "@/components/sheet";
import { Sparkline } from "@/components/sparkline";

export type WishItem = {
  id: string;
  tcgdexId: string;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  total: number | null;
  image: string | null;
  rarity: string | null;
  price: number | null;
  cmUrl: string | null;
  /** variation de la cote sur 30 jours, en % */
  delta: number | null;
  series: number[];
  priority: WishPriority;
  target: number | null;
  createdAt: string;
};

type Filter = "all" | "high" | "drop" | "under";
type SortKey = "price" | "date" | "name" | "drop";

const PRIORITY_LABEL: Record<WishPriority, string> = { high: "haute", normal: "normale", low: "basse" };
const PRIORITY_RANK: Record<WishPriority, number> = { high: 0, normal: 1, low: 2 };

const isDrop = (i: WishItem) => i.delta != null && i.delta <= -0.5;
const isUnder = (i: WishItem) => i.price != null && i.target != null && i.price <= i.target;
const isNear = (i: WishItem) => i.price != null && i.target != null && i.price > i.target && i.price <= i.target * 1.1;

export function WishlistClient({ items }: { items: WishItem[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [setSel, setSetSel] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("price");
  const [sortAsc, setSortAsc] = useState(false);
  const [editing, setEditing] = useState<WishItem | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const counts = {
    high: items.filter((i) => i.priority === "high").length,
    drop: items.filter(isDrop).length,
    under: items.filter(isUnder).length,
  };
  const budget = items.reduce((s, i) => s + (i.price ?? 0), 0);
  // Les plus gros mouvements de cote (hausses et baisses), pour la colonne de droite
  const movers = items
    .filter((i) => i.delta != null && Math.abs(i.delta) >= 0.5)
    .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))
    .slice(0, 4);
  const bySet = [
    ...items
      .reduce((m, i) => {
        const e = m.get(i.setId) ?? { id: i.setId, name: i.setName, count: 0, total: 0, images: [] as (string | null)[] };
        e.count += 1;
        e.total += i.price ?? 0;
        if (e.images.length < 3) e.images.push(i.image);
        return m.set(i.setId, e);
      }, new Map<string, { id: string; name: string; count: number; total: number; images: (string | null)[] }>())
      .values(),
  ].sort((a, b) => b.total - a.total || b.count - a.count);

  const dir = sortAsc ? 1 : -1;
  const shown = items
    .filter((i) => (filter === "all" || (filter === "high" ? i.priority === "high" : filter === "drop" ? isDrop(i) : isUnder(i))) && (setSel === "all" || i.setId === setSel))
    .sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name) * dir;
      if (sortKey === "date") return a.createdAt.localeCompare(b.createdAt) * dir;
      if (sortKey === "drop") return ((a.delta ?? 0) - (b.delta ?? 0)) * -dir;
      // cote : les non cotées à la fin, puis priorité
      if (a.price == null && b.price == null) return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (a.price == null) return 1;
      if (b.price == null) return -1;
      return (a.price - b.price) * dir;
    });

  const chip = (on: boolean) => `seg shrink-0 px-3.5 py-1.5 text-[13px] ${on ? "font-medium text-accent-strong" : "text-muted"}`;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
      <div className="min-w-0">
        {/* Filtres */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            <button type="button" data-on={filter === "all"} onClick={() => setFilter("all")} className={chip(filter === "all")}>
              Toutes <span className="num text-[11px] opacity-70">{items.length}</span>
            </button>
            {counts.high > 0 && (
              <button type="button" data-on={filter === "high"} onClick={() => setFilter("high")} className={chip(filter === "high")}>
                Priorité haute <span className="num text-[11px] opacity-70">{counts.high}</span>
              </button>
            )}
            {counts.drop > 0 && (
              <button type="button" data-on={filter === "drop"} onClick={() => setFilter("drop")} className={chip(filter === "drop")}>
                En baisse <span className="num text-[11px] opacity-70">{counts.drop}</span>
              </button>
            )}
            {counts.under > 0 && (
              <button type="button" data-on={filter === "under"} onClick={() => setFilter("under")} className={chip(filter === "under")}>
                Sous la cible <span className="num text-[11px] opacity-70">{counts.under}</span>
              </button>
            )}
            {bySet.length > 1 && (
              <select value={setSel} onChange={(e) => setSetSel(e.target.value)} data-on={setSel !== "all"} aria-label="Set" className="pill-select !w-auto text-[13px]">
                <option value="all">Tous les sets</option>
                {bySet.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.count}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} aria-label="Tri" className="pill-select !w-auto text-[13px]">
              <option value="price">Tri : cote</option>
              <option value="drop">Tri : variation</option>
              <option value="date">Tri : date d’ajout</option>
              <option value="name">Tri : nom</option>
            </select>
            <button type="button" onClick={() => setSortAsc((v) => !v)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground" title={sortAsc ? "Croissant" : "Décroissant"} aria-label={sortAsc ? "Tri croissant" : "Tri décroissant"}>
              {sortAsc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
            </button>
          </div>
        </div>

        {/* Rangées */}
        <ul className="panel divide-y divide-ring !px-4 !py-1 sm:!px-5">
          {shown.length === 0 && <li className="py-6 text-center text-sm text-muted">Aucune carte pour ce filtre.</li>}
          {shown.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <Link href={`/ajouter?card=${encodeURIComponent(i.tcgdexId)}`} className="h-[72px] w-[52px] shrink-0 overflow-hidden rounded-md bg-raised shadow-sm">
                <CardImage base={i.image} alt={i.name} placeholder="compact" />
              </Link>
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-medium">
                  <Link href={`/ajouter?card=${encodeURIComponent(i.tcgdexId)}`} className="hover:text-accent-strong">
                    {i.name}
                  </Link>
                  {raritySymbol(i.rarity) && <span className="ml-1.5 text-xs text-accent-strong">{raritySymbol(i.rarity)}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  <Link href={`/extensions/${encodeURIComponent(i.setId)}`} className="hover:text-foreground">
                    {i.setName}
                  </Link>{" "}
                  <span className="num">
                    · {i.localId}
                    {i.total ? `/${i.total}` : ""}
                  </span>
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={`rounded-full px-2 py-0.5 ${i.priority === "high" ? "bg-accent-soft text-accent-strong" : i.priority === "low" ? "bg-raised text-faint" : "bg-raised text-muted"}`}>Priorité {PRIORITY_LABEL[i.priority]}</span>
                  {isUnder(i) && <span className="text-gain">sous la cible ✓</span>}
                  {isNear(i) && <span className="text-gain">sous la cible bientôt</span>}
                </p>
              </div>
              <div className="w-[108px] shrink-0 text-right">
                <p className="label-xs !text-[10px] text-muted">Cote</p>
                <p className="num text-base font-bold leading-tight">{i.price != null ? formatEur(i.price) : <span className="text-sm font-normal text-faint">—</span>}</p>
                {i.delta != null ? (
                  <p className={`num text-[11px] ${i.delta > 0 ? "text-gain" : i.delta < 0 ? "text-loss" : "text-muted"}`}>
                    {i.delta > 0 ? "+" : ""}
                    {Math.round(i.delta)} % · 30 j
                  </p>
                ) : (
                  <p className="text-[11px] text-faint">relevé en cours</p>
                )}
              </div>
              <div className="hidden w-[76px] shrink-0 md:block">
                <Sparkline values={i.series} className="h-6 w-full" />
              </div>
              <button type="button" onClick={() => setEditing(i)} className="w-[88px] shrink-0 text-right transition hover:text-accent-strong" title="Modifier le prix cible">
                <span className="label-xs !text-[10px] block text-muted">Prix cible</span>
                <span className="num text-sm font-semibold">{i.target != null ? formatEur(i.target) : <span className="font-normal text-faint">—</span>}</span>
              </button>
              <div className="relative flex shrink-0 items-center gap-1.5">
                <Link href={`/ajouter?card=${encodeURIComponent(i.tcgdexId)}`} className="btn btn-primary !py-1.5 text-[13px]">
                  Trouvée !
                </Link>
                {i.cmUrl && (
                  <a href={i.cmUrl} target="_blank" rel="noreferrer" title="Voir sur Cardmarket" aria-label="Voir sur Cardmarket" className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground">
                    <ExternalLink size={14} aria-hidden />
                  </a>
                )}
                <button type="button" onClick={() => setMenu(menu === i.id ? null : i.id)} aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={menu === i.id} className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground">
                  <MoreHorizontal size={15} aria-hidden />
                </button>
                {menu === i.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setMenu(null)} aria-hidden />
                    <div role="menu" className="panel absolute right-0 top-full z-20 mt-1 min-w-48 !p-1">
                      <button
                        type="button"
                        onClick={() => {
                          setMenu(null);
                          setEditing(i);
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-raised"
                      >
                        <Pencil size={14} aria-hidden /> Priorité et prix cible
                      </button>
                      <form action={removeFromWishlist}>
                        <input type="hidden" name="wish_id" value={i.id} />
                        <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-loss transition hover:bg-raised">
                          <Trash2 size={14} aria-hidden /> Retirer des recherchées
                        </button>
                      </form>
                    </div>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Colonne de droite : mouvements de cote, puis les sets avec leur part du budget */}
      <div className="flex flex-col gap-4">
        <section className="panel p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="display text-[15px] font-semibold">Cotes en mouvement</h2>
            <span className="text-[11px] text-muted">30 jours</span>
          </div>
          {movers.length === 0 ? (
            <p className="mt-3 rounded-xl bg-raised/60 px-3 py-2.5 text-xs text-muted">Relevé en cours : les variations apparaissent après quelques nuits.</p>
          ) : (
            <ul className="mt-2 divide-y divide-ring">
              {movers.map((i) => (
                <li key={i.id}>
                  <Link href={`/ajouter?card=${encodeURIComponent(i.tcgdexId)}`} className="group flex items-center gap-3 py-2">
                    <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-raised shadow-sm">
                      <CardImage base={i.image} alt="" placeholder="compact" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium group-hover:text-accent-strong">{i.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {i.setName} · {i.localId}
                        {i.price != null && <span className="num"> · {formatEur(i.price)}</span>}
                      </span>
                    </span>
                    <span className={`num shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${i.delta! < 0 ? "bg-loss/15 text-loss" : "bg-gain/15 text-gain"}`}>
                      {i.delta! > 0 ? "+" : ""}
                      {Math.round(i.delta!)} %
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="display text-[15px] font-semibold">Par set</h2>
          <p className="text-xs text-muted">Ce qu’il te manque, set par set · clique pour filtrer.</p>
          <ul className="mt-1 divide-y divide-ring">
            {bySet.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => setSetSel(setSel === s.id ? "all" : s.id)} aria-pressed={setSel === s.id} className="w-full py-2.5 text-left">
                  <span className="flex items-center gap-3">
                    <span className="flex shrink-0 -space-x-2">
                      {s.images.map((img, k) => (
                        <span key={k} className="h-10 w-[30px] overflow-hidden rounded bg-raised ring-2 ring-surface">
                          <CardImage base={img} alt="" placeholder="compact" />
                        </span>
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm font-medium ${setSel === s.id ? "text-accent-strong" : ""}`}>{s.name}</span>
                      <span className="num block text-[11px] text-muted">
                        {s.count} carte{s.count > 1 ? "s" : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-sm font-semibold">{s.total > 0 ? formatEur(s.total) : <span className="font-normal text-faint">—</span>}</span>
                      {budget > 0 && s.total > 0 && <span className="num block text-[11px] text-muted">{Math.round((s.total / budget) * 100)} % du budget</span>}
                    </span>
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-raised" aria-hidden>
                    <span className={`block h-full rounded-full ${setSel === s.id ? "bg-accent-strong" : "bg-accent"}`} style={{ width: `${budget > 0 ? Math.max(2, Math.round((s.total / budget) * 100)) : 0}%` }} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Priorité et prix cible */}
      <Sheet open={editing != null} onClose={() => setEditing(null)} title={editing?.name ?? ""} description={editing ? `${editing.setName} · ${editing.localId}` : undefined} size="sm">
        {editing && (
          <form
            action={async (fd) => {
              await updateWish(fd);
              setEditing(null);
            }}
            className="flex flex-col gap-4"
          >
            <input type="hidden" name="wish_id" value={editing.id} />
            <div>
              <p className="label-xs mb-1.5">Priorité</p>
              <PrioritySeg initial={editing.priority} />
            </div>
            <div>
              <label htmlFor="target_price" className="label-xs mb-1.5 block">
                Prix cible (€) <span className="font-normal normal-case text-faint">vide = aucun</span>
              </label>
              <input id="target_price" name="target_price" type="text" inputMode="decimal" defaultValue={editing.target != null ? String(editing.target).replace(".", ",") : ""} placeholder={editing.price != null ? String(Math.round(editing.price * 0.9 * 100) / 100).replace(".", ",") : "ex. 45"} className="field num" />
              {editing.price != null && <p className="mt-1 text-xs text-muted">Cote actuelle {formatEur(editing.price)}. Tu seras signalé « sous la cible » dès que la cote passe dessous.</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="btn btn-primary">
                Enregistrer
              </button>
              <button type="button" onClick={() => setEditing(null)} className="btn btn-ghost">
                Annuler
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}

function PrioritySeg({ initial }: { initial: WishPriority }) {
  const [p, setP] = useState<WishPriority>(initial);
  return (
    <div className="flex gap-2">
      <input type="hidden" name="priority" value={p} />
      {(["high", "normal", "low"] as WishPriority[]).map((k) => (
        <button key={k} type="button" data-on={p === k} onClick={() => setP(k)} className={`seg px-3.5 py-1.5 text-sm capitalize ${p === k ? "font-medium text-accent-strong" : "text-muted"}`}>
          {PRIORITY_LABEL[k]}
        </button>
      ))}
    </div>
  );
}
