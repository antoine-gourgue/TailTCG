"use client";

import { useActionState, useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import {
  createItem,
  updateItem,
  createSource,
  type ItemFormState,
  type SourceOption,
} from "@/app/items/actions";
import {
  CARD_TYPES,
  CONDITIONS,
  LANGUAGES,
  SOURCE_KINDS,
  GEOCODED_KINDS,
  formatEur,
  sourceKindLabel,
  type SourceKind,
} from "@/lib/domain";

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

export type ManualCardFields = {
  card_name: string;
  set_name: string;
  local_id: string;
};

/** Bloc du formulaire : titre, indication, champs. Les blocs s'empilent séparés d'un filet. */
function Group({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 py-5 first:pt-0 last:pb-0">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="display text-base font-semibold">{title}</h2>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ id, label, children, className = "" }: { id: string; label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={id} className="label-xs mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

/** « 12,50 » → 12.5 ; null si vide ou illisible */
function parseEur(v: string): number | null {
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? null : n;
}

export function ItemForm({
  mode,
  itemId,
  card,
  cardFields,
  defaults,
  sources: initialSources,
  scanId,
  submitLabel,
  cote,
}: {
  mode: "create" | "edit";
  itemId?: string;
  card?: CardMeta;
  /** Carte absente de TCGdex : nom/set/numéro saisis à la main */
  cardFields?: ManualCardFields;
  defaults: ItemDefaults;
  sources: SourceOption[];
  /** Carte scannée depuis le téléphone : l'enregistrement enchaîne sur la suivante */
  scanId?: string;
  submitLabel?: string;
  /** Cote Cardmarket connue : proposée en un clic comme valeur estimée */
  cote?: number | null;
}) {
  const action = mode === "create" ? createItem : updateItem;
  const [state, formAction, pending] = useActionState<ItemFormState, FormData>(
    action,
    null
  );

  const [condition, setCondition] = useState(defaults.condition ?? "");
  const [graded, setGraded] = useState(defaults.graded);
  const [paid, setPaid] = useState(defaults.purchase_price != null ? String(defaults.purchase_price).replace(".", ",") : "");
  const [value, setValue] = useState(defaults.manual_price != null ? String(defaults.manual_price).replace(".", ",") : "");
  const [quantity, setQuantity] = useState(defaults.quantity);
  const [cardType, setCardType] = useState(defaults.card_type ?? "Normale");
  const [notesOpen, setNotesOpen] = useState(Boolean(defaults.notes));

  // Plus-value estimée en direct, dès que prix payé et valeur sont saisis
  const paidN = parseEur(paid);
  const valueN = parseEur(value) ?? (mode === "create" ? cote ?? null : null);
  const delta = paidN != null && valueN != null ? (valueN - paidN) * Math.max(1, quantity) : null;

  // --- source ---
  const [sources, setSources] = useState(initialSources);
  const initialKind =
    initialSources.find((s) => s.id === defaults.source_id)?.kind ?? null;
  const [sourceKind, setSourceKind] = useState<SourceKind | null>(initialKind);
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

  const chip = (on: boolean) =>
    `seg px-3.5 py-1.5 text-sm ${on ? "font-medium text-accent-strong" : "text-muted"}`;

  return (
    <form action={formAction} className="flex flex-col gap-4 lg:h-full">
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
      {scanId && <input type="hidden" name="scan_id" value={scanId} />}

      <div className="panel divide-y divide-ring p-5 sm:p-6 lg:flex-1">
        {/* Carte manuelle : identité saisie à la main */}
        {cardFields && (
          <Group title="La carte" hint="hors catalogue">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field id="card_name" label="Nom" className="col-span-2">
                <input id="card_name" type="text" name="card_name" placeholder="Pikachu" defaultValue={cardFields.card_name} required className="field" />
              </Field>
              <Field id="set_name" label="Set / série">
                <input id="set_name" type="text" name="set_name" placeholder="Promo S-P" defaultValue={cardFields.set_name} required className="field" />
              </Field>
              <Field id="local_id" label="Numéro">
                <input id="local_id" type="text" name="local_id" placeholder="208/S-P" defaultValue={cardFields.local_id} required className="field num" />
              </Field>
            </div>
          </Group>
        )}

        {/* État */}
        <Group title="État" hint={condition ? CONDITIONS.find((c) => c.code === condition)?.label : "obligatoire"}>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
            {CONDITIONS.map((c) => (
              <label
                key={c.code}
                data-on={condition === c.code}
                className="seg flex cursor-pointer flex-col items-center gap-0.5 px-1 py-2.5 text-center"
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
                <span className={`num text-sm font-bold ${condition === c.code ? "text-accent-strong" : ""}`}>{c.code}</span>
                <span className="text-[10px] leading-tight text-muted">{c.label}</span>
              </label>
            ))}
          </div>
        </Group>

        {/* Exemplaire */}
        <Group title="Exemplaire">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <Field id="language" label="Langue">
              <select id="language" name="language" defaultValue={defaults.language} className="field">
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="quantity" label="Quantité">
              <input
                id="quantity"
                type="number"
                name="quantity"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
                required
                className="field num"
              />
            </Field>
            <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
              <label className="seg flex h-[42px] cursor-pointer items-center justify-center gap-2 px-4 text-sm" data-on={graded}>
                <input type="checkbox" name="graded" checked={graded} onChange={(e) => setGraded(e.target.checked)} className="sr-only" />
                <span className={graded ? "font-medium text-accent-strong" : "text-muted"}>Gradée</span>
              </label>
              {graded && (
                <input
                  id="grade"
                  type="text"
                  name="grade"
                  placeholder="PSA 9"
                  aria-label="Grade"
                  defaultValue={defaults.grade ?? ""}
                  className="field w-32"
                />
              )}
            </div>
          </div>
          <input type="hidden" name="card_type" value={cardType} />
          <p className="label-xs mb-1.5 mt-4">Variante</p>
          <div className="flex flex-wrap gap-2">
            {CARD_TYPES.map((t) => (
              <button key={t} type="button" data-on={cardType === t} onClick={() => setCardType(t)} className={chip(cardType === t)}>
                {t}
              </button>
            ))}
          </div>
        </Group>

        {/* Achat */}
        <Group title="Achat" hint="prix et date facultatifs">
          <div className="grid grid-cols-2 gap-3">
            <Field id="purchase_price" label="Prix payé (€)">
              <input
                id="purchase_price"
                type="text"
                inputMode="decimal"
                name="purchase_price"
                placeholder="12,50"
                value={paid}
                onChange={(e) => setPaid(e.target.value)}
                className="field num"
              />
            </Field>
            <Field id="purchase_date" label="Date d’achat">
              <input id="purchase_date" type="date" name="purchase_date" defaultValue={defaults.purchase_date ?? ""} className="field num" />
            </Field>
          </div>

          <input type="hidden" name="source_id" value={sourceId} />
          <p className="label-xs mb-1.5 mt-4">Source</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-on={sourceKind === null}
              onClick={() => {
                setSourceKind(null);
                setSourceId("");
                setCreatingSource(false);
              }}
              className={chip(sourceKind === null)}
            >
              Aucune
            </button>
            {SOURCE_KINDS.map(({ kind, label }) => (
              <button
                key={kind}
                type="button"
                data-on={sourceKind === kind}
                onClick={() => {
                  setSourceKind(kind);
                  setSourceId("");
                  setCreatingSource(false);
                }}
                className={chip(sourceKind === kind)}
              >
                {label}
              </button>
            ))}
          </div>

          {sourceKind && (
            <div className="mt-3 flex flex-col gap-3">
              {visibleSources.length > 0 && (
                <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="field" aria-label="Choisir la source">
                  <option value="">Choisir…</option>
                  {visibleSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {GEOCODED_KINDS.includes(s.kind) && s.city ? ` (${s.city})` : ""}
                    </option>
                  ))}
                </select>
              )}

              {!creatingSource ? (
                <button
                  type="button"
                  onClick={() => setCreatingSource(true)}
                  className="self-start text-sm text-accent underline-offset-4 transition hover:text-accent-strong hover:underline"
                >
                  + Nouvelle source ({sourceKindLabel(sourceKind).toLowerCase()})
                </button>
              ) : (
                <div className="flex flex-col gap-2 rounded-2xl bg-raised/50 p-3.5 ring-1 ring-ring">
                  <input
                    type="text"
                    placeholder={
                      sourceKind === "shop"
                        ? "Nom (ex. Snoop Bayonne)"
                        : sourceKind === "web"
                          ? "Nom (ex. Cardmarket)"
                          : sourceKind === "flea"
                            ? "Nom (ex. Brocante de Biarritz)"
                            : sourceKind === "trade"
                              ? "Nom (ex. Échange avec Lucas)"
                              : "Nom (ex. Booster Déchaînement)"
                    }
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    className="field"
                  />
                  {GEOCODED_KINDS.includes(sourceKind) && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder={sourceKind === "flea" ? "Lieu (facultatif)" : "Adresse"}
                        value={newSource.address}
                        onChange={(e) => setNewSource({ ...newSource, address: e.target.value })}
                        className="field"
                      />
                      <input
                        type="text"
                        placeholder="Ville"
                        value={newSource.city}
                        onChange={(e) => setNewSource({ ...newSource, city: e.target.value })}
                        className="field"
                      />
                    </div>
                  )}
                  {sourceKind === "web" && (
                    <input
                      type="url"
                      placeholder="https://…"
                      value={newSource.url}
                      onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                      className="field"
                    />
                  )}
                  {sourceError && <p className="text-xs text-loss">{sourceError}</p>}
                  <div className="flex gap-2">
                    <button type="button" onClick={submitNewSource} disabled={savingSource} className="btn btn-primary !py-1.5 text-sm">
                      {savingSource ? "Création…" : "Créer"}
                    </button>
                    <button type="button" onClick={() => setCreatingSource(false)} className="btn btn-ghost !py-1.5 text-sm">
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Group>

        {/* Valeur */}
        <Group title="Valeur" hint={cote != null ? "cote Cardmarket par défaut" : "facultatif"}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1fr]">
            <Field id="manual_price" label="Valeur estimée (€)">
              <input
                id="manual_price"
                type="text"
                inputMode="decimal"
                name="manual_price"
                placeholder={cote != null ? String(cote).replace(".", ",") : "ex. 90"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="field num"
              />
            </Field>
            {cote != null && (
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setValue(String(cote).replace(".", ","))}
                  className="btn btn-ghost w-full !py-2 text-sm"
                  title="Reprendre la cote Cardmarket"
                >
                  <Sparkles size={14} aria-hidden /> Cote {formatEur(cote)}
                </button>
              </div>
            )}
            {delta != null && (
              <div className="col-span-2 flex items-end sm:col-span-1">
                <p className="w-full rounded-xl bg-raised/60 px-3 py-2 text-sm">
                  <span className="label-xs !text-[10px] block text-muted">Plus-value estimée</span>
                  <span className={`num font-semibold ${delta > 0 ? "text-gain" : delta < 0 ? "text-loss" : ""}`}>
                    {delta > 0 ? "+" : ""}
                    {formatEur(delta)}
                  </span>
                </p>
              </div>
            )}
          </div>
        </Group>

        {/* Notes */}
        <Group title="Notes" hint="facultatif">
          {notesOpen ? (
            <textarea
              id="notes"
              name="notes"
              rows={3}
              placeholder="Particularités, défauts, souvenirs…"
              defaultValue={defaults.notes ?? ""}
              className="field resize-y"
              autoFocus={!defaults.notes}
            />
          ) : (
            <button type="button" onClick={() => setNotesOpen(true)} className="text-sm text-accent underline-offset-4 transition hover:text-accent-strong hover:underline">
              + Ajouter une note
            </button>
          )}
        </Group>
      </div>

      {state && <p className="text-sm text-loss">{state.message}</p>}

      {/* Barre d'action : reste visible au-dessus du dock mobile pendant la saisie */}
      <div className="sticky bottom-[8rem] z-10 flex items-center justify-between gap-3 rounded-2xl bg-surface/90 p-2.5 shadow-lg shadow-black/10 ring-1 ring-ring backdrop-blur md:bottom-4">
        <p className="min-w-0 truncate pl-2 text-xs text-muted">
          {condition ? (
            <>
              État <span className="num font-semibold text-foreground">{condition}</span>
              {cardType !== "Normale" && <> · {cardType}</>}
              {quantity > 1 && <> · ×{quantity}</>}
              {paidN != null && <> · payé <span className="num font-semibold text-foreground">{formatEur(paidN * quantity)}</span></>}
            </>
          ) : (
            "Choisis l’état de la carte pour continuer"
          )}
        </p>
        <button type="submit" disabled={pending} className="btn btn-primary shrink-0 shadow-lg shadow-accent/30">
          {pending
            ? "Enregistrement…"
            : submitLabel
              ? submitLabel
              : mode === "create"
                ? "Ajouter à la collection"
                : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
