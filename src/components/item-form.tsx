"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
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

function Section({
  step,
  title,
  hint,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-baseline gap-2.5">
        <span className="display num text-sm font-bold text-accent">{step}</span>
        <h2 className="display text-base font-semibold">{title}</h2>
        {hint && <span className="text-xs text-faint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export type ManualCardFields = {
  card_name: string;
  set_name: string;
  local_id: string;
};

export function ItemForm({
  mode,
  itemId,
  card,
  cardFields,
  defaults,
  sources: initialSources,
}: {
  mode: "create" | "edit";
  itemId?: string;
  card?: CardMeta;
  /** Carte absente de TCGdex : nom/set/numéro saisis à la main */
  cardFields?: ManualCardFields;
  defaults: ItemDefaults;
  sources: SourceOption[];
}) {
  const stepNo = (n: number) =>
    String(n + (cardFields ? 2 : 0)).padStart(2, "0");

  // Photos obligatoires en ajout manuel : compressées avant soumission
  const manualPhotos = Boolean(cardFields) && mode === "create";
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [compressingPhotos, setCompressingPhotos] = useState(false);

  async function handleManualPhotos(files: FileList | null) {
    if (!files || files.length === 0) {
      setPhotoPreviews([]);
      return;
    }
    setCompressingPhotos(true);
    try {
      const { default: imageCompression } = await import(
        "browser-image-compression"
      );
      const dt = new DataTransfer();
      const previews: string[] = [];
      for (const file of Array.from(files).slice(0, 3)) {
        const compressed = await imageCompression(file, {
          maxWidthOrHeight: 1600,
          initialQuality: 0.8,
          fileType: "image/webp",
          maxSizeMB: 1,
          useWebWorker: true,
        });
        const out = new File([compressed], "photo.webp", { type: "image/webp" });
        dt.items.add(out);
        previews.push(URL.createObjectURL(out));
      }
      if (photoInputRef.current) photoInputRef.current.files = dt.files;
      setPhotoPreviews(previews);
    } finally {
      setCompressingPhotos(false);
    }
  }
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
    <form action={formAction} className="flex max-w-2xl flex-col gap-4">
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

      {/* 0 — Carte manuelle : identité saisie à la main */}
      {cardFields && (
        <Section step="01" title="La carte" hint="hors catalogue TCGdex">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="col-span-2">
              <label htmlFor="card_name" className="label-xs mb-1.5 block">
                Nom de la carte
              </label>
              <input
                id="card_name"
                type="text"
                name="card_name"
                placeholder="Pikachu"
                defaultValue={cardFields.card_name}
                required
                className="field"
              />
            </div>
            <div>
              <label htmlFor="set_name" className="label-xs mb-1.5 block">
                Set / série
              </label>
              <input
                id="set_name"
                type="text"
                name="set_name"
                placeholder="Promo S-P"
                defaultValue={cardFields.set_name}
                required
                className="field"
              />
            </div>
            <div>
              <label htmlFor="local_id" className="label-xs mb-1.5 block">
                Numéro
              </label>
              <input
                id="local_id"
                type="text"
                name="local_id"
                placeholder="208/S-P"
                defaultValue={cardFields.local_id}
                required
                className="field num"
              />
            </div>
          </div>
        </Section>
      )}

      {/* 0bis — Photos de la carte (obligatoires en manuel) */}
      {manualPhotos && (
        <Section step="02" title="Photos de ta carte" hint="au moins une — c'est elle le visuel">
          <div className="flex flex-wrap items-start gap-3">
            <label
              className={`flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-edge-strong text-muted transition hover:border-accent hover:text-accent ${
                compressingPhotos ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {compressingPhotos ? (
                <Loader2 size={22} className="animate-spin" aria-hidden />
              ) : (
                <ImagePlus size={22} aria-hidden />
              )}
              <span className="px-1 text-center text-xs font-medium">
                {compressingPhotos ? "Compression…" : "Choisir"}
              </span>
              <input
                ref={photoInputRef}
                type="file"
                name="photos"
                accept="image/*"
                multiple
                required
                onChange={(e) => handleManualPhotos(e.target.files)}
                className="sr-only"
              />
            </label>
            {photoPreviews.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={src}
                alt={`Photo ${i + 1}`}
                className="h-28 w-28 rounded-2xl border border-edge object-cover"
              />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Jusqu&apos;à 3 photos (recto, verso, défaut) — tu pourras en ajouter
            d&apos;autres ensuite sur la fiche.
          </p>
        </Section>
      )}

      {/* 1 — État */}
      <Section step={stepNo(1)} title="État de la carte">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {CONDITIONS.map((c) => (
            <label
              key={c.code}
              data-on={condition === c.code}
              className="seg flex cursor-pointer flex-col items-center gap-1 px-1 py-2.5 text-center"
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
              <span
                className={`num text-sm font-bold ${
                  condition === c.code ? "text-accent-strong" : ""
                }`}
              >
                {c.code}
              </span>
              <span className="text-[10px] leading-tight text-muted">{c.label}</span>
            </label>
          ))}
        </div>
      </Section>

      {/* 2 — La carte */}
      <Section step={stepNo(2)} title="Exemplaire">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <label htmlFor="card_type" className="label-xs mb-1.5 block">
              Type
            </label>
            <select
              id="card_type"
              name="card_type"
              defaultValue={defaults.card_type ?? ""}
              className="field"
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
            <label htmlFor="language" className="label-xs mb-1.5 block">
              Langue
            </label>
            <select
              id="language"
              name="language"
              defaultValue={defaults.language}
              className="field"
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quantity" className="label-xs mb-1.5 block">
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
              className="field num"
            />
          </div>
          <div className="flex flex-col justify-end">
            <label className="seg flex cursor-pointer items-center justify-center gap-2 px-3 py-2 text-sm" data-on={graded}>
              <input
                type="checkbox"
                name="graded"
                checked={graded}
                onChange={(e) => setGraded(e.target.checked)}
                className="sr-only"
              />
              <span className={graded ? "font-medium text-accent-strong" : "text-muted"}>
                Gradée
              </span>
            </label>
          </div>
        </div>
        {graded && (
          <div className="mt-3">
            <label htmlFor="grade" className="label-xs mb-1.5 block">
              Grade
            </label>
            <input
              id="grade"
              type="text"
              name="grade"
              placeholder="PSA 9"
              defaultValue={defaults.grade ?? ""}
              className="field max-w-40"
            />
          </div>
        )}
      </Section>

      {/* 3 — Achat et valeur */}
      <Section step={stepNo(3)} title="Achat & valeur">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="purchase_price" className="label-xs mb-1.5 block">
              Prix payé (€)
            </label>
            <input
              id="purchase_price"
              type="text"
              inputMode="decimal"
              name="purchase_price"
              placeholder="12,50"
              defaultValue={defaults.purchase_price ?? ""}
              className="field num"
            />
          </div>
          <div>
            <label htmlFor="manual_price" className="label-xs mb-1.5 block">
              Valeur estimée (€)
            </label>
            <input
              id="manual_price"
              type="text"
              inputMode="decimal"
              name="manual_price"
              placeholder="ex. 90"
              defaultValue={defaults.manual_price ?? ""}
              className="field num"
            />
          </div>
          <div>
            <label htmlFor="purchase_date" className="label-xs mb-1.5 block">
              Date d&apos;achat
            </label>
            <input
              id="purchase_date"
              type="date"
              name="purchase_date"
              defaultValue={defaults.purchase_date ?? ""}
              className="field num"
            />
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="cardmarket_url" className="label-xs mb-1.5 block">
            Lien Cardmarket
          </label>
          <input
            id="cardmarket_url"
            type="url"
            name="cardmarket_url"
            placeholder="https://…"
            defaultValue={defaults.cardmarket_url ?? ""}
            className="field"
          />
        </div>
      </Section>

      {/* 4 — Source */}
      <Section step={stepNo(4)} title="Source d'achat" hint="optionnel">
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
              data-on={sourceKind === kind}
              onClick={() => {
                setSourceKind(kind);
                setSourceId("");
                setCreatingSource(false);
              }}
              className={`seg px-3.5 py-1.5 text-sm ${
                sourceKind === kind ? "font-medium text-accent-strong" : "text-muted"
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
                className="field"
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
                className="self-start text-sm text-accent underline-offset-2 transition hover:text-accent-strong hover:underline"
              >
                + {sourceKind === "shop" ? "Nouvelle boutique" : "Nouveau site"}
              </button>
            ) : (
              <div className="flex flex-col gap-2 rounded-xl border border-dashed border-edge-strong p-3.5">
                <input
                  type="text"
                  placeholder={
                    sourceKind === "shop" ? "Nom (ex. Snoop Bayonne)" : "Nom (ex. Cardmarket)"
                  }
                  value={newSource.name}
                  onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                  className="field"
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
                      className="field"
                    />
                    <input
                      type="text"
                      placeholder="Ville"
                      value={newSource.city}
                      onChange={(e) =>
                        setNewSource({ ...newSource, city: e.target.value })
                      }
                      className="field"
                    />
                  </div>
                ) : (
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
                  <button
                    type="button"
                    onClick={submitNewSource}
                    disabled={savingSource}
                    className="btn btn-primary !py-1.5 text-sm"
                  >
                    {savingSource ? "Création…" : "Créer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreatingSource(false)}
                    className="btn btn-ghost !py-1.5 text-sm"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </Section>

      {/* 5 — Notes */}
      <Section step={stepNo(5)} title="Notes" hint="optionnel">
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="Particularités, défauts, souvenirs…"
          defaultValue={defaults.notes ?? ""}
          className="field resize-y"
        />
      </Section>

      {state && <p className="text-sm text-loss">{state.message}</p>}

      <button
        type="submit"
        disabled={pending || compressingPhotos}
        className="btn btn-primary self-start !px-7 !py-3"
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
