"use client";

import Link from "next/link";
import { ChevronLeft, Printer } from "lucide-react";

/** Barre d'impression (masquée à l'impression) : retour + lancer l'impression */
export function PrintToolbar({ back, title, hint }: { back: string; title: string; hint: string }) {
  return (
    <div className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-between gap-3 border-b border-edge bg-surface/95 px-4 py-3 backdrop-blur">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href={back}
          aria-label="Retour"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="display truncate text-base font-semibold">{title}</p>
          <p className="truncate text-xs text-muted">{hint}</p>
        </div>
      </div>
      <button type="button" onClick={() => window.print()} className="btn btn-primary">
        <Printer size={15} aria-hidden />
        Imprimer ou enregistrer en PDF
      </button>
    </div>
  );
}
