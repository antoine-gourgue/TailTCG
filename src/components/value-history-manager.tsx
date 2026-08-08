"use client";

import { useEffect, useState, useTransition } from "react";
import { History, Trash2, X } from "lucide-react";
import { deleteValuePoint } from "@/app/items/actions";
import { formatEur } from "@/lib/domain";

export type ValueHistoryEntry = {
  id: string;
  recorded_at: string;
  value: number;
};

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Liste des relevés de valeur avec suppression (confirmation en deux temps)
export function ValueHistoryManager({ entries }: { entries: ValueHistoryEntry[] }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function remove(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("point_id", id);
      await deleteValuePoint(formData);
      setConfirming(null);
    });
  }

  const sorted = [...entries].sort((a, b) =>
    b.recorded_at.localeCompare(a.recorded_at)
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-ghost !py-1.5 text-[13px]"
      >
        <History size={14} aria-hidden />
        Historique
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Historique des valeurs"
        >
          <div
            className="panel rise-in flex max-h-[80vh] w-full max-w-sm flex-col p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <p className="display text-base font-semibold">
                Historique des valeurs
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-raised hover:text-foreground"
              >
                <X size={15} aria-hidden />
              </button>
            </div>
            <p className="mb-4 text-xs text-muted">
              Supprimer un relevé recalcule la valeur actuelle sur le dernier
              restant.
            </p>

            <ul className="-mx-2 flex-1 overflow-y-auto">
              {sorted.map((entry, i) => (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-raised"
                >
                  <div className="min-w-0 flex-1">
                    <p className="num text-sm font-semibold">
                      {formatEur(entry.value)}
                      {i === 0 && (
                        <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-medium text-accent-strong">
                          actuelle
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {fmtDateLong(entry.recorded_at)}
                    </p>
                  </div>
                  {confirming === entry.id ? (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => remove(entry.id)}
                        disabled={pending}
                        className="rounded-lg bg-loss px-2.5 py-1 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      >
                        {pending ? "…" : "Supprimer"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        disabled={pending}
                        className="rounded-lg px-2 py-1 text-xs text-muted transition hover:text-foreground"
                      >
                        Annuler
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(entry.id)}
                      title="Supprimer ce relevé"
                      aria-label="Supprimer ce relevé"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-loss/10 hover:text-loss"
                    >
                      <Trash2 size={13} aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
