"use client";

import { useState } from "react";
import { Share2 } from "lucide-react";
import { SharePanel } from "@/components/share-panel";
import { Sheet } from "@/components/sheet";

// Bouton Partager de la page Collection : ouvre le panneau de partage
export function ShareButton({
  initialToken,
  initialShowValues = false,
}: {
  initialToken: string | null;
  initialShowValues?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        <Share2 size={15} aria-hidden />
        Partager
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Partager ma collection"
        description="Un lien secret en lecture seule — toute ta collection visible sans compte. Révocable à tout moment."
      >
        <SharePanel initialToken={initialToken} initialShowValues={initialShowValues} />
      </Sheet>
    </>
  );
}
