"use client";

import { useEffect, useState } from "react";
import { Pencil, X } from "lucide-react";
import { renameBinder } from "@/app/classeurs/actions";

export function RenameBinderButton({
  binderId,
  currentName,
}: {
  binderId: string;
  currentName: string;
}) {
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
      <button
        type="button"
        onClick={() => {
          setSubmitting(false);
          setOpen(true);
        }}
        title="Renommer"
        aria-label="Renommer le classeur"
        className="btn btn-ghost !px-2.5"
      >
        <Pencil size={15} aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !submitting && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Renommer le classeur"
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
            <p className="display mb-4 text-base font-semibold">
              Renommer le classeur
            </p>
            <form
              action={renameBinder}
              onSubmit={() => {
                setSubmitting(true);
                setOpen(false);
              }}
            >
              <input type="hidden" name="binder_id" value={binderId} />
              <input
                type="text"
                name="name"
                required
                autoFocus
                maxLength={60}
                defaultValue={currentName}
                className="field"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="btn btn-ghost"
                >
                  Annuler
                </button>
                <button type="submit" className="btn btn-primary">
                  Renommer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
