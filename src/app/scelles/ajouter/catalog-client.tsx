"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { Boxes, Check, Search, X } from "lucide-react";
import { KIND_ORDER, kindLabel } from "@/lib/sealed";
import { addSealedItem, type AddSealedState } from "../actions";

export type CatalogProduct = {
  id: number;
  name: string;
  kind: string;
  set: string;
  setId: string;
  released: string;
  image: string;
};

/** Normalisation pour la recherche : minuscules, sans accents */
const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Nombre de produits rendus au maximum (le reste apparaît en affinant la recherche) */
const MAX_SHOWN = 240;

export function CatalogClient({ products }: { products: CatalogProduct[] }) {
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("");
  const [selected, setSelected] = useState<CatalogProduct | null>(null);

  const kindsPresent = useMemo(() => {
    const s = new Set(products.map((p) => p.kind));
    return KIND_ORDER.filter((k) => s.has(k));
  }, [products]);

  const shown = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const list = products.filter((p) => {
      if (kind && p.kind !== kind) return false;
      if (!words.length) return true;
      const hay = fold(`${p.name} ${p.set}`);
      return words.every((w) => hay.includes(w));
    });
    return list.slice(0, MAX_SHOWN);
  }, [products, q, kind]);

  // Regroupe par extension, dans l'ordre reçu (récentes d'abord)
  const groups = useMemo(() => {
    const map = new Map<string, { set: string; items: CatalogProduct[] }>();
    for (const p of shown) {
      const g = map.get(p.setId) ?? { set: p.set, items: [] };
      g.items.push(p);
      map.set(p.setId, g);
    }
    return [...map.values()];
  }, [shown]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search size={16} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom du produit ou extension… (ex. Prismatic ETB, display Évolutions Prismatiques)"
            className="field w-full pl-9"
            autoFocus
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setKind("")} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${kind === "" ? "border-accent bg-accent/15 text-accent-strong" : "border-edge hover:bg-raised"}`}>
            Tous
          </button>
          {kindsPresent.map((k) => (
            <button key={k} type="button" onClick={() => setKind(kind === k ? "" : k)} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${kind === k ? "border-accent bg-accent/15 text-accent-strong" : "border-edge hover:bg-raised"}`}>
              {kindLabel(k)}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 p-10 text-center">
          <Boxes size={28} className="text-muted" aria-hidden />
          <p className="text-sm text-muted">Aucun produit ne correspond.</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.set}>
            <h2 className="label-xs mb-2 text-muted">{g.set}</h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {g.items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(p)}
                    className="group flex w-full flex-col overflow-hidden rounded-xl border border-edge bg-panel text-left transition hover:border-accent/60 hover:shadow-md"
                  >
                    <div className="flex aspect-square items-center justify-center bg-white p-3">
                      {p.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.image} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
                      ) : (
                        <Boxes size={32} className="text-muted" aria-hidden />
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="line-clamp-2 text-xs font-medium leading-tight">{p.name}</p>
                      <p className="mt-1 text-[11px] text-muted">{kindLabel(p.kind)}</p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {shown.length >= MAX_SHOWN && (
        <p className="text-center text-xs text-muted">Affine ta recherche pour voir plus de produits.</p>
      )}

      {selected && <AddSheet product={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** Feuille d'ajout : quantité, prix et date d'achat, puis retour au catalogue */
function AddSheet({ product, onClose }: { product: CatalogProduct; onClose: () => void }) {
  const [state, action, pending] = useActionState<AddSealedState, FormData>(addSealedItem, null);
  // Succès dérivé de l'état de l'action ; l'effet ne fait que refermer la feuille
  const done = state?.ok ? state.name : null;

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(onClose, 1400);
    return () => window.clearTimeout(t);
  }, [done, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="panel w-full max-w-md rounded-t-2xl p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Ajouter ${product.name}`}
      >
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-white p-1.5">
            {product.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image} alt="" className="max-h-full max-w-full object-contain" />
            ) : (
              <Boxes size={24} className="text-muted" aria-hidden />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{product.name}</p>
            <p className="mt-0.5 text-xs text-muted">
              {kindLabel(product.kind)} · {product.set}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost -mr-2 -mt-1 px-2" aria-label="Fermer">
            <X size={16} aria-hidden />
          </button>
        </div>

        {done ? (
          <p className="flex items-center gap-2 rounded-lg bg-gain/10 px-3 py-2 text-sm text-gain">
            <Check size={16} aria-hidden />
            {done} ajouté à tes scellés
          </p>
        ) : (
          <form action={action} className="space-y-3">
            <input type="hidden" name="product_id" value={product.id} />
            <div className="grid grid-cols-3 gap-3">
              <label className="text-sm">
                <span className="label-xs mb-1 block text-muted">Quantité</span>
                <input name="quantity" type="number" min={1} defaultValue={1} className="field w-full" required />
              </label>
              <label className="text-sm">
                <span className="label-xs mb-1 block text-muted">Prix d&apos;achat (€)</span>
                <input name="purchase_price" type="text" inputMode="decimal" placeholder="0" className="field w-full" />
              </label>
              <label className="text-sm">
                <span className="label-xs mb-1 block text-muted">Date</span>
                <input name="purchase_date" type="date" className="field w-full" />
              </label>
            </div>
            {state && !state.ok && <p className="text-sm text-loss">{state.error}</p>}
            <button type="submit" disabled={pending} className="btn btn-primary w-full justify-center">
              {pending ? "Ajout…" : "Ajouter à mes scellés"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
