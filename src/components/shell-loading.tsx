"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { PageLoader } from "@/components/page-loader";
import { getShellCache } from "@/lib/shell-store";

/* Pages sans coquille : le loader plein écran reste de mise */
const BARE = ["/login", "/auth", "/reinitialiser", "/v/", "/capture", "/scan", "/extensions/pokedex/impression"];

type Kind = "cards" | "dashboard" | "products" | "detail" | "list";

function kindOf(pathname: string): Kind {
  if (pathname === "/" || /^\/(wishlist|recherche|ajouter|extensions)/.test(pathname)) return "cards";
  if (pathname.startsWith("/collection")) return "dashboard";
  if (pathname.startsWith("/scelles/produit") || pathname.startsWith("/carte/")) return "detail";
  if (pathname.startsWith("/scelles")) return "products";
  return "list";
}

/**
 * État de chargement des pages de l'app : la coquille (sidebar, dock) reste
 * en place et le contenu se dessine en squelette, au lieu d'un logo plein
 * écran qui donne l'impression de recharger l'app à chaque clic.
 */
export function ShellLoading() {
  const pathname = usePathname();
  const bare = BARE.some((p) => pathname.startsWith(p));
  // Tout premier chargement (rien en cache) : le loader d'origine, le temps que la coquille arrive
  if (bare || !getShellCache()) return <PageLoader />;
  return (
    <AppShell skeleton>
      <main className="page py-8" aria-busy="true" aria-label="Chargement">
        <LoadingSkeleton kind={kindOf(pathname)} />
      </main>
    </AppShell>
  );
}

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-raised ${className}`} aria-hidden />;
}

export function LoadingSkeleton({ kind }: { kind: Kind }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <Block className="h-9 w-44" />
        {kind !== "detail" && <Block className="h-9 w-32" />}
      </div>
      {kind === "dashboard" && (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Block key={i} className="h-24" />
            ))}
          </div>
          <Block className="h-72" />
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Block className="h-64" />
            <Block className="h-64" />
          </div>
        </>
      )}
      {kind === "cards" && (
        <>
          <Block className="h-20" />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 10 }, (_, i) => (
              <Block key={i} className="aspect-[63/88]" />
            ))}
          </div>
        </>
      )}
      {kind === "products" && (
        <>
          <Block className="h-16" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <Block key={i} className="aspect-square" />
            ))}
          </div>
        </>
      )}
      {kind === "detail" && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Block className="aspect-[63/88] w-full" />
          <div className="flex flex-col gap-4">
            <Block className="h-10 w-2/3" />
            <Block className="h-24" />
            <Block className="h-40" />
          </div>
        </div>
      )}
      {kind === "list" && (
        <>
          <Block className="h-40" />
          <Block className="h-40" />
          <Block className="h-40" />
        </>
      )}
    </div>
  );
}
