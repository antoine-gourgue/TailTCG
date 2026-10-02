"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Minus, Plus, Sparkles, Trash2 } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { FloatingBar } from "@/components/floating-bar";
import { CONDITIONS, LANGUAGES, formatEur, type ConditionCode } from "@/lib/domain";
import { addBatchToCollection } from "@/app/items/actions";
import { clearBatchDraft, loadBatchDraft, type BatchCard, type BatchDraft } from "@/lib/batch-draft";

type Row = BatchCard & {
  key: string;
  /** Saisies brutes (virgule ou point) */
  paid: string;
  value: string;
  condition: ConditionCode;
  quantity: number;
};

const LANGUAGE_LABEL: Record<string, string> = { FR: "Français", EN: "Anglais", JP: "Japonais", DE: "Allemand", IT: "Italien", ES: "Espagnol" };

/** « 12,5 » → 12.5 ; vide → null ; invalide → NaN */
function parsePrice(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : Number.NaN;
}
const toInput = (n: number) => n.toFixed(2).replace(".", ",");

const noopSubscribe = () => () => {};

const rowsOf = (draft: BatchDraft | null): Row[] =>
  (draft?.cards ?? []).map((c, i) => ({ ...c, key: `${c.tcgdex_id}-${i}`, paid: "", value: "", condition: "NM", quantity: 1 }));

/**
 * Ajout en lot : les cartes choisies sur un set, chacune avec son prix payé,
 * sa valeur, son état et sa quantité ; langue, date et boutique pour tout le
 * lot. Rien n'est ajouté avant « Ajouter à ma collection ».
 */
export function BatchAddClient({ sources }: { sources: { id: string; name: string }[] }) {
  const router = useRouter();
  // Le lot vient du sessionStorage : rendu neutre avant le montage client
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [draft] = useState<BatchDraft | null>(loadBatchDraft);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(draft));
  const [language, setLanguage] = useState(draft?.language ?? "FR");
  const [date, setDate] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: string) => setRows((rs) => rs.filter((r) => r.key !== key));

  const sums = useMemo(() => {
    let copies = 0;
    let paid = 0;
    let paidKnown = false;
    let cote = 0;
    let invalid = false;
    for (const r of rows) {
      copies += r.quantity;
      const p = parsePrice(r.paid);
      const v = parsePrice(r.value);
      if (Number.isNaN(p) || Number.isNaN(v)) invalid = true;
      if (p != null && !Number.isNaN(p)) {
        paid += p * r.quantity;
        paidKnown = true;
      }
      if (r.price != null) cote += r.price * r.quantity;
    }
    return { copies, paid: paidKnown ? paid : null, cote, invalid };
  }, [rows]);

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
        <p className="text-sm text-muted">Choisis des cartes sur la page d&apos;un set avec « Ajout rapide », puis valide : elles arrivent ici.</p>
        <Link href={draft?.back.href ?? "/recherche"} className="btn btn-primary mt-2">
          {draft ? `Retour à ${draft.back.label}` : "Parcourir les sets"}
        </Link>
      </div>
    );
  }

  const field = "field !py-2.5";

  return (
    <div className="pb-28 md:pb-24">
      <Link href={draft.back.href} className="mb-5 inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground">
        <ArrowLeft size={14} aria-hidden />
        {draft.back.label}
      </Link>
      <h1 className="display text-3xl font-bold tracking-tight">
        Ajouter {rows.length} carte{rows.length > 1 ? "s" : ""}
      </h1>
      <p className="mt-1 text-sm text-muted">
        Renseigne ce que tu sais, carte par carte : la valeur vide suit la cote Cardmarket. Tout reste modifiable ensuite.
      </p>

      {/* Pour tout le lot */}
      <section className="panel mt-6 p-5">
        <h2 className="display text-base font-semibold">Pour tout le lot</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <label className="min-w-0 text-sm">
            <span className="label-xs mb-1.5 block">Langue</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className={field}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_LABEL[l] ?? l}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 text-sm">
            <span className="label-xs mb-1.5 block">État de toutes</span>
            <select
              value=""
              onChange={(e) => {
                const c = e.target.value as ConditionCode;
                if (c) setRows((rs) => rs.map((r) => ({ ...r, condition: c })));
              }}
              className={field}
            >
              <option value="">Appliquer…</option>
              {CONDITIONS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 min-w-0 text-sm sm:col-span-1">
            <span className="label-xs mb-1.5 block">Date d&apos;achat</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="col-span-2 min-w-0 text-sm sm:col-span-1">
            <span className="label-xs mb-1.5 block">Boutique</span>
            <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={field}>
              <option value="">Aucune</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {/* Lot acheté d'un bloc : un prix total réparti selon la cote */}
        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-edge pt-4">
          <label className="min-w-0 flex-1 text-sm sm:max-w-56">
            <span className="label-xs mb-1.5 block">Prix total payé</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="ex. 49,90"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={`${field} num`}
            />
          </label>
          <button
            type="button"
            onClick={distribute}
            disabled={parsePrice(total) == null || Number.isNaN(parsePrice(total))}
            className="btn btn-ghost !py-2.5"
          >
            Répartir sur les cartes
          </button>
          <p className="basis-full text-xs text-faint">
            Au prorata de la cote Cardmarket de chaque carte ; les cartes sans cote restent à remplir.
          </p>
        </div>
      </section>

      {/* Carte par carte */}
      <ul className="mt-6 flex flex-col gap-3">
        {rows.map((r) => {
          const paidBad = Number.isNaN(parsePrice(r.paid));
          const valueBad = Number.isNaN(parsePrice(r.value));
          return (
            <li key={r.key} className="panel p-4 lg:flex lg:items-center lg:gap-5">
              <div className="flex min-w-0 items-center gap-3 lg:w-72 lg:shrink-0">
                <div className="card-tile aspect-[63/88] w-14 shrink-0">
                  <CardImage base={r.image_url || null} alt={r.card_name} placeholder="compact" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold leading-tight">{r.card_name}</p>
                  <p className="truncate text-xs text-muted">
                    {r.set_name} <span className="num text-faint">· {r.local_id}</span>
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    Cote{" "}
                    <span className="num font-semibold text-foreground">{r.price != null ? formatEur(r.price) : "—"}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(r.key)}
                  aria-label={`Retirer ${r.card_name} du lot`}
                  title="Retirer du lot"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-loss lg:order-last"
                >
                  <Trash2 size={15} aria-hidden />
                </button>
              </div>
              <div className="mt-3 grid min-w-0 flex-1 grid-cols-2 gap-3 sm:grid-cols-4 lg:mt-0">
                <label className="min-w-0 text-sm">
                  <span className="label-xs mb-1.5 block">Prix payé</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="—"
                    value={r.paid}
                    onChange={(e) => update(r.key, { paid: e.target.value })}
                    aria-invalid={paidBad}
                    className={`${field} num ${paidBad ? "!border-loss" : ""}`}
                  />
                </label>
                <label className="min-w-0 text-sm">
                  <span className="label-xs mb-1.5 block">Valeur</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder={r.price != null ? toInput(r.price) : "—"}
                    value={r.value}
                    onChange={(e) => update(r.key, { value: e.target.value })}
                    aria-invalid={valueBad}
                    className={`${field} num ${valueBad ? "!border-loss" : ""}`}
                  />
                </label>
                <label className="min-w-0 text-sm">
                  <span className="label-xs mb-1.5 block">État</span>
                  <select
                    value={r.condition}
                    onChange={(e) => update(r.key, { condition: e.target.value as ConditionCode })}
                    className={field}
                  >
                    {CONDITIONS.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="min-w-0 text-sm">
                  <span className="label-xs mb-1.5 block">Quantité</span>
                  <div className="flex h-[2.875rem] items-center rounded-[0.875rem] border border-edge bg-raised">
                    <button
                      type="button"
                      onClick={() => update(r.key, { quantity: Math.max(1, r.quantity - 1) })}
                      disabled={r.quantity <= 1}
                      aria-label="Un de moins"
                      className="flex h-full w-10 items-center justify-center text-muted transition hover:text-foreground disabled:opacity-30"
                    >
                      <Minus size={15} aria-hidden />
                    </button>
                    <span className="num flex-1 text-center font-semibold">{r.quantity}</span>
                    <button
                      type="button"
                      onClick={() => update(r.key, { quantity: Math.min(99, r.quantity + 1) })}
                      aria-label="Un de plus"
                      className="flex h-full w-10 items-center justify-center text-muted transition hover:text-foreground"
                    >
                      <Plus size={15} aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {error && <p className="mt-4 text-sm text-loss">{error}</p>}

      {/* Récapitulatif et validation, toujours à portée */}
      <FloatingBar>
        <span className="min-w-0 whitespace-nowrap px-2 text-sm leading-tight">
          <span className="num font-semibold">{sums.copies}</span> ex.
          <span className="text-faint"> · </span>
          <span className="text-muted">payé </span>
          <span className="num font-semibold">{sums.paid != null ? formatEur(sums.paid) : "—"}</span>
          <span className="hidden text-muted sm:inline">
            {" "}
            · cote <span className="num font-semibold text-foreground">{formatEur(sums.cote)}</span>
          </span>
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || sums.invalid}
          className="btn btn-primary shrink-0 !py-2.5"
          title={sums.invalid ? "Un prix est mal saisi" : undefined}
        >
          {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Check size={16} aria-hidden />}
          <span className="sm:hidden">Ajouter</span>
          <span className="hidden sm:inline">Ajouter à ma collection</span>
        </button>
      </FloatingBar>
    </div>
  );
}
