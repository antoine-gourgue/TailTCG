"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CONDITIONS, CARD_TYPES, LANGUAGES } from "@/lib/domain";
import { adminUpdateItem } from "@/app/admin/actions";
import { Toast } from "@/components/toast";

type SourceOpt = { id: string; name: string };

export function AdminItemEdit({
  itemId,
  ownerId,
  sources,
  defaults,
}: {
  itemId: string;
  ownerId: string;
  sources: SourceOpt[];
  defaults: {
    condition: string;
    quantity: number;
    purchase_price: number | null;
    manual_price: number | null;
    language: string;
    card_type: string | null;
    graded: boolean;
    grade: string | null;
    source_id: string | null;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [f, setF] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  async function save() {
    setSaving(true);
    const r = await adminUpdateItem(itemId, ownerId, {
      condition: f.condition,
      quantity: Math.max(1, Number(f.quantity) || 1),
      purchase_price: f.purchase_price,
      manual_price: f.manual_price,
      language: f.language,
      card_type: f.card_type,
      graded: f.graded,
      grade: f.graded ? f.grade : null,
      source_id: f.source_id,
      notes: f.notes,
    });
    setSaving(false);
    setToast(r.ok ? { m: "Carte mise à jour" } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

  return (
    <div className="panel p-5">
      <p className="label-xs mb-4">Modifier (admin)</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="label-xs">État</span>
          <select value={f.condition} onChange={(e) => setF({ ...f, condition: e.target.value })} className="field text-[13px]">
            {CONDITIONS.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Langue</span>
          <select value={f.language} onChange={(e) => setF({ ...f, language: e.target.value })} className="field text-[13px]">
            {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Type</span>
          <select value={f.card_type ?? ""} onChange={(e) => setF({ ...f, card_type: e.target.value || null })} className="field text-[13px]">
            <option value="">—</option>
            {CARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Quantité</span>
          <input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} className="field text-[13px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Payé (€)</span>
          <input type="text" defaultValue={f.purchase_price ?? ""} onChange={(e) => setF({ ...f, purchase_price: num(e.target.value) })} className="field text-[13px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Estimé (€)</span>
          <input type="text" defaultValue={f.manual_price ?? ""} onChange={(e) => setF({ ...f, manual_price: num(e.target.value) })} className="field text-[13px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Source</span>
          <select value={f.source_id ?? ""} onChange={(e) => setF({ ...f, source_id: e.target.value || null })} className="field text-[13px]">
            <option value="">—</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 pt-5">
          <input type="checkbox" checked={f.graded} onChange={(e) => setF({ ...f, graded: e.target.checked })} className="accent-[var(--accent)]" />
          <span className="text-sm">Gradée</span>
        </label>
        {f.graded && (
          <label className="flex flex-col gap-1">
            <span className="label-xs">Note</span>
            <input type="text" defaultValue={f.grade ?? ""} onChange={(e) => setF({ ...f, grade: e.target.value || null })} placeholder="PSA 9…" className="field text-[13px]" />
          </label>
        )}
      </div>
      <label className="mt-4 flex flex-col gap-1">
        <span className="label-xs">Notes</span>
        <textarea defaultValue={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value || null })} rows={2} className="field text-[13px]" />
      </label>
      <div className="mt-4">
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </div>
  );
}
