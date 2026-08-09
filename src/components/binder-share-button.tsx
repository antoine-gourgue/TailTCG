"use client";

import { useEffect, useState } from "react";
import { Share2, Copy, Check, X } from "lucide-react";
import { SharePanel } from "@/components/share-panel";

/**
 * Partage d'un classeur : copie le lien public direct du classeur.
 * Le lien vit sous le jeton de partage de la collection — s'il est
 * coupé, on propose de l'activer ici même.
 */
export function BinderShareButton({
  binderId,
  shareToken,
}: {
  binderId: string;
  shareToken: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const url = shareToken
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/v/${shareToken}/c/${binderId}`
    : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Partager ce classeur"
        aria-label="Partager ce classeur"
        className="btn btn-ghost !px-2.5"
      >
        <Share2 size={15} aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Partager ce classeur"
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
              Partager ce classeur
            </p>

            {url ? (
              <>
                <p className="mb-4 text-sm text-muted">
                  Un lien direct vers ce classeur, en lecture seule. Il vit
                  sous le même jeton que ta collection partagée.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={url}
                    onFocus={(e) => e.currentTarget.select()}
                    className="field flex-1 text-[13px]"
                  />
                  <button type="button" onClick={copy} className="btn btn-primary">
                    {copied ? (
                      <>
                        <Check size={15} aria-hidden /> Copié !
                      </>
                    ) : (
                      <>
                        <Copy size={15} aria-hidden /> Copier
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mb-4 text-sm text-muted">
                  Le partage de ta collection est coupé — active-le pour
                  obtenir le lien de ce classeur.
                </p>
                <SharePanel initialToken={null} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
