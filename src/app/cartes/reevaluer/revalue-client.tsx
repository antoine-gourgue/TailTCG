"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Check, CheckCircle2, ChevronLeft, ExternalLink, Loader2, Settings, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { FloatingBar } from "@/components/floating-bar";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { formatEur } from "@/lib/domain";
import { revalueItems } from "@/app/items/actions";

export type RevalueItem = {
  id: string;
  tcgdex_id: string | null;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string | null;
  language: string;
  condition: string;
  quantity: number;
  graded: boolean;
  grade: string | null;
  /** Valeur estimée actuelle, à l'unité */
  manual_price: number | null;
  purchase_price: number | null;
  /** Date (AAAA-MM-JJ) de la dernière valeur enregistrée */
  last_valued: string | null;
  /** Valeur plus ancienne que le rappel de réévaluation */
  stale: boolean;
  /** Cote Cardmarket du dernier relevé, à l'unité */
  market: number | null;
};

type Tab = "picked" | "stale" | "unvalued" | "all";
type Sort = "oldest" | "gap" | "value";

/** Montant saisi : virgule acceptée ; vide → null ; invalide → NaN */
function parsePrice(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}
const toInput = (n: number) => n.toFixed(2).replace(".", ",");

/** « aujourd'hui », « il y a 3 j », « il y a 5 sem. », « il y a 4 mois » */
function ago(iso: string | null): string {
  if (!iso) return "jamais estimée";
  const days = Math.max(0, Math.round((Date.now() - new Date(`${iso}T12:00:00`).getTime()) / 86_400_000));
  if (days === 0) return "aujourd'hui";
  if (days < 14) return `il y a ${days} j`;
  if (days < 60) return `il y a ${Math.round(days / 7)} sem.`;
  if (days < 730) return `il y a ${Math.round(days / 30)} mois`;
  return `il y a ${Math.round(days / 365)} ans`;
}

/** Écart en % entre la cote et la valeur actuelle (null si incomparable) */
function gapPct(item: RevalueItem): number | null {
  if (item.market == null || item.manual_price == null || item.manual_price <= 0) return null;
  return ((item.market - item.manual_price) / item.manual_price) * 100;
}

const cmHref = (i: RevalueItem) =>
  `/api/cardmarket?${new URLSearchParams({ card: i.tcgdex_id ?? "", name: i.card_name, n: i.local_id })}`;

function Pct({ value }: { value: number }) {
  const r = Math.round(value);
  if (r === 0) return <span className="text-muted">=</span>;
  return (
    <span className={r > 0 ? "text-gain" : "text-loss"}>
      {r > 0 ? "+" : "−"}
      {Math.abs(r)} %
    </span>
  );
}

/** Case à cocher (zone de toucher 36 px, case 22 px) */
function Tick({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className="group -m-1.5 flex h-9 w-9 shrink-0 items-center justify-center"
    >
      <span
        className={`flex h-[22px] w-[22px] items-center justify-center rounded-md border-2 transition ${
          on ? "border-accent bg-accent text-accent-ink" : "border-edge-strong text-transparent group-hover:border-accent/60"
        }`}
      >
        <Check size={13} strokeWidth={3.2} aria-hidden />
      </span>
    </button>
  );
}

export function RevalueClient({ items, weeks, picked }: { items: RevalueItem[]; weeks: number | null; picked: string[] }) {
  const router = useRouter();
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  const counts = useMemo(
    () => ({
      picked: items.filter((i) => pickedSet.has(i.id)).length,
      stale: items.filter((i) => i.stale).length,
      unvalued: items.filter((i) => i.manual_price == null).length,
      all: items.length,
    }),
    [items, pickedSet]
  );
  const [tab, setTab] = useState<Tab>(
    counts.picked > 0 ? "picked" : counts.stale > 0 ? "stale" : counts.unvalued > 0 ? "unvalued" : "all"
  );
  const [sort, setSort] = useState<Sort>("oldest");
  const [sortAsc, setSortAsc] = useState(true);
  const [query, setQuery] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((i) => {
      if (tab === "picked" && !pickedSet.has(i.id)) return false;
      if (tab === "stale" && !i.stale) return false;
      if (tab === "unvalued" && i.manual_price != null) return false;
      if (!q) return true;
      return `${i.card_name} ${i.set_name} ${i.local_id}`.toLowerCase().includes(q);
    });
    const byOldest = (a: RevalueItem, b: RevalueItem) => (a.last_valued ?? "").localeCompare(b.last_valued ?? "");
    const sorted =
      sort === "oldest"
        ? list.sort(byOldest)
        : sort === "gap"
          ? list.sort((a, b) => Math.abs(gapPct(b) ?? -1) - Math.abs(gapPct(a) ?? -1) || byOldest(a, b))
          : list.sort((a, b) => (b.manual_price ?? b.market ?? 0) - (a.manual_price ?? a.market ?? 0));
    return sortAsc ? sorted : [...sorted].reverse();
  }, [items, tab, sort, query, pickedSet, sortAsc]);

  // Saisies prêtes à enregistrer
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const entries = Object.entries(values)
    .map(([id, raw]) => ({ id, value: parsePrice(raw), item: byId.get(id) }))
    .filter((e) => e.value !== null && e.item);
  const invalid = entries.some((e) => Number.isNaN(e.value));
  const ready = entries.filter((e): e is { id: string; value: number; item: RevalueItem } => !Number.isNaN(e.value));
  const delta = ready.reduce(
    (sum, e) => sum + (e.item.manual_price != null ? (e.value - e.item.manual_price) * e.item.quantity : 0),
    0
  );

  const setValue = (id: string, v: string) => {
    setSaved(null);
    setValues((prev) => {
      const next = { ...prev };
      if (v === "") delete next[id];
      else next[id] = v;
      return next;
    });
  };

  const checkedVisible = visible.filter((i) => checked.has(i.id));
  const allChecked = visible.length > 0 && checkedVisible.length === visible.length;
  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setChecked((prev) => {
      const next = new Set(prev);
      for (const i of visible) {
        if (allChecked) next.delete(i.id);
        else next.add(i.id);
      }
      return next;
    });

  /** Remplit les cartes cochées (visibles) : cote, valeur actuelle, ou vide */
  const fillChecked = (pick: (i: RevalueItem) => number | null | "clear") => {
    setSaved(null);
    setValues((prev) => {
      const next = { ...prev };
      for (const i of checkedVisible) {
        const v = pick(i);
        if (v === "clear") delete next[i.id];
        else if (v != null) next[i.id] = toInput(v);
      }
      return next;
    });
  };

  const save = () => {
    if (invalid || ready.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await revalueItems(ready.map((e) => ({ id: e.id, value: e.value })));
      if (res.error) {
        setError(res.error);
        return;
      }
      setValues({});
      setChecked(new Set());
      setSaved(res.count);
      router.refresh();
    });
  };

  // Chiffres : valeur estimée de la collection, et son écart avec la cote Cardmarket sur les cartes comparables
  const totals = useMemo(() => {
    let estimated = 0;
    let comparable = 0;
    let marketOfComparable = 0;
    let estimatedOfComparable = 0;
    for (const i of items) {
      if (i.manual_price != null) estimated += i.manual_price * i.quantity;
      if (i.manual_price != null && i.market != null) {
        comparable += 1;
        marketOfComparable += i.market * i.quantity;
        estimatedOfComparable += i.manual_price * i.quantity;
      }
    }
    return { estimated, comparable, gap: comparable > 0 ? marketOfComparable - estimatedOfComparable : null };
  }, [items]);

  const tabs: { key: Tab; label: string; n: number }[] = [
    ...(counts.picked > 0 ? [{ key: "picked" as const, label: "Sélection", n: counts.picked }] : []),
    { key: "stale", label: "À réévaluer", n: counts.stale },
    ...(counts.unvalued > 0 ? [{ key: "unvalued" as const, label: "Sans valeur", n: counts.unvalued }] : []),
    { key: "all", label: "Toutes", n: counts.all },
  ];

  const tabChip = (on: boolean) => `seg flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-[13px] ${on ? "font-medium text-accent-strong" : "text-muted"}`;

  return (
    <div className={ready.length > 0 || invalid ? "pb-24 md:pb-20" : undefined}>
      <Link href="/cartes" className="mb-4 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
        <ChevronLeft size={16} aria-hidden />
        Cartes
      </Link>
      <PageHead
        kicker="Ma collection"
        title="Réévaluer"
        count={counts.stale || null}
        sub="La valeur estimée de chaque carte, à l’unité, avec la cote Cardmarket du dernier relevé en repère. Une valeur gardée telle quelle compte comme réévaluée aujourd’hui."
      >
        <Link href="/parametres" className="btn btn-ghost" title="Tous les combien réévaluer tes cartes">
          <Settings size={15} aria-hidden />
          {weeks ? `Rappel : ${weeks} sem.` : "Rappel désactivé"}
        </Link>
      </PageHead>

      <StatStrip cols={4}>
        <StatCard label="À réévaluer" value={counts.stale} tone={counts.stale > 0 ? "down" : undefined} sub={weeks ? `valeur de plus de ${weeks} semaine${weeks > 1 ? "s" : ""}` : "rappel désactivé"} />
        <StatCard label="Sans valeur" value={counts.unvalued} sub={counts.unvalued > 0 ? "jamais estimées" : "toutes estimées"} />
        <StatCard label="Valeur estimée" value={formatEur(totals.estimated)} sub={`${counts.all - counts.unvalued} carte${counts.all - counts.unvalued > 1 ? "s" : ""} estimée${counts.all - counts.unvalued > 1 ? "s" : ""}`} />
        <StatCard
          label="Écart avec Cardmarket"
          value={totals.gap == null ? "—" : `${totals.gap > 0 ? "+" : "−"}${formatEur(Math.abs(totals.gap))}`}
          tone={totals.gap == null ? undefined : totals.gap > 0 ? "up" : "down"}
          sub={totals.gap == null ? "aucune carte comparable" : totals.gap > 0 ? `la cote dépasse tes estimations · ${totals.comparable} cartes` : `tes estimations dépassent la cote · ${totals.comparable} cartes`}
        />
      </StatStrip>

      {saved != null && (
        <p role="status" className="mt-4 flex items-center gap-2.5 rounded-2xl bg-gain/10 px-4 py-3 text-sm ring-1 ring-gain/40">
          <CheckCircle2 size={17} className="shrink-0 text-gain" aria-hidden />
          {saved} valeur{saved > 1 ? "s" : ""} mise{saved > 1 ? "s" : ""} à jour.
        </p>
      )}

      {/* Filtres, recherche, tri */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="scrollbar-none -mx-4 flex basis-full gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:basis-auto sm:px-0">
          {tabs.map((t) => (
            <button key={t.key} type="button" data-on={tab === t.key} aria-pressed={tab === t.key} onClick={() => setTab(t.key)} className={tabChip(tab === t.key)}>
              {t.label}
              <span className="num text-[11px] opacity-70">{t.n}</span>
            </button>
          ))}
        </div>
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nom, set ou numéro" aria-label="Rechercher" className="pill-input basis-full sm:basis-auto sm:!w-56" />
        <div className="ml-auto flex items-center gap-1.5">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Tri" className="pill-select !w-auto text-[13px]">
            <option value="oldest">Tri : valeur la plus ancienne</option>
            <option value="gap">Tri : écart avec la cote</option>
            <option value="value">Tri : valeur</option>
          </select>
          <button type="button" onClick={() => setSortAsc((v) => !v)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface text-muted ring-1 ring-ring transition hover:text-foreground" title={sortAsc ? "Croissant" : "Décroissant"} aria-label={sortAsc ? "Tri croissant" : "Tri décroissant"}>
            {sortAsc ? <ArrowUp size={14} aria-hidden /> : <ArrowDown size={14} aria-hidden />}
          </button>
        </div>
      </div>

      {/* Actions en masse sur les cartes cochées */}
      {visible.length > 0 && (
        <div className="mt-3 flex items-center gap-x-2 gap-y-2 rounded-2xl bg-surface py-2 pl-3 pr-2 ring-1 ring-ring sm:gap-x-3">
          <span className="flex min-w-0 items-center gap-2 text-sm">
            <Tick on={allChecked} onClick={toggleAll} label={allChecked ? "Tout décocher" : "Tout cocher"} />
            <span className="truncate text-muted">
              {checkedVisible.length > 0 ? (
                <>
                  <span className="num font-semibold text-foreground">{checkedVisible.length}</span> cochée{checkedVisible.length > 1 ? "s" : ""}
                </>
              ) : (
                "Tout cocher"
              )}
            </span>
          </span>
          <span className="ml-auto flex shrink-0 gap-1">
            <button type="button" disabled={checkedVisible.length === 0} onClick={() => fillChecked((i) => i.market)} className="btn btn-ghost !px-2.5 !py-1.5 text-[13px] disabled:opacity-40 sm:!px-3" title="Nouvelle valeur = cote Cardmarket, pour les cartes cochées qui en ont une">
              <span className="sm:hidden">= Cote</span>
              <span className="hidden sm:inline">Prendre la cote</span>
            </button>
            <button type="button" disabled={checkedVisible.length === 0} onClick={() => fillChecked((i) => i.manual_price)} className="btn btn-ghost !px-2.5 !py-1.5 text-[13px] disabled:opacity-40 sm:!px-3" title="Garder la valeur actuelle : elle compte comme réévaluée aujourd'hui">
              <span className="sm:hidden">Garder</span>
              <span className="hidden sm:inline">Garder la valeur</span>
            </button>
            <button type="button" disabled={checkedVisible.length === 0} onClick={() => fillChecked(() => "clear")} className="btn btn-ghost !px-2.5 !py-1.5 text-[13px] text-muted disabled:opacity-40 sm:!px-3">
              Effacer
            </button>
          </span>
        </div>
      )}

      {/* Liste */}
      {visible.length === 0 ? (
        <div className="panel mt-4 px-5 py-10 text-center">
          {tab === "stale" && !query ? (
            weeks ? (
              <>
                <p className="display text-lg font-semibold">Rien à réévaluer</p>
                <p className="mt-1.5 text-sm text-muted">
                  Toutes tes valeurs ont moins de {weeks} semaine{weeks > 1 ? "s" : ""}.
                </p>
              </>
            ) : (
              <>
                <p className="display text-lg font-semibold">Rappel de réévaluation désactivé</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">Choisis tous les combien réévaluer tes cartes : celles dont la valeur est plus ancienne apparaîtront ici.</p>
                <Link href="/parametres" className="btn btn-ghost mt-4 inline-flex text-sm">
                  <Settings size={15} aria-hidden />
                  Paramètres
                </Link>
              </>
            )
          ) : (
            <p className="text-sm text-muted">Aucune carte ne correspond.</p>
          )}
        </div>
      ) : (
        <ul className="panel mt-3 divide-y divide-ring !p-0">
          {visible.map((item) => {
            const raw = values[item.id] ?? "";
            const next = parsePrice(raw);
            const bad = Number.isNaN(next);
            const changed = next != null && !bad;
            const diff = changed && item.manual_price != null ? next - item.manual_price : null;
            const gap = gapPct(item);
            const on = checked.has(item.id);
            return (
              <li key={item.id} className={`transition-colors ${on ? "bg-accent-soft/30" : ""} ${changed ? "bg-raised/40" : ""}`}>
                <div className="grid grid-cols-[auto_3.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-3 px-3.5 py-3 sm:grid-cols-[auto_3.5rem_minmax(0,1fr)_auto_17rem] sm:items-center sm:px-4">
                  <div className="pt-1 sm:pt-0">
                    <Tick on={on} onClick={() => toggle(item.id)} label={`Cocher ${item.card_name}`} />
                  </div>
                  <Link href={`/carte/${item.id}`} className="block aspect-[63/88] overflow-hidden rounded-md bg-raised shadow-sm" aria-label={`Fiche de ${item.card_name}`}>
                    <CardImage base={item.image_url} alt="" placeholder="compact" />
                  </Link>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">
                      <Link href={`/carte/${item.id}`} className="hover:text-accent-strong">
                        {item.card_name}
                      </Link>
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {[item.set_name, item.local_id, item.language, item.graded && item.grade ? item.grade : item.condition].filter(Boolean).join(" · ")}
                      {item.quantity > 1 && <span className="num"> · ×{item.quantity}</span>}
                    </p>
                    <p className="mt-1 text-[11px] sm:hidden">
                      <span className="text-muted">Valeur </span>
                      <span className="num font-semibold">{formatEur(item.manual_price)}</span>
                      <span className={`ml-1 ${item.stale ? "text-accent-strong" : "text-faint"}`}>{ago(item.last_valued)}</span>
                      {item.market != null && (
                        <>
                          <span className="text-muted"> · Cardmarket </span>
                          <span className="num font-semibold">{formatEur(item.market)}</span>
                          {gap != null && (
                            <span className="num ml-1">
                              <Pct value={gap} />
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>

                  {/* Valeur actuelle et cote, côte à côte dès sm */}
                  <div className="hidden shrink-0 gap-5 sm:flex">
                    <div className="w-24 text-right">
                      <p className="label-xs !text-[10px] text-muted">Valeur</p>
                      <p className="num text-sm font-semibold leading-tight">{formatEur(item.manual_price)}</p>
                      <p className={`text-[11px] ${item.stale ? "text-accent-strong" : "text-faint"}`}>{ago(item.last_valued)}</p>
                    </div>
                    <a
                      href={cmHref(item)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={item.graded ? "Cote de la carte non gradée — voir sur Cardmarket" : "Voir cette carte sur Cardmarket"}
                      className="group w-28 text-right transition hover:text-accent-strong"
                    >
                      <p className="label-xs !text-[10px] flex items-center justify-end gap-1 text-muted">
                        Cardmarket <ExternalLink size={10} className="text-faint" aria-hidden />
                      </p>
                      <p className="num text-sm font-semibold leading-tight">{item.market != null ? formatEur(item.market) : <span className="font-normal text-faint">—</span>}</p>
                      <p className="num text-[11px]">{gap != null ? <Pct value={gap} /> : <span className="text-faint">voir</span>}</p>
                    </a>
                  </div>

                  {/* Nouvelle valeur */}
                  <div className="col-span-3 sm:col-span-1">
                    <div className="flex items-stretch gap-1.5">
                      <label className="relative min-w-0 flex-1">
                        <span className="sr-only">Nouvelle valeur de {item.card_name}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={raw}
                          onChange={(e) => setValue(item.id, e.target.value)}
                          placeholder={item.manual_price != null ? toInput(item.manual_price) : "Valeur"}
                          aria-invalid={bad}
                          className={`field num !py-2 !pr-7 ${bad ? "!border-loss" : changed ? "!border-accent/60" : ""}`}
                        />
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">€</span>
                      </label>
                      <button type="button" disabled={item.market == null} onClick={() => item.market != null && setValue(item.id, toInput(item.market))} title="Prendre la cote Cardmarket" className="seg flex shrink-0 items-center px-2.5 text-[12px] font-medium text-muted disabled:opacity-35">
                        Cote
                      </button>
                      <button type="button" disabled={item.manual_price == null} onClick={() => item.manual_price != null && setValue(item.id, toInput(item.manual_price))} title="Garder la valeur actuelle (réévaluée aujourd'hui)" aria-label="Garder la valeur actuelle" className="seg flex w-10 shrink-0 items-center justify-center text-muted disabled:opacity-35">
                        <Check size={15} aria-hidden />
                      </button>
                    </div>
                    {diff != null && (
                      <p className="num mt-1 text-right text-[11px]">
                        {Math.abs(diff) < 0.005 ? (
                          <span className="text-muted">Inchangée</span>
                        ) : (
                          <span className={diff > 0 ? "text-gain" : "text-loss"}>
                            {diff > 0 ? "+" : "−"}
                            {formatEur(Math.abs(diff))}
                            {item.quantity > 1 && <span className="text-muted"> ×{item.quantity}</span>}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(ready.length > 0 || invalid || error) && (
        <FloatingBar>
          <button
            type="button"
            onClick={() => {
              setValues({});
              setError(null);
            }}
            aria-label="Annuler les saisies"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
          >
            <X size={16} aria-hidden />
          </button>
          <span className="min-w-0 truncate whitespace-nowrap px-1 text-[13px]">
            {error ? (
              <span className="text-loss">{error}</span>
            ) : invalid ? (
              <span className="text-loss">Une valeur est invalide</span>
            ) : (
              <>
                <span className="num font-semibold">{ready.length}</span> valeur{ready.length > 1 ? "s" : ""}
                {Math.abs(delta) >= 0.005 && (
                  <span className={`num ${delta > 0 ? "text-gain" : "text-loss"}`}>
                    {" "}
                    · {delta > 0 ? "+" : "−"}
                    {formatEur(Math.abs(delta))}
                  </span>
                )}
              </>
            )}
          </span>
          <button
            type="button"
            disabled={pending || invalid || ready.length === 0}
            onClick={save}
            className="btn btn-primary shrink-0 !rounded-full !py-2 text-[13px] disabled:opacity-40"
          >
            {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Check size={15} aria-hidden />}
            Enregistrer
          </button>
        </FloatingBar>
      )}
    </div>
  );
}
