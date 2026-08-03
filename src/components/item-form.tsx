"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createItem,
  updateItem,
  createSource,
  type ItemFormState,
  type SourceOption,
} from "@/app/items/actions";
import { CONDITIONS, CARD_TYPES, LANGUAGES } from "@/lib/domain";

export type ItemDefaults = {
  card_type: string | null;
  language: string;
  condition: string | null;
  quantity: number;
  purchase_price: number | null;
  manual_price: number | null;
  purchase_date: string | null;
  source_id: string | null;
  cardmarket_url: string | null;
  graded: boolean;
  grade: string | null;
  notes: string | null;
};

export type CardMeta = {
  tcgdexId: string;
  name: string;
  setId: string;
  setName: string;
  localId: string;
  imageBase: string;
};

const inputCls =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-neutral-500 focus:outline-none";
const labelCls = "mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted";

export function ItemForm({
  mode,
  itemId,
  card,
  defaults,
  sources: initialSources,
}: {
  mode: "create" | "edit";
  itemId?: string;
  card?: CardMeta;
  defaults: ItemDefaults;
  sources: SourceOption[];
}) {
  const action = mode === "create" ? createItem : updateItem;
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(
    action,
    null
  );

  const [condition, setCondition] = useState(defaults.condition ?? "");
  const [graded, setGraded] = useState(defaults.graded);

  // --- source ---
  const [sources, setSources] = useState(initialSources);
  const initialKind =
    initialSources.find((s) => s.id === defaults.source_id)?.kind ?? null;
  const [sourceKind, setSourceKind] = useState<"shop" | "web" | null>(initialKind);
  const [sourceId, setSourceId] = useState(defaults.source_id ?? "");
  const [creatingSource, setCreatingSource] = useState(false);
  const [newSource, setNewSource] = useState({ name: "", address: "", city: "", url: "" });
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [savingSource, startSourceSave] = useTransition();

  const visibleSources = sources.filter((s) => s.kind === sourceKind);

  function submitNewSource() {
    if (!sourceKind) return;
    setSourceError(null);
    startSourceSave(async () => {
      const { source, error } = await createSource({
        name: newSource.name,
        kind: sourceKind,
        address: newSource.address,
        city: newSource.city,
        url: newSource.url,
      });
      if (error || !source) {
        setSourceError(error ?? "Erreur inconnue");
        return;
      }
      setSources((prev) => [...prev, source]);
      setSourceId(source.id);
      setCreatingSource(false);
      setNewSource({ name: "", address: "", city: "", url: "" });
    });
  }

  return (
    <form action={formAction} className="flex max-w-2xl flex-col gap-6">
      {mode === "create" && card && (
        <>
          <input type="hidden" name="tcgdex_id" value={card.tcgdexId} />
          <input type="hidden" name="card_name" value={card.name} />
          <input type="hidden" name="set_id" value={card.setId} />
          <input type="hidden" name="set_name" value={card.setName} />
          <input type="hidden" name="local_id" value={card.localId} />
          <input type="hidden" name="image_url" value={card.imageBase} />
        </>
      )}
      {mode === "edit" && itemId && (
        <input type="hidden" name="item_id" value={itemId} />
      )}

      {/* État — boutons segmentés avec signification */}
      <fieldset>
        <legend className={labelCls}>État</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {CONDITIONS.map((c) => (
            <label
              key={c.code}
              className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border px-2 py-2.5 text-center transition ${
                condition === c.code
                  ? "border-neutral-300 bg-neutral-100 text-neutral-950"
                  : "border-edge bg-surface text-foreground hover:border-neutral-500"
              }`}
            >
              <input
                type="radio"
                name="condition"
                value={c.code}
                checked={condition === c.code}
                onChange={() => setCondition(c.code)}
                className="sr-only"
                required
              />
              <span className="num text-sm font-semibold">{c.code}</span>
              <span
                className={`text-[10px] leading-tight ${
                  condition === c.code ? "text-neutral-600" : "text-muted"
                }`}
              >
                {c.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <label htmlFor="card_type" className={labelCls}>
            Type
          </label>
          <select
            id="card_type"
            name="card_type"
            defaultValue={defaults.card_type ?? ""}
            className={inputCls}
          >
            <option value="">—</option>
            {CARD_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="language" className={labelCls}>
            Langue
          </label>
          <select
            id="language"
            name="language"
            defaultValue={defaults.language}
            className={inputCls}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="quantity" className={labelCls}>
            Quantité
          </label>
          <input
            id="quantity"
            type="number"
            name="quantity"
            min={1}
            step={1}
            defaultValue={defaults.quantity}
            required
            className={`${inputCls} num`}
          />
        </div>
        <div>
          <label htmlFor="purchase_price" className={labelCls}>
            Prix payé (€)
          </label>
          <input
            id="purchase_price"
            type="text"
            inputMode="decimal"
            name="purchase_price"
            placeholder="12,50"
            defaultValue={defaults.purchase_price ?? ""}
            className={`${inputCls} num`}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="purchase_date" className={labelCls}>
            Date d&apos;achat
          </label>
          <input
            id="purchase_date"
            type="date"
            name="purchase_date"
            defaultValue={defaults.purchase_date ?? ""}
            className={`${inputCls} num`}
          />
        </div>
        <div>
          <label htmlFor="manual_price" className={labelCls}>
            Cote perso (€)
          </label>
          <input
            id="manual_price"
            type="text"
            inputMode="decimal"
            name="manual_price"
            placeholder="auto (Cardmarket)"
            defaultValue={defaults.manual_price ?? ""}
            className={`${inputCls} num`}
          />
          <p className="mt-1 text-[11px] text-muted">
            Remplace la cote Cardmarket. Vide = automatique.
          </p>
        </div>
        <div>
          <label htmlFor="cardmarket_url" className={labelCls}>
            Lien Cardmarket
          </label>
          <input
            id="cardmarket_url"
            type="url"
            name="cardmarket_url"
            defaultValue={defaults.cardmarket_url ?? ""}
            className={inputCls}
          />
        </div>
      </div>

      {/* Source — deux onglets : boutique / web */}
      <fieldset>
        <legend className={labelCls}>Source d&apos;achat</legend>
        <input type="hidden" name="source_id" value={sourceId} />
        <div className="mb-3 flex gap-2">
          {(
            [
              [null, "Aucune"],
              ["shop", "En boutique"],
              ["web", "Sur le web"],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setSourceKind(kind);
                setSourceId("");
                setCreatingSource(false);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm transition ${
                sourceKind === kind
                  ? "border-neutral-300 bg-neutral-100 text-neutral-950"
                  : "border-edge bg-surface text-muted hover:border-neutral-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {sourceKind && (
          <div className="flex flex-col gap-3">
            {visibleSources.length > 0 && (
              <select
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className={inputCls}
              >
                <option value="">
                  {sourceKind === "shop" ? "Choisir une boutique…" : "Choisir un site…"}
                </option>
                {visibleSources.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.kind === "shop" && s.city ? ` (${s.city})` : ""}
                  </option>
                ))}
              </select>
            )}

            {!creatingSource ? (
              <button
                type="button"
                onClick={() => setCreatingSource(true)}
                className="self-start text-sm text-muted underline transition hover:text-foreground"
              >
                + {sourceKind === "shop" ? "Nouvelle boutique" : "Nouveau site"}
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-lg border border-edge p-3">
                <input
                  type="text"
                  placeholder={sourceKind === "shop" ? "Nom (ex. Snoop Bayonne)" : "Nom (ex. Cardmarket)"}
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  className={inputCls}
                />
                {sourceKind === "shop" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="Adresse"
                      value={newSource.address}
                      onChange={(e) =>
                        setNewSource({ ...newSource, address: e.target.value })
                      }
                      className={inputCls}
                    />
                    <input
                      type="text"
                      placeholder="Ville"
                      value={newSource.city}
                      onChange={(e) =>
                        setNewSource({ ...newSource, city: e.target.value })
                      }
                      className={inputCls}
                    />
                  </div>
                ) : (
                  <input
                    type="url"
                    placeholder="https://…"
                    value={newSource.url}
                    onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                    className={inputCls}
                  />
                )}
                {sourceError && (
                  <p className="text-xs text-red-400">{sourceError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={submitNewSource}
                    disabled={savingSource}
                    className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50"
                  >
                    {savingSource ? "Création…" : "Créer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingSource(false)}
                    className="text-sm text-muted hover:text-foreground"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </fieldset>

      {/* Gradée */}
      <div className="flex items-center gap-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="graded"
            checked={graded}
            onChange={(e) => setGraded(e.target.checked)}
            className="h-4 w-4 accent-neutral-100"
          />
          Carte gradée
        </label>
        {graded && (
          <input
            type="text"
            name="grade"
            placeholder="PSA 9"
            defaultValue={defaults.grade ?? ""}
            className={`${inputCls} max-w-40`}
          />
        )}
      </div>

      <div>
        <label htmlFor="notes" className={labelCls}>
          Notes
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={defaults.notes ?? ""}
          className={inputCls}
        />
      </div>

      {state && <p className="text-sm text-red-400">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-neutral-100 px-6 py-2.5 font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50"
      >
        {pending
          ? "Enregistrement…"
          : mode === "create"
            ? "Ajouter à la collection"
            : "Enregistrer les modifications"}
      </button>
    </form>
  );
}
