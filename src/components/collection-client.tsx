"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  ListChecks,
  Check,
  NotebookTabs,
  X,
} from "lucide-react";
import { formatEur } from "@/lib/domain";
import {
  addItemsToBinder,
  createBinderAndAdd,
  removeItemsFromBinder,
  reorderBinderItems,
} from "@/app/classeurs/actions";
import { CardImage } from "@/components/card-image";
import { Logo } from "@/components/logo";
import { Toast } from "@/components/toast";

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
  /** Ordre manuel dans un classeur */
  position?: number | null;
};

/** minuscules sans accents, pour la recherche texte */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

export type SourceRef = { id: string; name: string };

type SortKey = "name" | "paid" | "price" | "gain" | "date" | "custom";

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

export type BinderRef = { id: string; name: string };

export function CollectionClient({
  items,
  sources,
  initialSource = "",
  initialSet = "",
  readOnly = false,
  binders,
  binderContext,
  initialSelect = false,
  orderable = false,
}: {
  items: CollectionItem[];
  sources: SourceRef[];
  initialSource?: string;
  initialSet?: string;
  /** Vitrine publique : pas de liens vers les fiches */
  readOnly?: boolean;
  /** Classeurs disponibles : active le mode sélection multiple */
  binders?: BinderRef[];
  /** Rendu dans un classeur : la sélection permet aussi d'en retirer */
  binderContext?: BinderRef;
  initialSelect?: boolean;
  /** Autorise le glisser-déposer en tri « ordre du classeur » */
  orderable?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState<"grid" | "table">("grid");
  const canSelect = !readOnly && binders != null;
  const [selecting, setSelecting] = useState(canSelect && initialSelect);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [newBinderName, setNewBinderName] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error";
  } | null>(null);
  const [q, setQ] = useState("");
  const [fSold, setFSold] = useState<"active" | "sold" | "all">("active");
  const [fSet, setFSet] = useState(initialSet);
  const [fCondition, setFCondition] = useState("");
  const [fType, setFType] = useState("");
  const [fLanguage, setFLanguage] = useState("");
  const [fSource, setFSource] = useState(initialSource);
  const [fGraded, setFGraded] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>(
    binderContext ? "custom" : "date"
  );
  const [sortAsc, setSortAsc] = useState(false);
  /** Ordre local pendant/après un glisser-déposer, avant refresh serveur */
  const [manualIds, setManualIds] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragFrom = useRef<number | null>(null);
  const orderRef = useRef<string[] | null>(null);

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

    // L'ordre manuel du classeur est toujours croissant, la flèche ne s'applique pas
    const dir = sortKey === "custom" ? 1 : sortAsc ? 1 : -1;
    const cmp: Record<SortKey, (a: CollectionItem, b: CollectionItem) => number> = {
      name: (a, b) => a.card_name.localeCompare(b.card_name, "fr"),
      paid: (a, b) => (a.purchase_price ?? -1) - (b.purchase_price ?? -1),
      price: (a, b) => (a.current_price ?? -1) - (b.current_price ?? -1),
      gain: (a, b) =>
        (a.gain ?? Number.NEGATIVE_INFINITY) - (b.gain ?? Number.NEGATIVE_INFINITY),
      date: (a, b) =>
        (a.purchase_date ?? a.created_at).localeCompare(b.purchase_date ?? b.created_at),
      custom: (a, b) => {
        if (manualIds) return manualIds.indexOf(a.id) - manualIds.indexOf(b.id);
        return (
          (a.position ?? Number.MAX_SAFE_INTEGER) -
            (b.position ?? Number.MAX_SAFE_INTEGER) ||
          b.created_at.localeCompare(a.created_at)
        );
      },
    };
    return [...list].sort((a, b) => dir * cmp[sortKey](a, b));
  }, [items, q, fSold, fSet, fCondition, fType, fLanguage, fSource, fGraded, sortKey, sortAsc, manualIds]);

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

  function exitSelect() {
    setSelecting(false);
    setSelected(new Set());
    setAddOpen(false);
    setNewBinderName("");
  }

  function toggleSelecting() {
    if (selecting) {
      exitSelect();
    } else {
      setSelecting(true);
      setView("grid");
    }
  }

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function addToBinder(binder: BinderRef) {
    const ids = [...selected];
    setBusy(true);
    const { error } = await addItemsToBinder(binder.id, ids);
    setBusy(false);
    setToast(
      error
        ? { message: "Ajout impossible", tone: "error" }
        : {
            message: `${ids.length} carte${ids.length > 1 ? "s" : ""} ajoutée${
              ids.length > 1 ? "s" : ""
            } à « ${binder.name} »`,
          }
    );
    exitSelect();
    router.refresh();
  }

  async function createAndAdd() {
    const name = newBinderName.trim();
    if (!name) return;
    const ids = [...selected];
    setBusy(true);
    const { error } = await createBinderAndAdd(name, ids);
    setBusy(false);
    setToast(
      error
        ? { message: "Création impossible", tone: "error" }
        : {
            message: `Classeur « ${name} » créé avec ${ids.length} carte${
              ids.length > 1 ? "s" : ""
            }`,
          }
    );
    exitSelect();
    router.refresh();
  }

  const canReorder =
    orderable &&
    binderContext != null &&
    !readOnly &&
    sortKey === "custom" &&
    view === "grid" &&
    !selecting;

  function startDrag(index: number, id: string, order: string[]) {
    dragFrom.current = index;
    orderRef.current = order;
    setDraggingId(id);
  }

  function moveCard(target: number) {
    const from = dragFrom.current;
    if (from == null || from === target || !orderRef.current) return;
    const next = [...orderRef.current];
    const [moved] = next.splice(from, 1);
    next.splice(target, 0, moved);
    orderRef.current = next;
    setManualIds(next);
    dragFrom.current = target;
  }

  async function persistOrder() {
    setDraggingId(null);
    dragFrom.current = null;
    if (!binderContext || !orderRef.current) return;
    const { error } = await reorderBinderItems(
      binderContext.id,
      orderRef.current
    );
    setToast(
      error
        ? { message: "Ordre non enregistré", tone: "error" }
        : { message: "Ordre enregistré" }
    );
    router.refresh();
  }

  async function removeFromBinder() {
    if (!binderContext) return;
    const ids = [...selected];
    setBusy(true);
    const { error } = await removeItemsFromBinder(binderContext.id, ids);
    setBusy(false);
    setToast(
      error
        ? { message: "Retrait impossible", tone: "error" }
        : {
            message: `${ids.length} carte${ids.length > 1 ? "s" : ""} retirée${
              ids.length > 1 ? "s" : ""
            } du classeur`,
          }
    );
    exitSelect();
    router.refresh();
  }

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
        <div className="flex items-center gap-2 sm:ml-auto">
          {canSelect && (
            <button
              type="button"
              onClick={toggleSelecting}
              aria-pressed={selecting}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition ${
                selecting
                  ? "border-accent/50 bg-accent-soft font-medium text-accent-strong"
                  : "border-edge text-muted hover:text-foreground"
              }`}
            >
              <ListChecks size={13} aria-hidden /> Sélectionner
            </button>
          )}
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
          onChange={(e) => {
            setSortKey(e.target.value as SortKey);
            setManualIds(null);
            orderRef.current = null;
          }}
          className={selectCls}
        >
          {binderContext && (
            <option value="custom">Tri : ordre du classeur</option>
          )}
          <option value="date">Tri : date d&apos;achat</option>
          <option value="name">Tri : nom</option>
          <option value="paid">Tri : prix payé</option>
          <option value="price">Tri : valeur estimée</option>
          <option value="gain">Tri : plus-value</option>
        </select>
        <button
          type="button"
          onClick={() => setSortAsc((v) => !v)}
          disabled={sortKey === "custom"}
          className="btn btn-ghost !px-2.5 !py-1.5 disabled:opacity-40"
          title={sortAsc ? "Croissant" : "Décroissant"}
        >
          {sortAsc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">Aucune carte ne correspond aux filtres.</p>
      ) : view === "grid" ? (
        <ul className="rise-in grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((item, idx) => {
            const sel = selecting && selected.has(item.id);
            const tileContent = (
              <>
                <div
                  className={`card-tile aspect-[63/88] ${
                    sel ? "outline outline-2 outline-offset-2 outline-accent" : ""
                  }`}
                >
                  <CardImage
                    base={item.image_url || null}
                    alt={item.card_name}
                    fallback={item.photo_fallback ?? null}
                  />
                  {selecting && (
                    <span
                      className={`absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${
                        sel
                          ? "border-transparent bg-accent text-accent-ink"
                          : "border-white/50 bg-black/40 text-transparent"
                      }`}
                      aria-hidden
                    >
                      <Check size={13} />
                    </span>
                  )}
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
              </>
            );
            return (
              <li
                key={item.id}
                draggable={canReorder}
                onDragStart={
                  canReorder
                    ? (e) => {
                        startDrag(idx, item.id, filtered.map((i) => i.id));
                        e.dataTransfer.effectAllowed = "move";
                      }
                    : undefined
                }
                onDragOver={canReorder ? (e) => e.preventDefault() : undefined}
                onDragEnter={canReorder ? () => moveCard(idx) : undefined}
                onDragEnd={canReorder ? persistOrder : undefined}
                className={`transition-opacity ${
                  draggingId === item.id ? "opacity-40" : ""
                }`}
              >
                {selecting ? (
                  <button
                    type="button"
                    onClick={() => toggleSelected(item.id)}
                    aria-pressed={sel}
                    className="group block w-full text-left"
                  >
                    {tileContent}
                  </button>
                ) : readOnly ? (
                  <div className="group block">{tileContent}</div>
                ) : (
                  <Link
                    href={`/carte/${item.id}`}
                    draggable={false}
                    title={canReorder ? "Glisser pour réordonner" : undefined}
                    className={`group block ${
                      canReorder ? "cursor-grab active:cursor-grabbing" : ""
                    }`}
                  >
                    {tileContent}
                  </Link>
                )}
              </li>
            );
          })}
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
                    {readOnly ? (
                      <span className="font-medium">{item.card_name}</span>
                    ) : (
                      <Link
                        href={`/carte/${item.id}`}
                        className="font-medium hover:text-accent-strong"
                      >
                        {item.card_name}
                      </Link>
                    )}
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

      {/* Barre d'action flottante du mode sélection */}
      {selecting && (
        <div className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[45] flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-edge bg-raised px-3 py-2 shadow-xl md:inset-x-auto md:bottom-5 md:left-1/2 md:max-w-[calc(100vw-2rem)] md:-translate-x-1/2">
          <span className="px-1 text-sm text-muted">
            <span className="num font-semibold text-foreground">
              {selected.size}
            </span>{" "}
            sélectionnée{selected.size > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set(filtered.map((i) => i.id)))}
            className="btn btn-ghost !px-2.5 !py-1.5 text-[13px]"
          >
            Tout
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || busy}
            onClick={() => setAddOpen(true)}
            className="btn btn-primary !py-1.5 text-[13px] disabled:opacity-50"
          >
            <NotebookTabs size={14} aria-hidden />
            Ajouter à un classeur
          </button>
          {binderContext && (
            <button
              type="button"
              disabled={selected.size === 0 || busy}
              onClick={removeFromBinder}
              className="btn btn-ghost !py-1.5 text-[13px] !text-loss disabled:opacity-50"
            >
              {busy ? "Retrait…" : "Retirer du classeur"}
            </button>
          )}
          <button
            type="button"
            onClick={exitSelect}
            aria-label="Quitter la sélection"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-foreground"
          >
            <X size={15} aria-hidden />
          </button>
        </div>
      )}

      {/* Choix du classeur de destination */}
      {addOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !busy && setAddOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Ajouter à un classeur"
        >
          <div
            className="panel rise-in relative w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setAddOpen(false)}
              aria-label="Fermer"
              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow-lg transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
            <p className="display mb-1 text-base font-semibold">
              Ajouter à un classeur
            </p>
            <p className="mb-4 text-sm text-muted">
              {selected.size} carte{selected.size > 1 ? "s" : ""} sélectionnée
              {selected.size > 1 ? "s" : ""}.
            </p>

            {(binders ?? []).length > 0 && (
              <div className="mb-4 flex max-h-56 flex-col gap-1 overflow-y-auto">
                {(binders ?? []).map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    disabled={busy}
                    onClick={() => addToBinder(b)}
                    className="flex items-center gap-2.5 rounded-xl border border-edge px-3 py-2 text-left text-sm text-muted transition hover:border-edge-strong hover:text-foreground disabled:opacity-50"
                  >
                    <NotebookTabs size={14} aria-hidden />
                    {b.name}
                  </button>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={newBinderName}
                onChange={(e) => setNewBinderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createAndAdd();
                }}
                maxLength={60}
                placeholder={
                  (binders ?? []).length === 0
                    ? binderContext
                      ? "Nom du nouveau classeur…"
                      : "Nom du premier classeur…"
                    : "Ou crée un nouveau classeur…"
                }
                className="field flex-1 text-[13px]"
              />
              <button
                type="button"
                disabled={busy || !newBinderName.trim()}
                onClick={createAndAdd}
                className="btn btn-primary text-[13px] disabled:opacity-50"
              >
                {busy ? "…" : "Créer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}
