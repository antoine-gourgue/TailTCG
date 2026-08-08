"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";

/**
 * Bouton + modale de confirmation maison (remplace window.confirm).
 * À la confirmation, soumet `action` (server action) avec les champs cachés.
 */
export function ConfirmAction({
  action,
  fields,
  title,
  message,
  confirmLabel = "Supprimer",
  trigger,
  triggerClassName,
  triggerAriaLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  title: string;
  message: string;
  confirmLabel?: string;
  trigger: React.ReactNode;
  triggerClassName?: string;
  triggerAriaLabel?: string;
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
        onClick={() => setOpen(true)}
        className={triggerClassName}
        aria-label={triggerAriaLabel}
      >
        {trigger}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !submitting && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div
            className="panel rise-in w-full max-w-sm p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loss/10 text-loss">
                <TriangleAlert size={17} aria-hidden />
              </span>
              <div>
                <p className="display text-base font-semibold">{title}</p>
                <p className="mt-1 text-sm text-muted">{message}</p>
              </div>
            </div>
            <form
              action={action}
              onSubmit={() => setSubmitting(true)}
              className="flex justify-end gap-2"
            >
              {Object.entries(fields).map(([name, value]) => (
                <input key={name} type="hidden" name={name} value={value} />
              ))}
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="btn btn-ghost"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="btn !bg-loss font-semibold !text-white hover:opacity-90"
              >
                {submitting ? "Suppression…" : confirmLabel}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
