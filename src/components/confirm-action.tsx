"use client";

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Sheet } from "@/components/sheet";

/**
 * Bouton + dialogue de confirmation maison (remplace window.confirm).
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

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setSubmitting(false);
          setOpen(true);
        }}
        className={triggerClassName}
        aria-label={triggerAriaLabel}
      >
        {trigger}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        label={title}
        dismissible={!submitting}
        header={
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-loss/10 text-loss">
              <TriangleAlert size={17} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="display text-base font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{message}</p>
            </div>
          </div>
        }
      >
        <form action={action} onSubmit={() => setSubmitting(true)} className="sheet-actions !mt-2">
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
          <button type="submit" disabled={submitting} className="btn btn-danger">
            {submitting ? "Suppression…" : confirmLabel}
          </button>
        </form>
      </Sheet>
    </>
  );
}
