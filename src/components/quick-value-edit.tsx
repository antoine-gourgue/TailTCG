"use client";

import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { updateItemValue } from "@/app/items/actions";
import { formatEur } from "@/lib/domain";

// Bouton « Actualiser la valeur » (fiche carte) : modale de saisie rapide,
// chaque enregistrement ajoute un point daté à la courbe
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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

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

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !pending && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Actualiser la valeur estimée"
        >
          <div
            className="panel rise-in w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="display mb-1 text-base font-semibold">
              Actualiser la valeur estimée
            </p>
            <p className="mb-4 text-sm text-muted">
              {current != null ? (
                <>
                  Valeur actuelle :{" "}
                  <span className="num text-foreground">{formatEur(current)}</span>
                  {" "}— la nouvelle sera datée d&apos;aujourd&apos;hui sur la
                  courbe.
                </>
              ) : (
                <>Première estimation : elle démarre la courbe de cette carte.</>
              )}
            </p>
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
              <div className="flex justify-end gap-2">
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
          </div>
        </div>
      )}
    </>
  );
}
