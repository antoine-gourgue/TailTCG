"use client";

import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { createBinder } from "@/app/classeurs/actions";

// Modale de création d'un classeur (nom seul, redirige vers sa page)
export function NewBinderButton({ label = "Nouveau classeur" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        <Plus size={15} aria-hidden />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !submitting && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Nouveau classeur"
        >
          <div
            className="panel rise-in relative w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow-lg transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
            <p className="display mb-1 text-base font-semibold">Nouveau classeur</p>
            <p className="mb-4 text-sm text-muted">
              Une sous-collection thématique : toutes tes Pikachu, tes primes,
              tes gradées…
            </p>
            <form action={createBinder} onSubmit={() => setSubmitting(true)}>
              <input
                type="text"
                name="name"
                required
                autoFocus
                maxLength={60}
                placeholder="Nom du classeur"
                className="field"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="btn btn-ghost"
                >
                  Annuler
                </button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? "Création…" : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
