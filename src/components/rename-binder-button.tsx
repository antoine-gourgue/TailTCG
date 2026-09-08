"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import { renameBinder } from "@/app/classeurs/actions";
import { Sheet } from "@/components/sheet";

export function RenameBinderButton({
  binderId,
  currentName,
}: {
  binderId: string;
  currentName: string;
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
        title="Renommer"
        aria-label="Renommer le classeur"
        className="btn btn-ghost !px-2.5"
      >
        <Pencil size={15} aria-hidden />
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Renommer le classeur"
        dismissible={!submitting}
      >
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
          <div className="sheet-actions">
            <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
              Annuler
            </button>
            <button type="submit" className="btn btn-primary">
              Renommer
            </button>
          </div>
        </form>
      </Sheet>
    </>
  );
}
