"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookTabs, Plus, X } from "lucide-react";
import { createBinderAndAdd, setItemBinders } from "@/app/classeurs/actions";
import { Toast } from "@/components/toast";

export type BinderRef = { id: string; name: string };

/**
 * Fiche carte : chips des classeurs de l'exemplaire + modale pour
 * choisir ses appartenances (une carte peut vivre dans plusieurs classeurs).
 */
export function BinderPicker({
  itemId,
  binders,
  memberIds,
}: {
  itemId: string;
  binders: BinderRef[];
  memberIds: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set(memberIds));
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const members = binders.filter((b) => memberIds.includes(b.id));

  function openModal() {
    setChecked(new Set(memberIds));
    setNewName("");
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    let ids = [...checked];
    const name = newName.trim();
    if (name) {
      const created = await createBinderAndAdd(name, []);
      if (created.binderId) ids = [...ids, created.binderId];
    }
    const { error } = await setItemBinders(itemId, ids);
    setSaving(false);
    setOpen(false);
    setToast(error ? "Enregistrement impossible" : "Classeurs mis à jour");
    router.refresh();
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
      {members.map((b) => (
        <Link
          key={b.id}
          href={`/classeurs/${b.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-edge bg-raised px-2.5 py-1 text-xs text-muted transition hover:border-edge-strong hover:text-foreground"
        >
          <NotebookTabs size={12} aria-hidden />
          {b.name}
        </Link>
      ))}
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-edge px-2.5 py-1 text-xs text-faint transition hover:border-edge-strong hover:text-foreground"
      >
        <Plus size={12} aria-hidden />
        Classeur
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !saving && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Choisir les classeurs"
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
            <p className="display mb-1 text-base font-semibold">Classeurs</p>
            <p className="mb-4 text-sm text-muted">
              Cette carte peut vivre dans plusieurs classeurs à la fois.
            </p>

            {binders.length > 0 && (
              <div className="mb-4 flex max-h-56 flex-col gap-1 overflow-y-auto">
                {binders.map((b) => {
                  const on = checked.has(b.id);
                  return (
                    <label
                      key={b.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm transition ${
                        on
                          ? "border-accent/50 bg-accent-soft font-medium text-accent-strong"
                          : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setChecked((prev) => {
                            const next = new Set(prev);
                            if (next.has(b.id)) next.delete(b.id);
                            else next.add(b.id);
                            return next;
                          })
                        }
                        className="accent-[var(--accent)]"
                      />
                      <NotebookTabs size={14} aria-hidden />
                      {b.name}
                    </label>
                  );
                })}
              </div>
            )}

            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              placeholder={
                binders.length === 0
                  ? "Nom du premier classeur…"
                  : "Ou crée un nouveau classeur…"
              }
              className="field text-[13px]"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="btn btn-ghost"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
