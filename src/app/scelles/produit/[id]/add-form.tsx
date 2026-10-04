"use client";

import { useActionState, useState } from "react";
import { Check, Plus } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { addSealedItem, type AddSealedState } from "../../actions";

/**
 * Ajout d'un lot à la collection : quantité, prix et date d'achat. En mode
 * `compact`, un bouton ouvre le formulaire dans une sheet (héros de la fiche).
 */
export function AddForm({ productId, compact = false }: { productId: number; compact?: boolean }) {
  const [state, action, pending] = useActionState<AddSealedState, FormData>(addSealedItem, null);
  const [open, setOpen] = useState(false);

  const form = (
    <form action={action} className="space-y-3">
      <input type="hidden" name="product_id" value={productId} />
      {/* Mobile : quantité et prix côte à côte, la date sur toute la largeur */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="min-w-0 text-sm">
          <span className="label-xs mb-1.5 block">Quantité</span>
          <input name="quantity" type="number" min={1} defaultValue={1} className="field" required />
        </label>
        <label className="min-w-0 text-sm">
          <span className="label-xs mb-1.5 block">Prix d&apos;achat (€)</span>
          <input name="purchase_price" type="text" inputMode="decimal" placeholder="—" className="field" />
        </label>
        <label className="col-span-2 min-w-0 text-sm sm:col-span-1">
          <span className="label-xs mb-1.5 block">Date d&apos;achat</span>
          <input name="purchase_date" type="date" className="field" />
        </label>
      </div>
      {state && !state.ok && <p className="text-sm text-loss">{state.error}</p>}
      {state?.ok && (
        <p className="flex items-center gap-2 text-sm text-gain">
          <Check size={15} aria-hidden />
          Ajouté à tes scellés.
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full sm:w-auto">
        <Plus size={16} aria-hidden />
        {pending ? "Ajout…" : "Ajouter à mes scellés"}
      </button>
    </form>
  );

  if (!compact) return form;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary shadow-lg shadow-accent/30">
        <Plus size={16} aria-hidden />
        Ajouter à mes scellés
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} dismissible={!pending} title="Ajouter à mes scellés" description="Quantité, prix et date d'achat du lot.">
        {form}
      </Sheet>
    </>
  );
}
