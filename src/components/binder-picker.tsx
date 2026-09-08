"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NotebookTabs, Plus, Check } from "lucide-react";
import { createBinderAndAdd, setItemBinders } from "@/app/classeurs/actions";
import { Toast } from "@/components/toast";
import { Sheet } from "@/components/sheet";

export type BinderRef = { id: string; name: string };

/**
 * Fiche carte : chips des classeurs de l'exemplaire + dialogue pour choisir
 * ses appartenances (une carte peut vivre dans plusieurs classeurs).
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

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!saving}
        title="Classeurs"
        description="Cette carte peut vivre dans plusieurs classeurs à la fois."
      >
        {binders.length > 0 && (
          <div className="mb-3 flex flex-col gap-1">
            {binders.map((b) => {
              const on = checked.has(b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() =>
                    setChecked((prev) => {
                      const next = new Set(prev);
                      if (next.has(b.id)) next.delete(b.id);
                      else next.add(b.id);
                      return next;
                    })
                  }
                  aria-pressed={on}
                  className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] transition active:bg-raised ${
                    on ? "bg-accent-soft font-medium text-accent-strong" : "text-foreground"
                  }`}
                >
                  <NotebookTabs size={18} strokeWidth={1.9} className="shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{b.name}</span>
                  {on && <Check size={16} strokeWidth={2.5} aria-hidden />}
                </button>
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
            binders.length === 0 ? "Nom du premier classeur…" : "Ou crée un nouveau classeur…"
          }
          className="field text-[13px]"
        />

        <div className="sheet-actions">
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={saving}
            className="btn btn-ghost"
          >
            Annuler
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </Sheet>

      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
