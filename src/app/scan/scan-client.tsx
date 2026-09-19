"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CardScanner } from "@/components/scan/card-scanner";

/** Scan direct sur mobile : la carte reconnue ouvre sa fiche d'ajout */
export function ScanClient() {
  const router = useRouter();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-8 pt-4">
      <div className="mb-3 flex items-center gap-2">
        <Link
          href="/recherche"
          aria-label="Retour"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge text-muted transition hover:text-foreground"
        >
          <ChevronLeft size={16} aria-hidden />
        </Link>
        <div className="min-w-0">
          <p className="display text-lg font-bold leading-tight">Scanner une carte</p>
          <p className="text-xs text-muted">Cadre-la, elle est reconnue toute seule.</p>
        </div>
      </div>
      <CardScanner onConfirm={(c) => router.push(`/ajouter?card=${encodeURIComponent(c.id)}`)} />
    </main>
  );
}
