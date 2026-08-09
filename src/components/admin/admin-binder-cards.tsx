"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Plus, SearchIcon, Check } from "lucide-react";
import { adminAddToBinder, adminRemoveFromBinder } from "@/app/admin/actions";
import { CardImage } from "@/components/card-image";
import { Toast } from "@/components/toast";

export type BinderCard = {
  id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string;
};

export function AdminBinderCards({
  binderId,
  ownerId,
  members,
  candidates,
}: {
  binderId: string;
  ownerId: string;
  members: BinderCard[];
  candidates: BinderCard[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    return candidates.filter(
      (c) => !n || `${c.card_name} ${c.set_name} ${c.local_id}`.toLowerCase().includes(n)
    );
  }, [candidates, q]);

  async function remove(itemId: string) {
    setBusy(true);
    const r = await adminRemoveFromBinder(binderId, itemId, ownerId);
    setBusy(false);
    setToast(r.ok ? { m: "Carte retirée" } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  async function addSelected() {
    setBusy(true);
    const r = await adminAddToBinder(binderId, [...sel], ownerId);
    setBusy(false);
    setToast(r.ok ? { m: `${sel.size} carte(s) ajoutée(s)` } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) {
      setSel(new Set());
      setPickerOpen(false);
      router.refresh();
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted">{members.length} carte(s)</p>
        <button type="button" onClick={() => setPickerOpen(true)} className="btn btn-primary">
          <Plus size={15} aria-hidden />
          Ajouter des cartes
        </button>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-muted">Classeur vide.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {members.map((i) => (
            <li key={i.id} className="group relative">
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(i.id)}
                aria-label="Retirer du classeur"
                className="absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border border-edge bg-raised text-muted opacity-0 shadow transition hover:text-loss group-hover:opacity-100"
              >
                <X size={14} aria-hidden />
              </button>
              <Link href={`/admin/utilisateurs/${ownerId}/carte/${i.id}`} className="block">
                <div className="card-tile aspect-[63/88]">
                  <CardImage base={i.image_url || null} alt={i.card_name} />
                </div>
                <p className="mt-2 truncate text-sm font-medium">{i.card_name}</p>
                <p className="truncate text-xs text-muted">
                  {i.set_name} <span className="num text-faint">· {i.local_id}</span>
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !busy && setPickerOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="panel rise-in relative flex max-h-[85vh] w-full max-w-lg flex-col p-5" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              aria-label="Fermer"
              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow-lg transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
            <p className="display mb-3 text-base font-semibold">Ajouter des cartes</p>
            <div className="mb-3 flex items-center gap-2 rounded-xl border border-edge bg-raised px-3 py-2 text-sm">
              <SearchIcon size={14} className="text-faint" aria-hidden />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher…" className="w-full bg-transparent outline-none placeholder:text-faint" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted">Aucune carte disponible.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {filtered.map((c) => {
                    const on = sel.has(c.id);
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setSel((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
                              return next;
                            })
                          }
                          className={`flex w-full items-center gap-3 rounded-lg border px-2 py-1.5 text-left text-sm transition ${
                            on ? "border-accent/50 bg-accent-soft" : "border-edge hover:border-edge-strong"
                          }`}
                        >
                          <span className="h-12 w-9 shrink-0 overflow-hidden rounded">
                            <CardImage base={c.image_url || null} alt={c.card_name} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{c.card_name}</span>
                            <span className="block text-xs text-muted">{c.set_name} · {c.local_id}</span>
                          </span>
                          {on && <Check size={16} className="shrink-0 text-accent-strong" aria-hidden />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setPickerOpen(false)} className="btn btn-ghost">Annuler</button>
              <button type="button" disabled={busy || sel.size === 0} onClick={addSelected} className="btn btn-primary disabled:opacity-50">
                {busy ? "…" : `Ajouter (${sel.size})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </div>
  );
}
