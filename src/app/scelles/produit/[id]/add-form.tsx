"use client";

import { useActionState } from "react";
import { Check, Plus } from "lucide-react";
import { addSealedItem, type AddSealedState } from "../../actions";

/** Ajout d'un lot à la collection : quantité, prix et date d'achat */
export function AddForm({ productId }: { productId: number }) {
  const [state, action, pending] = useActionState<AddSealedState, FormData>(addSealedItem, null);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="product_id" value={productId} />
      <div className="grid grid-cols-3 gap-3">
        <label className="text-sm">
          <span className="label-xs mb-1.5 block">Quantité</span>
          <input name="quantity" type="number" min={1} defaultValue={1} className="field" required />
        </label>
        <label className="text-sm">
          <span className="label-xs mb-1.5 block">Prix d&apos;achat (€)</span>
          <input name="purchase_price" type="text" inputMode="decimal" placeholder="—" className="field" />
        </label>
        <label className="text-sm">
          <span className="label-xs mb-1.5 block">Date</span>
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
      <button type="submit" disabled={pending} className="btn btn-primary">
        <Plus size={16} aria-hidden />
        {pending ? "Ajout…" : "Ajouter à mes scellés"}
      </button>
    </form>
  );
}
