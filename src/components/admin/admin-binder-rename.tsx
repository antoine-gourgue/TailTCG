"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminRenameBinder } from "@/app/admin/actions";
import { Toast } from "@/components/toast";

export function AdminBinderRename({
  binderId,
  ownerId,
  initialName,
}: {
  binderId: string;
  ownerId: string;
  initialName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  async function save() {
    setSaving(true);
    const r = await adminRenameBinder(binderId, ownerId, name);
    setSaving(false);
    setToast(r.ok ? { m: "Classeur renommé" } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1">
        <span className="label-xs">Nom du classeur</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="field !w-64 text-[13px]" />
      </label>
      <button type="button" onClick={save} disabled={saving || !name.trim()} className="btn btn-primary">
        {saving ? "…" : "Renommer"}
      </button>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </div>
  );
}
