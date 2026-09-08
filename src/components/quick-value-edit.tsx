"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { updateItemValue } from "@/app/items/actions";
import { formatEur } from "@/lib/domain";
import { Sheet } from "@/components/sheet";

// Bouton « Actualiser la valeur » (fiche carte) : saisie rapide, chaque
// enregistrement ajoute un point daté à la courbe
export function ValueUpdateButton({
  itemId,
  current,
}: {
  itemId: string;
  current: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await updateItemValue(null, formData);
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
        <RefreshCw size={15} aria-hidden />
        Actualiser la valeur
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!pending}
        title="Actualiser la valeur estimée"
        description={
          current != null ? (
            <>
              Valeur actuelle :{" "}
              <span className="num text-foreground">{formatEur(current)}</span> — la nouvelle
              sera datée d&apos;aujourd&apos;hui sur la courbe.
            </>
          ) : (
            <>Première estimation : elle démarre la courbe de cette carte.</>
          )
        }
      >
        <form action={submit} className="flex flex-col gap-3">
          <input type="hidden" name="item_id" value={itemId} />
          <div>
            <label htmlFor="quick-value" className="label-xs mb-1.5 block">
              Nouvelle valeur (€)
            </label>
            <input
              id="quick-value"
              type="text"
              name="value"
              inputMode="decimal"
              defaultValue={current ?? ""}
              placeholder="90"
              autoFocus
              required
              className="field num"
            />
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
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
