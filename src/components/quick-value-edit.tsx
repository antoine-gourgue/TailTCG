"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { updateItemValue } from "@/app/items/actions";
import { formatEur } from "@/lib/domain";

// Actualisation de la valeur estimée en une saisie, depuis la fiche
export function QuickValueEdit({
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

  if (!open) {
    return current != null ? (
      <span className="flex items-center gap-1.5">
        <span className="display num text-xl font-bold leading-none">
          {formatEur(current)}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Actualiser la valeur"
          aria-label="Actualiser la valeur estimée"
          className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition hover:bg-raised hover:text-accent"
        >
          <Pencil size={12} aria-hidden />
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost !px-3 !py-1 text-[13px]"
      >
        Estimer
      </button>
    );
  }

  return (
    <form action={submit} className="flex items-center gap-1.5">
      <input type="hidden" name="item_id" value={itemId} />
      <input
        type="text"
        name="value"
        inputMode="decimal"
        defaultValue={current ?? ""}
        placeholder="90"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="field num !w-24 !py-1 text-sm"
      />
      <button
        type="submit"
        disabled={pending}
        title="Enregistrer"
        aria-label="Enregistrer la valeur"
        className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-accent-ink transition hover:bg-accent-strong disabled:opacity-50"
      >
        <Check size={14} aria-hidden />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        title="Annuler"
        aria-label="Annuler"
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted transition hover:bg-raised hover:text-foreground"
      >
        <X size={14} aria-hidden />
      </button>
      {error && <span className="text-xs text-loss">{error}</span>}
    </form>
  );
}
