"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Trash2 } from "lucide-react";
import { adminRunCron, adminPurgeTrash } from "@/app/admin/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";

export function SystemActions({ trashCount }: { trashCount: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  async function runCron() {
    setBusy("cron");
    const r = await adminRunCron();
    setBusy(null);
    setToast(r.ok ? { m: `Cron lancé — ${r.summary}` } : { m: r.message, t: "error" });
    if (r.ok) router.refresh();
  }

  return (
    <section className="panel p-5">
      <p className="label-xs mb-3">Actions système</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy != null}
          onClick={runCron}
          className="btn btn-ghost"
        >
          <RefreshCw size={15} aria-hidden />
          {busy === "cron" ? "Cron en cours…" : "Lancer le cron des cotes"}
        </button>

        <ConfirmAction
          action={async () => {
            const r = await adminPurgeTrash();
            setToast(
              r.ok
                ? { m: `${r.count} carte(s) définitivement supprimée(s)` }
                : { m: r.message, t: "error" }
            );
            if (r.ok) router.refresh();
          }}
          fields={{}}
          title="Vider la corbeille globale ?"
          message={`${trashCount} carte(s) en corbeille (tous comptes) seront définitivement effacées, avec leurs photos et historiques.`}
          confirmLabel="Vider la corbeille"
          trigger={
            <>
              <Trash2 size={15} aria-hidden />
              Vider la corbeille ({trashCount})
            </>
          }
          triggerClassName="btn btn-ghost !text-loss"
        />
      </div>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </section>
  );
}
