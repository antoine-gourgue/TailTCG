"use client";

import type { ReactNode } from "react";

// Barre d'action flottante (mode sélection, ajout en masse…) : posée au-dessus
// du dock mobile, centrée et resserrée dès sm. Même DA que les sheets.
export function FloatingBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[45] md:inset-x-auto md:bottom-6 md:left-1/2 md:-translate-x-1/2">
      <div className="sheet-in flex items-center gap-1.5 rounded-full border border-edge bg-surface/95 p-1.5 pl-2 shadow-[0_10px_30px_rgba(0,0,0,.45)] backdrop-blur-md md:gap-2">
        {children}
      </div>
    </div>
  );
}
