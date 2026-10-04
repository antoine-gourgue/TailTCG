"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CalendarDays, Check, ChevronDown, Loader2, Minus, NotebookPen, Plus, Sparkles, Store, Trash2 } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { FloatingBar } from "@/components/floating-bar";
import {
  CONDITIONS,
  GEOCODED_KINDS,
  LANGUAGES,
  SOURCE_KINDS,
  formatEur,
  sourceKindLabel,
  type ConditionCode,
  type SourceKind,
} from "@/lib/domain";
import { rarityLabel, raritySymbol } from "@/lib/rarity";
import { addBatchToCollection, createSource, type SourceOption } from "@/app/items/actions";
import { clearBatchDraft, loadBatchDraft, type BatchCard, type BatchDraft } from "@/lib/batch-draft";

type Row = BatchCard & {
  key: string;
  /** Saisies brutes (virgule ou point) */
  paid: string;
  value: string;
  condition: ConditionCode;
  quantity: number;
  /** Propres à la carte ; vides = ceux du lot */
  sourceId: string;
  date: string;
  note: string;
  open: boolean;
};

const LANGUAGE_LABEL: Record<string, string> = { FR: "Français", EN: "Anglais", JP: "Japonais", DE: "Allemand", IT: "Italien", ES: "Espagnol" };
const NEW_SOURCE_PLACEHOLDER: Record<SourceKind, string> = {
  shop: "Nom (ex. Snoop Bayonne)",
  web: "Nom (ex. Cardmarket)",
  flea: "Nom (ex. Brocante de Biarritz)",
  trade: "Nom (ex. Échange avec Lucas)",
  pack: "Nom (ex. Booster Déchaînement)",
};

/** « 12,5 » → 12.5 ; vide → null ; invalide → NaN */
function parsePrice(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}
const toInput = (n: number) => n.toFixed(2).replace(".", ",");
const todayISO = () => new Date().toISOString().slice(0, 10);
const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

const noopSubscribe = () => () => {};
const WIDE = "(min-width: 1024px)";
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

const rowsOf = (draft: BatchDraft | null): Row[] =>
  (draft?.cards ?? []).map((c, i) => ({
    ...c,
    key: `${c.tcgdex_id}-${i}`,
    paid: "",
    value: "",
    condition: "NM",
    quantity: 1,
    sourceId: "",
    date: "",
    note: "",
    open: false,
  }));

/* ————— Briques ————— */

/** Pastille à bascule (style .seg) */
function Chip({
  on,
  onClick,
  children,
  title,
  className = "",
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      data-on={on}
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`seg flex h-9 items-center justify-center px-3 text-[13px] font-medium ${on ? "text-accent-strong" : "text-muted"} ${className}`}
    >
      {children}
    </button>
  );
}

/** Montant en euros : champ texte (virgule acceptée) et symbole € */
function Money({
  label,
  value,
  onChange,
  placeholder = "—",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const bad = Number.isNaN(parsePrice(value));
  return (
    <label className="min-w-0 text-sm">
      <span className="label-xs mb-1.5 block truncate">{label}</span>
      <span className="relative block">
        <input
          type="text"
          inputMode="decimal"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={bad}
          className={`field num !py-2.5 !pr-7 ${bad ? "!border-loss" : ""}`}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-faint">€</span>
      </span>
    </label>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="min-w-0 text-sm">
      <span className="label-xs mb-1.5 block truncate">Quantité</span>
      <div className="flex h-[2.875rem] items-center rounded-[0.875rem] border border-edge bg-raised">
        <button
          type="button"
          onClick={() => onChange(Math.max(1, value - 1))}
          disabled={value <= 1}
          aria-label="Un de moins"
          className="flex h-full w-8 shrink-0 items-center justify-center text-muted transition hover:text-foreground disabled:opacity-30"
        >
          <Minus size={14} aria-hidden />
        </button>
        <span className="num min-w-0 flex-1 text-center font-semibold">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(99, value + 1))}
          aria-label="Un de plus"
          className="flex h-full w-8 shrink-0 items-center justify-center text-muted transition hover:text-foreground"
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** État en pastilles (MT → PO), le libellé en infobulle */
function ConditionChips({ value, onChange }: { value: ConditionCode | null; onChange: (c: ConditionCode) => void }) {
  return (
    <div className="grid grid-cols-7 gap-1.5" role="group" aria-label="État">
      {CONDITIONS.map((c) => (
        <Chip key={c.code} on={value === c.code} onClick={() => onChange(c.code)} title={`${c.code} · ${c.label}`} className="num !px-0">
          {c.code}
        </Chip>
      ))}
    </div>
  );
}

/* ————— Page ————— */

/**
 * Ajout en lot : les cartes choisies sur un set, chacune avec son prix payé,
 * sa valeur, son état et sa quantité — et, au besoin, sa provenance, sa date
 * et une note. Langue, provenance et date du lot valent pour toutes les
 * cartes qui n'ont pas les leurs. Rien n'est ajouté avant « Ajouter ».
 */
export function BatchAddClient({ sources: initialSources }: { sources: SourceOption[] }) {
  const router = useRouter();
  // Le lot vient du sessionStorage : rendu neutre avant le montage client
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const [draft] = useState<BatchDraft | null>(loadBatchDraft);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(draft));
  const [sources, setSources] = useState(initialSources);

  // Réglages du lot
  const [language, setLanguage] = useState(draft?.language ?? "FR");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<SourceKind | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [creating, setCreating] = useState(false);
  const [newSource, setNewSource] = useState({ name: "", address: "", city: "", url: "" });
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [savingSource, startSourceSave] = useTransition();
  const [total, setTotal] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));
  const sourceName = (id: string) => sources.find((s) => s.id === id)?.name ?? "";
  const lotCondition = rows.length > 0 && rows.every((r) => r.condition === rows[0].condition) ? rows[0].condition : null;

  const sums = useMemo(() => {
    let copies = 0;
    let paid = 0;
    let withPrice = 0;
    let cote = 0;
    let invalid = false;
    for (const r of rows) {
      copies += r.quantity;
      const p = parsePrice(r.paid);
      const v = parsePrice(r.value);
      if (Number.isNaN(p) || Number.isNaN(v)) invalid = true;
      if (p != null && !Number.isNaN(p)) {
        paid += p * r.quantity;
        withPrice++;
      }
      if (r.price != null) cote += r.price * r.quantity;
    }
    return { copies, paid, withPrice, cote, invalid };
  }, [rows]);

  function submitNewSource() {
    if (!kind) return;
    setSourceError(null);
    startSourceSave(async () => {
      const { source, error: err } = await createSource({
        name: newSource.name,
        kind,
        address: newSource.address,
        city: newSource.city,
        url: newSource.url,
      });
      if (err || !source) {
        setSourceError(err ?? "Erreur inconnue");
        return;
      }
      setSources((prev) => [...prev, source]);
      setSourceId(source.id);
      setCreating(false);
      setNewSource({ name: "", address: "", city: "", url: "" });
    });
  }

  /**
   * Répartit un prix total sur les cartes, au prorata de leur cote ; les
   * cartes sans cote restent à remplir (à parts égales si aucune n'est cotée).
   */
  function distribute() {
    const amount = parsePrice(total);
    if (amount == null || Number.isNaN(amount) || rows.length === 0) return;
    const priced = rows.some((r) => r.price != null && r.price > 0);
    const weights = rows.map((r) => (priced ? (r.price ?? 0) : 1) * r.quantity);
    const sum = weights.reduce((a, b) => a + b, 0);
    const last = weights.findLastIndex((w) => w > 0);
    // Calcul hors de l'updater (qui doit rester pur) : le reste d'arrondi va à la dernière carte cotée
    let left = Math.round(amount * 100);
    const next = rows.map((r, i) => {
      if (weights[i] === 0) return { ...r, paid: "" };
      const cents = i === last ? left : Math.round((amount * 100 * weights[i]) / sum);
      left -= cents;
      return { ...r, paid: toInput(Math.max(0, cents) / 100 / r.quantity) };
    });
    setRows(next);
  }

  async function submit() {
    if (busy || rows.length === 0 || sums.invalid) return;
    setBusy(true);
    setError(null);
    const res = await addBatchToCollection(
      rows.map((r) => ({
        tcgdex_id: r.tcgdex_id,
        card_name: r.card_name,
        set_id: r.set_id,
        set_name: r.set_name,
        local_id: r.local_id,
        image_url: r.image_url,
        rarity: r.rarity,
        condition: r.condition,
        quantity: r.quantity,
        purchase_price: parsePrice(r.paid),
        manual_price: parsePrice(r.value),
        purchase_date: r.date || null,
        source_id: r.sourceId || null,
        notes: r.note.trim() || null,
      })),
      { language, purchase_date: date || null, source_id: sourceId || null }
    ).catch(() => ({ error: "Ajout impossible, réessaie.", added: 0 }));
    if (res.error) {
      setError(res.error);
      setBusy(false);
      return;
    }
    clearBatchDraft();
    router.push(`/cartes?added=${res.added}&lot=1`);
  }

  if (!mounted) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 size={22} className="animate-spin text-accent-strong" aria-hidden />
      </div>
    );
  }

  if (!draft || rows.length === 0) {
    return (
      <div className="panel mx-auto mt-6 flex max-w-md flex-col items-center gap-3 p-10 text-center">
        <Sparkles size={26} strokeWidth={1.6} className="text-faint" aria-hidden />
        <p className="display text-xl font-semibold">Aucune carte à ajouter</p>
        <p className="text-sm text-muted">
          Choisis des cartes sur la page d&apos;un set avec « Ajout rapide », puis valide : elles arrivent ici.
        </p>
        <Link href={draft?.back.href ?? "/catalogue"} className="btn btn-primary mt-2">
          {draft ? `Retour à ${draft.back.label}` : "Parcourir les sets"}
        </Link>
      </div>
    );
  }

  const visibleSources = sources.filter((s) => s.kind === kind);
  const lotSourceLabel = sourceId ? sourceName(sourceId) : kind ? sourceKindLabel(kind) : null;
  const lotHint = [lotSourceLabel, date ? shortDate(date) : null].filter(Boolean).join(", ");

  const submitButton = (full: boolean) => (
    <button
      type="button"
      onClick={() => void submit()}
      disabled={busy || sums.invalid}
      className={`btn btn-primary shrink-0 ${full ? "w-full !py-3.5 text-base" : "!py-2.5"}`}
      title={sums.invalid ? "Un prix est mal saisi" : undefined}
    >
      {busy ? <Loader2 size={17} className="animate-spin" aria-hidden /> : <Check size={17} aria-hidden />}
      {full ? (
        <>
          Ajouter {rows.length} carte{rows.length > 1 ? "s" : ""} à ma collection
        </>
      ) : (
        <>
          <span className="sm:hidden">Ajouter</span>
          <span className="hidden sm:inline">Ajouter à ma collection</span>
        </>
      )}
    </button>
  );

  return (
    <div className="pb-28 lg:pb-8">
      <Link href={draft.back.href} className="mb-5 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
        <ArrowLeft size={14} aria-hidden />
        {draft.back.label}
      </Link>

      {/* En-tête : un éventail des premières cartes, le lot en une ligne */}
      <header className="mb-6 flex items-center gap-5">
        <div className="relative hidden h-[5.5rem] w-24 shrink-0 sm:block" aria-hidden>
          {/* Position sur l'enveloppe : .card-tile impose position: relative */}
          {rows.slice(0, 3).map((r, i) => (
            <div
              key={r.key}
              className="absolute top-1 w-14"
              style={{ left: `${i * 18}px`, transform: `rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 3 : 1 }}
            >
              <div className="card-tile aspect-[63/88]">
                <CardImage base={r.image_url || null} alt="" placeholder="compact" />
              </div>
            </div>
          ))}
        </div>
        <div className="min-w-0">
          <h1 className="display text-3xl font-bold tracking-tight">
            Ajouter {rows.length} carte{rows.length > 1 ? "s" : ""}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {draft.back.label} · cote du lot <span className="num font-semibold text-foreground">{formatEur(sums.cote)}</span>
            <span className="hidden sm:inline"> · une valeur laissée vide suit la cote Cardmarket</span>
          </p>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_23rem] lg:items-start lg:gap-6">
        {/* ——— Réglages du lot (à droite sur grand écran, collés en défilant) ——— */}
        <aside className="lg:sticky lg:top-6 lg:order-2">
          <section className="panel p-5">
            <h2 className="display text-base font-semibold">Pour tout le lot</h2>
            <p className="mt-0.5 text-xs text-muted">Valent pour toutes les cartes, sauf celles où tu les précises.</p>

            <p className="label-xs mb-2 mt-5">Comment tu les as eues</p>
            <div className="flex flex-wrap gap-1.5">
              <Chip
                on={kind === null}
                onClick={() => {
                  setKind(null);
                  setSourceId("");
                  setCreating(false);
                }}
              >
                Non précisé
              </Chip>
              {SOURCE_KINDS.map((s) => (
                <Chip
                  key={s.kind}
                  on={kind === s.kind}
                  onClick={() => {
                    setKind(s.kind);
                    setSourceId("");
                    setCreating(false);
                  }}
                >
                  {s.kind === "pack" ? "Booster" : s.label}
                </Chip>
              ))}
            </div>
            {kind && (
              <div className="mt-3 flex flex-col gap-2">
                {visibleSources.length > 0 && (
                  <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="field !py-2.5">
                    <option value="">{sourceKindLabel(kind)} : choisir…</option>
                    {visibleSources.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {GEOCODED_KINDS.includes(s.kind) && s.city ? ` (${s.city})` : ""}
                      </option>
                    ))}
                  </select>
                )}
                {!creating ? (
                  <button
                    type="button"
                    onClick={() => setCreating(true)}
                    className="self-start text-sm text-accent underline-offset-2 hover:underline"
                  >
                    + Nouvelle ({sourceKindLabel(kind).toLowerCase()})
                  </button>
                ) : (
                  <div className="flex flex-col gap-2 rounded-xl border border-dashed border-edge-strong p-3">
                    <input
                      type="text"
                      placeholder={NEW_SOURCE_PLACEHOLDER[kind]}
                      value={newSource.name}
                      onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                      className="field !py-2.5"
                    />
                    {GEOCODED_KINDS.includes(kind) && (
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder={kind === "flea" ? "Lieu" : "Adresse"}
                          value={newSource.address}
                          onChange={(e) => setNewSource({ ...newSource, address: e.target.value })}
                          className="field !py-2.5"
                        />
                        <input
                          type="text"
                          placeholder="Ville"
                          value={newSource.city}
                          onChange={(e) => setNewSource({ ...newSource, city: e.target.value })}
                          className="field !py-2.5"
                        />
                      </div>
                    )}
                    {kind === "web" && (
                      <input
                        type="url"
                        placeholder="https://…"
                        value={newSource.url}
                        onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                        className="field !py-2.5"
                      />
                    )}
                    {sourceError && <p className="text-xs text-loss">{sourceError}</p>}
                    <div className="flex gap-2">
                      <button type="button" onClick={submitNewSource} disabled={savingSource} className="btn btn-primary !py-1.5 text-sm">
                        {savingSource ? "Création…" : "Créer"}
                      </button>
                      <button type="button" onClick={() => setCreating(false)} className="btn btn-ghost !py-1.5 text-sm">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {/* Bouton hors du <label> : sinon c'est lui que le libellé désigne, pas le champ */}
              <div className="min-w-0 text-sm">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label htmlFor="lot-date" className="label-xs">
                    Date d&apos;achat
                  </label>
                  <button
                    type="button"
                    onClick={() => setDate(todayISO())}
                    className="text-[11px] font-semibold text-accent hover:underline"
                  >
                    Aujourd&apos;hui
                  </button>
                </div>
                <input id="lot-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field !py-2.5" />
              </div>
              <div className="min-w-0 text-sm">
                <span className="label-xs mb-1.5 block">Langue</span>
                <div className="grid grid-cols-6 gap-1.5">
                  {LANGUAGES.map((l) => (
                    <Chip key={l} on={language === l} onClick={() => setLanguage(l)} title={LANGUAGE_LABEL[l]} className="!px-0">
                      {l}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>

            <p className="label-xs mb-2 mt-5">État de toutes les cartes</p>
            <ConditionChips value={lotCondition} onChange={(c) => setRows((rs) => rs.map((r) => ({ ...r, condition: c })))} />

            {/* Lot acheté d'un bloc : un prix total réparti selon la cote */}
            <div className="mt-5 border-t border-edge pt-4">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Money label="Prix total payé" value={total} onChange={setTotal} placeholder="ex. 49,90" />
                </div>
                <button
                  type="button"
                  onClick={distribute}
                  disabled={parsePrice(total) == null || Number.isNaN(parsePrice(total))}
                  className="btn btn-ghost !py-2.5"
                >
                  Répartir
                </button>
              </div>
              <p className="mt-1.5 text-xs text-faint">Au prorata de la cote de chaque carte ; celles sans cote restent à remplir.</p>
            </div>

            {/* Récapitulatif et validation (grand écran) */}
            {wide && (
              <div className="mt-5 border-t border-edge pt-4">
                <dl className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="label-xs">Exemplaires</dt>
                    <dd className="num mt-1 text-lg font-bold">{sums.copies}</dd>
                  </div>
                  <div>
                    <dt className="label-xs">Payé</dt>
                    <dd className="num mt-1 text-lg font-bold">{sums.withPrice > 0 ? formatEur(sums.paid) : "—"}</dd>
                  </div>
                  <div>
                    <dt className="label-xs">Cote</dt>
                    <dd className="num mt-1 text-lg font-bold">{formatEur(sums.cote)}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-center text-xs text-faint">
                  Prix payé saisi pour {sums.withPrice} carte{sums.withPrice > 1 ? "s" : ""} sur {rows.length}
                </p>
                {error && <p className="mt-3 text-center text-sm text-loss">{error}</p>}
                <div className="mt-4">{submitButton(true)}</div>
              </div>
            )}
          </section>
        </aside>

        {/* ——— Carte par carte ——— */}
        <ul className="mt-5 flex flex-col gap-3 lg:order-1 lg:mt-0">
          {rows.map((r) => {
            const symbol = r.rarity ? raritySymbol(r.rarity) : null;
            const ownSource = r.sourceId ? sourceName(r.sourceId) : null;
            const extras = [ownSource, r.date ? shortDate(r.date) : null, r.note.trim() ? "note" : null].filter(Boolean);
            return (
              <li key={r.key} className="panel overflow-hidden !p-0">
                <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)]">
                  <div className="card-tile aspect-[63/88] w-16 self-start sm:row-span-3 sm:w-[5.5rem]">
                    <CardImage base={r.image_url || null} alt={r.card_name} placeholder="compact" />
                  </div>
                  <div className="flex min-w-0 items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-tight">{r.card_name}</p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {r.set_name} <span className="num text-faint">· {r.local_id}</span>
                        {r.rarity && (
                          <span className="text-faint" title={rarityLabel(r.rarity)}>
                            {" "}
                            · {symbol ? <span className="text-accent-strong">{symbol}</span> : rarityLabel(r.rarity)}
                          </span>
                        )}
                      </p>
                      <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-raised px-1.5 py-0.5 text-xs text-muted">
                        Cote <span className="num font-semibold text-foreground">{r.price != null ? formatEur(r.price) : "—"}</span>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => remove(r.key)}
                      aria-label={`Retirer ${r.card_name} du lot`}
                      title="Retirer du lot"
                      className="-mr-1.5 -mt-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-loss"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                  <div className="col-span-2 grid grid-cols-3 gap-2 sm:col-span-1 sm:col-start-2">
                    <Money label="Prix payé" value={r.paid} onChange={(v) => update(r.key, { paid: v })} />
                    <Money
                      label="Valeur"
                      value={r.value}
                      onChange={(v) => update(r.key, { value: v })}
                      placeholder={r.price != null ? toInput(r.price) : "—"}
                    />
                    <Stepper value={r.quantity} onChange={(n) => update(r.key, { quantity: n })} />
                  </div>
                  <div className="col-span-2 sm:col-span-1 sm:col-start-2">
                    <ConditionChips value={r.condition} onChange={(c) => update(r.key, { condition: c })} />
                  </div>
                </div>

                {/* Provenance, date et note propres à la carte */}
                <button
                  type="button"
                  onClick={() => update(r.key, { open: !r.open })}
                  aria-expanded={r.open}
                  className="flex w-full items-center gap-2 border-t border-edge px-4 py-2.5 text-left text-[13px] text-muted transition hover:bg-raised/50"
                >
                  <NotebookPen size={14} className="shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {extras.length > 0 ? (
                      <span className="text-foreground">{extras.join(" · ")}</span>
                    ) : (
                      <>
                        Provenance, date et note
                        {lotHint && <span className="text-faint"> · comme le lot ({lotHint})</span>}
                      </>
                    )}
                  </span>
                  <ChevronDown size={15} className={`shrink-0 transition-transform ${r.open ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {r.open && (
                  <div className="grid gap-3 border-t border-edge bg-raised/30 p-4 sm:grid-cols-2">
                    <label className="min-w-0 text-sm">
                      <span className="label-xs mb-1.5 flex items-center gap-1.5">
                        <Store size={12} aria-hidden /> Provenance
                      </span>
                      <select value={r.sourceId} onChange={(e) => update(r.key, { sourceId: e.target.value })} className="field !py-2.5">
                        <option value="">Comme le lot{lotSourceLabel ? ` (${lotSourceLabel})` : ""}</option>
                        {SOURCE_KINDS.map((k) => {
                          const list = sources.filter((s) => s.kind === k.kind);
                          return list.length > 0 ? (
                            <optgroup key={k.kind} label={k.label}>
                              {list.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                  {GEOCODED_KINDS.includes(s.kind) && s.city ? ` (${s.city})` : ""}
                                </option>
                              ))}
                            </optgroup>
                          ) : null;
                        })}
                      </select>
                    </label>
                    <label className="min-w-0 text-sm">
                      <span className="label-xs mb-1.5 flex items-center gap-1.5">
                        <CalendarDays size={12} aria-hidden /> Date d&apos;achat
                      </span>
                      <input type="date" value={r.date} onChange={(e) => update(r.key, { date: e.target.value })} className="field !py-2.5" />
                    </label>
                    <label className="min-w-0 text-sm sm:col-span-2">
                      <span className="label-xs mb-1.5 block">Note</span>
                      <textarea
                        rows={2}
                        maxLength={1000}
                        placeholder="ex. petit pli au dos, tirée du display de Noël…"
                        value={r.note}
                        onChange={(e) => update(r.key, { note: e.target.value })}
                        className="field resize-y"
                      />
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {!wide && error && <p className="mt-4 text-sm text-loss">{error}</p>}

      {/* Récapitulatif et validation, toujours à portée (mobile, tablette) */}
      {!wide && (
        <FloatingBar>
          <span className="min-w-0 whitespace-nowrap px-2 text-sm leading-tight">
            <span className="num font-semibold">{sums.copies}</span> ex.
            <span className="text-faint"> · </span>
            <span className="text-muted">payé </span>
            <span className="num font-semibold">{sums.withPrice > 0 ? formatEur(sums.paid) : "—"}</span>
            <span className="hidden text-muted sm:inline">
              {" "}
              · cote <span className="num font-semibold text-foreground">{formatEur(sums.cote)}</span>
            </span>
          </span>
          {submitButton(false)}
        </FloatingBar>
      )}
    </div>
  );
}
