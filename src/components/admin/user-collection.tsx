"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, Rows3 } from "lucide-react";
import { formatEur } from "@/lib/domain";
import { CardImage } from "@/components/card-image";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const PAGE = 48;

export type AdminCardRow = {
  id: string;
  name: string;
  set: string;
  localId: string;
  image: string | null;
  condition: string;
  language: string;
  qty: number;
  /** valeur saisie */
  value: number | null;
  /** cote Cardmarket du jour */
  market: number | null;
  sold: boolean;
  trash: boolean;
  graded: boolean;
  createdAt: string | null;
};

type CardFilter = "live" | "sold" | "trash" | "all";
type CardSort = "value" | "recent" | "name" | "set";

/** Toutes les cartes d'un compte : recherche, statut, tri, vignettes ou tableau d'édition */
export function UserCardsBrowser({ ownerId, cards, table }: { ownerId: string; cards: AdminCardRow[]; table: ReactNode }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CardFilter>("live");
  const [sort, setSort] = useState<CardSort>("value");
  const [asc, setAsc] = useState(false);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(
    () => ({
      live: cards.filter((c) => !c.sold && !c.trash).length,
      sold: cards.filter((c) => c.sold && !c.trash).length,
      trash: cards.filter((c) => c.trash).length,
      all: cards.length,
    }),
    [cards],
  );

  const rows = useMemo(() => {
    const needle = norm(q.trim());
    const price = (c: AdminCardRow) => c.value ?? c.market ?? 0;
    const keep = (c: AdminCardRow) => {
      if (needle && !norm(`${c.name} ${c.set} ${c.localId}`).includes(needle)) return false;
      if (filter === "live") return !c.sold && !c.trash;
      if (filter === "sold") return c.sold && !c.trash;
      if (filter === "trash") return c.trash;
      return true;
    };
    const cmp = (a: AdminCardRow, b: AdminCardRow) => {
      if (sort === "value") return price(a) - price(b);
      if (sort === "recent") return (a.createdAt ?? "").localeCompare(b.createdAt ?? "");
      if (sort === "name") return a.name.localeCompare(b.name, "fr");
      return a.set.localeCompare(b.set, "fr") || a.localId.localeCompare(b.localId, "fr", { numeric: true });
    };
    const out = cards.filter(keep).sort(cmp);
    // Nom et set se lisent naturellement de A à Z : le sens par défaut s'inverse pour eux
    const natural = sort === "name" || sort === "set";
    return natural ? (asc ? out.reverse() : out) : asc ? out : out.reverse();
  }, [cards, q, filter, sort, asc]);

  const chips: { key: CardFilter; label: string }[] = [
    { key: "live", label: "En collection" },
    { key: "sold", label: "Vendues" },
    { key: "trash", label: "Corbeille" },
    { key: "all", label: "Toutes" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setLimit(PAGE);
          }}
          placeholder="Nom, set ou numéro…"
          aria-label="Chercher une carte"
          className="pill-input min-w-0 flex-1 basis-full sm:max-w-xs sm:basis-auto"
        />
        <div className="flex flex-wrap gap-1.5">
          {chips
            .filter((c) => c.key === "live" || c.key === "all" || counts[c.key] > 0)
            .map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setFilter(c.key);
                  setLimit(PAGE);
                }}
                data-on={filter === c.key}
                className="seg rounded-full px-3 py-1.5 text-xs font-medium"
              >
                {c.label} <span className="num ml-0.5 opacity-60">{counts[c.key]}</span>
              </button>
            ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {view === "grid" && (
            <>
              <select value={sort} onChange={(e) => setSort(e.target.value as CardSort)} className="pill-select" aria-label="Trier">
                <option value="value">Valeur</option>
                <option value="recent">Ajout</option>
                <option value="name">Nom</option>
                <option value="set">Set et numéro</option>
              </select>
              <button type="button" onClick={() => setAsc((v) => !v)} className="btn btn-ghost !px-2.5 !py-1.5" aria-label={asc ? "Tri croissant" : "Tri décroissant"}>
                {asc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
              </button>
            </>
          )}
          <button type="button" onClick={() => setView(view === "grid" ? "table" : "grid")} className="btn btn-ghost !px-3 !py-1.5 text-xs">
            {view === "grid" ? <Rows3 size={13} aria-hidden /> : <LayoutGrid size={13} aria-hidden />}
            {view === "grid" ? "Tableau" : "Vignettes"}
          </button>
        </div>
      </div>

      {view === "table" ? (
        <div className="mt-4">{table}</div>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">Aucune carte ne correspond.</p>
      ) : (
        <>
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {rows.slice(0, limit).map((c) => {
              const price = c.value ?? c.market;
              return (
                <li key={c.id} className="min-w-0">
                  <Link href={`/admin/utilisateurs/${ownerId}/carte/${c.id}`} className="group block">
                    <div className={`card-tile relative aspect-[63/88] ${c.trash || c.sold ? "opacity-55" : ""}`}>
                      <CardImage base={c.image} alt={c.name} placeholder="compact" />
                      {c.qty > 1 && <span className="num absolute right-1 top-1 rounded-md bg-black/75 px-1.5 py-px text-[10.5px] font-bold text-white">×{c.qty}</span>}
                      {(c.trash || c.sold || c.graded) && (
                        <span
                          className={`absolute bottom-1 left-1 rounded-md px-1.5 py-px text-[9.5px] font-bold text-white ${c.trash ? "bg-loss" : c.sold ? "bg-black/75" : "bg-emerald-600"}`}
                        >
                          {c.trash ? "Corbeille" : c.sold ? "Vendue" : "Gradée"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 flex items-baseline justify-between gap-1.5 text-[11px]">
                      <span className="truncate group-hover:text-accent-strong">{c.name}</span>
                      <span className="num shrink-0 font-semibold">{price != null ? formatEur(price) : "—"}</span>
                    </p>
                    <p className="truncate text-[10px] text-faint">
                      {c.condition} · {c.language}
                      {c.value != null ? " · saisie" : c.market != null ? " · cote" : ""}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-faint">
              {Math.min(limit, rows.length)} sur {rows.length} carte{rows.length > 1 ? "s" : ""}
            </span>
            {rows.length > limit && (
              <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                Afficher {Math.min(PAGE, rows.length - limit)} de plus
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export type AdminSealedRow = {
  id: number;
  name: string;
  kind: string;
  set: string;
  image: string;
  qty: number;
  lots: number;
  value: number | null;
  paid: number | null;
  manual: boolean;
  lastAt: string | null;
};
type SealedSort = "value" | "qty" | "recent" | "name";

/** Tous les scellés d'un compte, par produit : recherche, tri, lien vers la fiche du produit */
export function UserSealedBrowser({ ownerId, products }: { ownerId: string; products: AdminSealedRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SealedSort>("value");

  const rows = useMemo(() => {
    const needle = norm(q.trim());
    const out = products.filter((p) => !needle || norm(`${p.name} ${p.set} ${p.kind}`).includes(needle));
    return out.sort((a, b) =>
      sort === "value" ? (b.value ?? 0) - (a.value ?? 0) : sort === "qty" ? b.qty - a.qty : sort === "recent" ? (b.lastAt ?? "").localeCompare(a.lastAt ?? "") : a.name.localeCompare(b.name, "fr"),
    );
  }, [products, q, sort]);

  if (products.length === 0) return <p className="rounded-xl bg-raised/60 px-4 py-6 text-center text-sm text-muted">Aucun produit scellé.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Produit, set ou type…" aria-label="Chercher un scellé" className="pill-input min-w-0 flex-1 basis-full sm:max-w-xs sm:basis-auto" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SealedSort)} className="pill-select ml-auto" aria-label="Trier">
          <option value="value">Valeur</option>
          <option value="qty">Quantité</option>
          <option value="recent">Ajout</option>
          <option value="name">Nom</option>
        </select>
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map((p) => {
          const gain = p.value != null && p.paid != null && p.paid > 0 ? p.value - p.paid : null;
          return (
            <li key={p.id}>
              <Link href={`/admin/utilisateurs/${ownerId}/scelle/${p.id}`} className="group block overflow-hidden rounded-2xl bg-surface ring-1 ring-ring transition hover:ring-edge-strong">
                <div className="relative aspect-[4/3] bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-contain p-2.5" />
                  <span className="num absolute right-1.5 top-1.5 rounded-md bg-black/75 px-1.5 py-px text-[10.5px] font-bold text-white">×{p.qty}</span>
                  {gain != null && (
                    <span className={`num absolute left-1.5 top-1.5 rounded-md px-1.5 py-px text-[10px] font-bold text-white ${gain >= 0 ? "bg-emerald-600" : "bg-loss"}`}>
                      {gain >= 0 ? "+" : ""}
                      {Math.round((gain / p.paid!) * 100)} %
                    </span>
                  )}
                </div>
                <div className="p-2.5">
                  <p className="line-clamp-2 min-h-[2lh] text-xs font-semibold leading-tight group-hover:text-accent-strong">{p.name}</p>
                  <p className="mt-0.5 truncate text-[10.5px] text-muted">
                    {p.kind} · {p.set}
                  </p>
                  <p className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                    <span className="num font-bold">{p.value != null ? formatEur(p.value) : "—"}</span>
                    <span className="text-[10px] text-faint">
                      {p.lots > 1 ? `${p.lots} lots` : "1 lot"}
                      {p.manual ? " · saisie" : ""}
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
