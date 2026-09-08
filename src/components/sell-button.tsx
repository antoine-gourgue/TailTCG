"use client";

import { useState, useTransition } from "react";
import { BadgeEuro } from "lucide-react";
import { markItemSold } from "@/app/items/actions";
import { formatEur, daysAgoISO } from "@/lib/domain";
import { Sheet } from "@/components/sheet";

// « Vendre » : marque l'exemplaire vendu (prix + date), il sort de la
// collection active et alimente la plus-value réalisée
export function SellButton({
  itemId,
  purchasePrice,
}: {
  itemId: string;
  purchasePrice: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await markItemSold(null, formData);
      if (res?.ok) {
        setOpen(false);
      } else {
        setError(res?.message ?? "Erreur inconnue.");
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        <BadgeEuro size={15} aria-hidden />
        Vendre
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!pending}
        title="Marquer comme vendue"
        description={
          purchasePrice != null ? (
            <>
              Achetée {formatEur(purchasePrice)} — la plus-value réalisée rejoindra tes stats.
            </>
          ) : (
            <>L&apos;exemplaire sortira de ta collection active.</>
          )
        }
      >
        <form action={submit} className="flex flex-col gap-3">
          <input type="hidden" name="item_id" value={itemId} />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="sold_price" className="label-xs mb-1.5 block">
                Prix de vente (€)
              </label>
              <input
                id="sold_price"
                type="text"
                name="sold_price"
                inputMode="decimal"
                placeholder="120"
                autoFocus
                required
                className="field num"
              />
            </div>
            <div>
              <label htmlFor="sold_at" className="label-xs mb-1.5 block">
                Date de vente
              </label>
              <input
                id="sold_at"
                type="date"
                name="sold_at"
                defaultValue={daysAgoISO(0)}
                className="field num"
              />
            </div>
          </div>
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="sheet-actions !mt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="btn btn-ghost"
            >
              Annuler
            </button>
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Enregistrement…" : "Vendue !"}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
