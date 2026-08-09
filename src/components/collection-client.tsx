"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List, ArrowUp, ArrowDown } from "lucide-react";
import { formatEur } from "@/lib/domain";
import { CardImage } from "@/components/card-image";
import { Logo } from "@/components/logo";

export type CollectionItem = {
  id: string;
  tcgdex_id: string;
  card_name: string;
  set_name: string;
  set_id: string;
  local_id: string;
  image_url: string;
  card_type: string | null;
  language: string;
  condition: string;
  quantity: number;
  purchase_price: number | null;
  purchase_date: string | null;
  manual_price: number | null;
  source_id: string | null;
  graded: boolean;
  grade: string | null;
  created_at: string;
  current_price: number | null;
  gain: number | null;
  sold_price: number | null;
  sold_at: string | null;
  photo_fallback?: string | null;
};

/** minuscules sans accents, pour la recherche texte */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type SourceRef = { id: string; name: string };

type SortKey = "name" | "paid" | "price" | "gain" | "date";

function GainText({ value }: { value: number | null }) {
  if (value == null) return <span className="num text-faint">—</span>;
  const cls = value > 0 ? "text-gain" : value < 0 ? "text-loss" : "text-muted";
  return (
    <span className={`num ${cls}`}>
      {value > 0 ? "+" : ""}
      {formatEur(value)}
    </span>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "up" | "down";
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="label-xs">{label}</span>
      <span
        className={`display num text-xl font-bold leading-none ${
          tone === "up" ? "text-gain" : tone === "down" ? "text-loss" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function CollectionClient({
  items,
  sources,
  initialSource = "",
  initialSet = "",
}: {
  items: CollectionItem[];
  sources: SourceRef[];
  initialSource?: string;
  initialSet?: string;
}) {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [q, setQ] = useState("");
  const [fSold, setFSold] = useState<"active" | "sold" | "all">("active");
  const [fSet, setFSet] = useState(initialSet);
  const [fCondition, setFCondition] = useState("");
  const [fType, setFType] = useState("");
  const [fLanguage, setFLanguage] = useState("");
  const [fSource, setFSource] = useState(initialSource);
  const [fGraded, setFGraded] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sourceName = useMemo(
    () => new Map(sources.map((s) => [s.id, s.name])),
    [sources]
  );

  const sets = useMemo(
    () =>
      [...new Map(items.map((i) => [i.set_id, i.set_name])).entries()].sort(
        (a, b) => a[1].localeCompare(b[1], "fr")
      ),
    [items]
  );
  const conditions = useMemo(
    () => [...new Set(items.map((i) => i.condition))],
    [items]
  );
  const types = useMemo(
    () => [...new Set(items.map((i) => i.card_type).filter(Boolean))] as string[],
    [items]
  );
  const languages = useMemo(
    () => [...new Set(items.map((i) => i.language))],
    [items]
  );

  const filtered = useMemo(() => {
    const needle = normalize(q.trim());
    const list = items.filter(
      (i) =>
        (fSold === "all" ||
          (fSold === "sold" ? i.sold_at != null : i.sold_at == null)) &&
        (!needle ||
          normalize(`${i.card_name} ${i.set_name} ${i.local_id}`).includes(
            needle
          )) &&
        (!fSet || i.set_id === fSet) &&
        (!fCondition || i.condition === fCondition) &&
        (!fType || i.card_type === fType) &&
        (!fLanguage || i.language === fLanguage) &&
        (!fSource || i.source_id === fSource) &&
        (!fGraded || (fGraded === "oui" ? i.graded : !i.graded))
    );

    const dir = sortAsc ? 1 : -1;
    const cmp: Record<SortKey, (a: CollectionItem, b: CollectionItem) => number> = {
      name: (a, b) => a.card_name.localeCompare(b.card_name, "fr"),
      paid: (a, b) => (a.purchase_price ?? -1) - (b.purchase_price ?? -1),
      price: (a, b) => (a.current_price ?? -1) - (b.current_price ?? -1),
      gain: (a, b) =>
        (a.gain ?? Number.NEGATIVE_INFINITY) - (b.gain ?? Number.NEGATIVE_INFINITY),
      date: (a, b) =>
        (a.purchase_date ?? a.created_at).localeCompare(b.purchase_date ?? b.created_at),
    };
    return [...list].sort((a, b) => dir * cmp[sortKey](a, b));
  }, [items, q, fSold, fSet, fCondition, fType, fLanguage, fSource, fGraded, sortKey, sortAsc]);

  const summary = useMemo(() => {
    let count = 0;
    let invested = 0;
    let value = 0;
    let hasValue = false;
    for (const i of filtered) {
      count += i.quantity;
      if (i.purchase_price != null) invested += i.purchase_price * i.quantity;
      if (i.current_price != null) {
        value += i.current_price * i.quantity;
        hasValue = true;
      }
    }
    return {
      count,
      invested,
      value: hasValue ? value : null,
      gain: hasValue ? value - invested : null,
    };
  }, [filtered]);

  if (items.length === 0) {
    return (
      <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
        <Logo variant="mark" size={56} />
        <p className="display text-xl font-semibold">Ton classeur est vide</p>
        <p className="max-w-sm text-sm text-muted">
          Cherche une carte par son nom, l&apos;image et le set se remplissent
          tout seuls — il ne reste qu&apos;à noter l&apos;état et le prix.
        </p>
        <Link href="/recherche" className="btn btn-primary mt-2">
          Ajouter ma première carte
        </Link>
      </div>
    );
  }

  const selectCls = "field !w-auto text-[13px]";

  return (
    <div>
      {/* Résumé : la valeur du classeur, toujours visible */}
      <div className="panel rise-in mb-5 flex flex-col gap-4 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-10 sm:px-6">
        <div className="grid grid-cols-2 gap-4 sm:contents">
          <Stat label="Cartes" value={summary.count} />
          <Stat label="Investi" value={formatEur(summary.invested)} />
          <Stat label="Valeur estimée" value={formatEur(summary.value)} />
          <Stat
            label="Plus-value"
            value={
              summary.gain == null
                ? "—"
                : `${summary.gain > 0 ? "+" : ""}${formatEur(summary.gain)}`
            }
            tone={
              summary.gain == null ? undefined : summary.gain >= 0 ? "up" : "down"
            }
          />
        </div>
        <div className="flex items-center sm:ml-auto">
          <div className="flex overflow-hidden rounded-lg border border-edge">
            <button
              type="button"
              onClick={() => setView("grid")}
              aria-pressed={view === "grid"}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] transition ${
                view === "grid"
                  ? "bg-accent-soft font-medium text-accent-strong"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <LayoutGrid size={13} aria-hidden /> Grille
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              aria-pressed={view === "table"}
              className={`flex items-center gap-1.5 border-l border-edge px-3 py-1.5 text-[13px] transition ${
                view === "table"
                  ? "bg-accent-soft font-medium text-accent-strong"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <List size={13} aria-hidden /> Tableau
            </button>
          </div>
        </div>
      </div>

      {/* Filtres et tri */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Chercher dans ma collection…"
          className="field !w-52 text-[13px]"
        />
        <select
          value={fSold}
          onChange={(e) => setFSold(e.target.value as "active" | "sold" | "all")}
          className={selectCls}
        >
          <option value="active">En collection</option>
          <option value="sold">Vendues</option>
          <option value="all">Toutes</option>
        </select>
        <select value={fSet} onChange={(e) => setFSet(e.target.value)} className={selectCls}>
          <option value="">Tous les sets</option>
          {sets.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        <select
          value={fCondition}
          onChange={(e) => setFCondition(e.target.value)}
          className={selectCls}
        >
          <option value="">Tous états</option>
          {conditions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {types.length > 0 && (
          <select value={fType} onChange={(e) => setFType(e.target.value)} className={selectCls}>
            <option value="">Tous types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {languages.length > 1 && (
          <select
            value={fLanguage}
            onChange={(e) => setFLanguage(e.target.value)}
            className={selectCls}
          >
            <option value="">Toutes langues</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        )}
        {sources.length > 0 && (
          <select
            value={fSource}
            onChange={(e) => setFSource(e.target.value)}
            className={selectCls}
          >
            <option value="">Toutes sources</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select value={fGraded} onChange={(e) => setFGraded(e.target.value)} className={selectCls}>
          <option value="">Gradée ou non</option>
          <option value="oui">Gradées</option>
          <option value="non">Non gradées</option>
        </select>

        <span className="mx-1 hidden h-5 w-px bg-edge sm:block" />

        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className={selectCls}
        >
          <option value="date">Tri : date d&apos;achat</option>
          <option value="name">Tri : nom</option>
          <option value="paid">Tri : prix payé</option>
          <option value="price">Tri : valeur estimée</option>
          <option value="gain">Tri : plus-value</option>
        </select>
        <button
          type="button"
          onClick={() => setSortAsc((v) => !v)}
          className="btn btn-ghost !px-2.5 !py-1.5"
          title={sortAsc ? "Croissant" : "Décroissant"}
        >
          {sortAsc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Aucune carte ne correspond aux filtres.</p>
      ) : view === "grid" ? (
        <ul className="rise-in grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((item) => (
            <li key={item.id}>
              <Link href={`/carte/${item.id}`} className="group block">
                <div className="card-tile aspect-[63/88]">
                  <CardImage
                    base={item.image_url || null}
                    alt={item.card_name}
                    fallback={item.photo_fallback ?? null}
                  />
                  <span className="tile-badge num left-1.5 top-1.5">
                    {item.condition}
                  </span>
                  {item.quantity > 1 && (
                    <span className="tile-badge num right-1.5 top-1.5">
                      ×{item.quantity}
                    </span>
                  )}
                  {item.graded && (
                    <span className="tile-badge bottom-1.5 left-1.5 !bg-accent !text-accent-ink">
                      {item.grade ?? "Gradée"}
                    </span>
                  )}
                  {item.sold_at != null && (
                    <span className="tile-badge bottom-1.5 right-1.5 !bg-gain !text-black">
                      Vendue
                    </span>
                  )}
                </div>
                <div className="mt-2.5 px-0.5">
                  <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                    {item.card_name}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted">
                    {item.set_name} <span className="num text-faint">· {item.local_id}</span>
                  </p>
                  <p className="mt-1 flex items-baseline gap-1.5 text-xs">
                    <span className="num text-faint">{formatEur(item.purchase_price)}</span>
                    <span className="text-faint">→</span>
                    <span className="num font-medium">{formatEur(item.current_price)}</span>
                    <span className="ml-auto">
                      <GainText value={item.gain} />
                    </span>
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel rise-in overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-edge text-left">
                <th className="label-xs px-4 py-3">Carte</th>
                <th className="label-xs px-4 py-3">Set</th>
                <th className="label-xs px-4 py-3">N°</th>
                <th className="label-xs px-4 py-3">État</th>
                <th className="label-xs px-4 py-3">Type</th>
                <th className="label-xs px-4 py-3">Qté</th>
                <th className="label-xs px-4 py-3 text-right">Payé</th>
                <th className="label-xs px-4 py-3 text-right">Estimé</th>
                <th className="label-xs px-4 py-3 text-right">+/-</th>
                <th className="label-xs px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-edge/50 transition last:border-0 hover:bg-raised"
                >
                  <td className="px-4 py-2.5">
                    <Link href={`/carte/${item.id}`} className="font-medium hover:text-accent-strong">
                      {item.card_name}
                    </Link>
                    {item.graded && (
                      <span className="ml-2 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">
                        {item.grade ?? "Gradée"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{item.set_name}</td>
                  <td className="num px-4 py-2.5 text-muted">{item.local_id}</td>
                  <td className="num px-4 py-2.5">{item.condition}</td>
                  <td className="px-4 py-2.5 text-muted">{item.card_type ?? "—"}</td>
                  <td className="num px-4 py-2.5">{item.quantity}</td>
                  <td className="num px-4 py-2.5 text-right">{formatEur(item.purchase_price)}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">
                    {formatEur(item.current_price)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <GainText value={item.gain} />
                  </td>
                  <td className="px-4 py-2.5 text-muted">
                    {item.source_id ? sourceName.get(item.source_id) ?? "—" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
