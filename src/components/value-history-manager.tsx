"use client";

import { useState, useTransition } from "react";
import { History, Trash2 } from "lucide-react";
import { deleteValuePoint } from "@/app/items/actions";
import { formatEur } from "@/lib/domain";
import { Sheet } from "@/components/sheet";

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

  function remove(id: string) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("point_id", id);
      await deleteValuePoint(formData);
      setConfirming(null);
    });
  }

  const sorted = [...entries].sort((a, b) => b.recorded_at.localeCompare(a.recorded_at));

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

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Historique des valeurs"
        description="Supprimer un relevé recalcule la valeur actuelle sur le dernier restant."
      >
        <ul className="-mx-2">
          {sorted.map((entry, i) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-raised"
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
                <p className="text-xs text-muted">{fmtDateLong(entry.recorded_at)}</p>
              </div>
              {confirming === entry.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => remove(entry.id)}
                    disabled={pending}
                    className="rounded-lg bg-loss px-2.5 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                  >
                    {pending ? "…" : "Supprimer"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={pending}
                    className="rounded-lg px-2 py-1.5 text-xs text-muted transition hover:text-foreground"
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-faint transition hover:bg-loss/10 hover:text-loss"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
