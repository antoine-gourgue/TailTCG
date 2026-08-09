"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SOURCE_KINDS } from "@/lib/domain";
import { adminUpdateSource } from "@/app/admin/actions";
import { Toast } from "@/components/toast";

export function AdminSourceEdit({
  sourceId,
  ownerId,
  defaults,
}: {
  sourceId: string;
  ownerId: string;
  defaults: { name: string; kind: string; city: string | null; url: string | null };
}) {
  const router = useRouter();
  const [f, setF] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  async function save() {
    setSaving(true);
    const r = await adminUpdateSource(sourceId, ownerId, {
      name: f.name.trim(),
      kind: f.kind,
      city: f.city?.trim() || null,
      url: f.url?.trim() || null,
    });
    setSaving(false);
    setToast(r.ok ? { m: "Source mise à jour" } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  return (
    <div className="panel p-5">
      <p className="label-xs mb-4">Modifier la source (admin)</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="label-xs">Nom</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="field text-[13px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Type</span>
          <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className="field text-[13px]">
            {SOURCE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Ville</span>
          <input value={f.city ?? ""} onChange={(e) => setF({ ...f, city: e.target.value })} className="field text-[13px]" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="label-xs">Site web</span>
          <input value={f.url ?? ""} onChange={(e) => setF({ ...f, url: e.target.value })} className="field text-[13px]" />
        </label>
      </div>
      <div className="mt-4">
        <button type="button" onClick={save} disabled={saving || !f.name.trim()} className="btn btn-primary">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </div>
  );
}
