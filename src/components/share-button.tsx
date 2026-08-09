"use client";

import { useEffect, useState } from "react";
import { Share2, X } from "lucide-react";
import { SharePanel } from "@/components/share-panel";

// Bouton Partager de la page Collection : ouvre le panneau de partage
export function ShareButton({ initialToken }: { initialToken: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        <Share2 size={15} aria-hidden />
        Partager
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Partager ma collection"
        >
          <div
            className="panel rise-in relative w-full max-w-md p-5"
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
            <p className="display mb-1 text-base font-semibold">
              Partager ma collection
            </p>
            <p className="mb-4 text-sm text-muted">
              Un lien secret en lecture seule — toute ta collection visible
              sans compte. Révocable à tout moment.
            </p>
            <SharePanel initialToken={initialToken} />
          </div>
        </div>
      )}
    </>
  );
}
