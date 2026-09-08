"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Barre d'action flottante (mode sélection, ajout en masse…) : posée au-dessus
// du dock mobile, centrée et resserrée dès sm. Même DA que les sheets.
// Rendue dans document.body pour échapper au contexte d'empilement d'une page
// (ex. <main class="relative z-10">) et passer au-dessus du dock.
const noopSubscribe = () => () => {};

export function FloatingBar({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[45] md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2">
      <div className="sheet-in mx-auto flex w-fit max-w-full items-center gap-1.5 rounded-full border border-edge bg-surface/95 p-1.5 pl-2 shadow-[0_10px_30px_rgba(0,0,0,.45)] backdrop-blur-md md:gap-2">
        {children}
      </div>
    </div>,
    document.body
  );
}
