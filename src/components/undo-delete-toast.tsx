"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Undo2 } from "lucide-react";
import { restoreItem } from "@/app/items/actions";

/**
 * Après une suppression : pilule « Annuler » pendant 10 secondes.
 * L'exemplaire reste dans la corbeille (Paramètres) pendant 30 jours.
 */
export function UndoDeleteToast({ itemId }: { itemId: string }) {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      router.replace("/", { scroll: false });
    }, 10000);
    return () => clearTimeout(t);
  }, [router]);

  if (!visible) return null;

  async function undo() {
    setBusy(true);
    const fd = new FormData();
    fd.set("item_id", itemId);
    await restoreItem(fd);
    setVisible(false);
    router.replace("/", { scroll: false });
    router.refresh();
  }

  return (
    <div
      role="status"
      className="rise-in fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full border border-edge bg-raised py-2 pl-4 pr-2 text-sm shadow-lg md:bottom-6"
    >
      <Trash2 size={15} className="shrink-0 text-muted" aria-hidden />
      Exemplaire mis à la corbeille.
      <button
        type="button"
        onClick={undo}
        disabled={busy}
        className="btn btn-ghost !py-1.5 text-[13px]"
      >
        <Undo2 size={14} aria-hidden />
        {busy ? "…" : "Annuler"}
      </button>
    </div>
  );
}
