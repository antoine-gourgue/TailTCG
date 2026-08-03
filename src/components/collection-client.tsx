"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatEur } from "@/lib/domain";

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
};

export type SourceRef = { id: string; name: string };

type SortKey = "name" | "paid" | "price" | "gain" | "date";

const selectCls =
  "rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-sm text-foreground focus:border-neutral-500 focus:outline-none";

function GainText({ value }: { value: number | null }) {
  if (value == null) return <span className="num text-muted">—</span>;
  const cls = value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-muted";
  return (
    <span className={`num ${cls}`}>
      {value > 0 ? "+" : ""}
      {formatEur(value)}
    </span>
  );
}

export function CollectionClient({
  items,
  sources,
  initialSource = "",
}: {
  items: CollectionItem[];
  sources: SourceRef[];
  initialSource?: string;
}) {
  const [view, setView] = useState<"grid" | "table">("grid");
  const [fSet, setFSet] = useState("");
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
    const list = items.filter(
      (i) =>
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
      gain: (a, b) => (a.gain ?? Number.NEGATIVE_INFINITY) - (b.gain ?? Number.NEGATIVE_INFINITY),
      date: (a, b) =>
        (a.purchase_date ?? a.created_at).localeCompare(b.purchase_date ?? b.created_at),
    };
    return [...list].sort((a, b) => dir * cmp[sortKey](a, b));
  }, [items, fSet, fCondition, fType, fLanguage, fSource, fGraded, sortKey, sortAsc]);

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
      <div className="rounded-xl border border-edge bg-surface p-10 text-center">
        <p className="mb-2 text-lg">Ton classeur est vide.</p>
        <p className="text-sm text-muted">
          Passe par la{" "}
          <Link href="/recherche" className="underline hover:text-foreground">
            recherche
          </Link>{" "}
          pour ajouter ta première carte.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* Barre de résumé collée en haut */}
      <div className="sticky top-0 z-10 -mx-4 mb-6 border-b border-edge bg-background/85 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline gap-x-8 gap-y-1">
          <p className="text-sm text-muted">
            <span className="num text-lg font-semibold text-foreground">
              {summary.count}
            </span>{" "}
            carte{summary.count > 1 ? "s" : ""}
          </p>
          <p className="text-sm text-muted">
            Investi{" "}
            <span className="num text-lg font-semibold text-foreground">
              {formatEur(summary.invested)}
            </span>
          </p>
          <p className="text-sm text-muted">
            Valeur estimée{" "}
            <span className="num text-lg font-semibold text-foreground">
              {formatEur(summary.value)}
            </span>
          </p>
          <p className="text-sm text-muted">
            Plus-value{" "}
            <span className="text-lg font-semibold">
              <GainText value={summary.gain} />
            </span>
          </p>
        </div>
      </div>

      {/* Filtres, tri, bascule */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
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
          className={`${selectCls} num`}
          title={sortAsc ? "Croissant" : "Décroissant"}
        >
          {sortAsc ? "↑" : "↓"}
        </button>

        <button
          type="button"
          onClick={() => setView(view === "grid" ? "table" : "grid")}
          className={`${selectCls} ml-auto`}
        >
          {view === "grid" ? "☰ Tableau" : "▦ Grille"}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Aucune carte ne correspond aux filtres.</p>
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((item) => (
            <li key={item.id}>
              <Link href={`/carte/${item.id}`}>
                <div className="card-tile aspect-[63/88] bg-surface">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${item.image_url}/low.webp`}
                      alt={item.card_name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted">
                      🃏
                    </div>
                  )}
                  <span className="num absolute left-1.5 top-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold">
                    {item.condition}
                  </span>
                  {item.quantity > 1 && (
                    <span className="num absolute right-1.5 top-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[11px]">
                      ×{item.quantity}
                    </span>
                  )}
                  {item.graded && (
                    <span className="absolute bottom-1.5 left-1.5 z-10 rounded bg-amber-400/90 px-1.5 py-0.5 text-[11px] font-semibold text-black">
                      {item.grade ?? "Gradée"}
                    </span>
                  )}
                </div>
                <div className="mt-2 px-0.5">
                  <p className="truncate text-sm font-medium">{item.card_name}</p>
                  <p className="truncate text-xs text-muted">
                    {item.set_name} <span className="num">· {item.local_id}</span>
                  </p>
                  <p className="mt-0.5 text-xs">
                    <span className="num text-muted">
                      {formatEur(item.purchase_price)}
                    </span>
                    {" → "}
                    <span className="num">{formatEur(item.current_price)}</span>{" "}
                    <GainText value={item.gain} />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-edge">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-edge bg-surface text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-3 py-2 font-medium">Carte</th>
                <th className="px-3 py-2 font-medium">Set</th>
                <th className="px-3 py-2 font-medium">N°</th>
                <th className="px-3 py-2 font-medium">État</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Qté</th>
                <th className="px-3 py-2 text-right font-medium">Payé</th>
                <th className="px-3 py-2 text-right font-medium">Estimé</th>
                <th className="px-3 py-2 text-right font-medium">+/-</th>
                <th className="px-3 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-b border-edge/50 last:border-0 hover:bg-surface">
                  <td className="px-3 py-2">
                    <Link href={`/carte/${item.id}`} className="font-medium hover:underline">
                      {item.card_name}
                    </Link>
                    {item.graded && (
                      <span className="ml-2 rounded bg-amber-400/90 px-1 py-0.5 text-[10px] font-semibold text-black">
                        {item.grade ?? "Gradée"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted">{item.set_name}</td>
                  <td className="num px-3 py-2 text-muted">{item.local_id}</td>
                  <td className="num px-3 py-2">{item.condition}</td>
                  <td className="px-3 py-2 text-muted">{item.card_type ?? "—"}</td>
                  <td className="num px-3 py-2">{item.quantity}</td>
                  <td className="num px-3 py-2 text-right">{formatEur(item.purchase_price)}</td>
                  <td className="num px-3 py-2 text-right">{formatEur(item.current_price)}</td>
                  <td className="px-3 py-2 text-right">
                    <GainText value={item.gain} />
                  </td>
                  <td className="px-3 py-2 text-muted">
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
