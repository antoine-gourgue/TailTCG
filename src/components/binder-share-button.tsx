"use client";

import { useState } from "react";
import { Share2, Copy, Check } from "lucide-react";
import { SharePanel } from "@/components/share-panel";
import { Sheet } from "@/components/sheet";

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

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Partager ce classeur"
        description={
          url
            ? "Un lien direct vers ce classeur, en lecture seule. Il vit sous le même jeton que ta collection partagée."
            : "Le partage de ta collection est coupé — active-le pour obtenir le lien de ce classeur."
        }
      >
        {url ? (
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={url}
              onFocus={(e) => e.currentTarget.select()}
              className="field min-w-0 flex-1 text-[13px]"
            />
            <button type="button" onClick={copy} className="btn btn-primary shrink-0">
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
        ) : (
          <SharePanel initialToken={null} />
        )}
      </Sheet>
    </>
  );
}
