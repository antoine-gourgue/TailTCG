import Link from "next/link";
import { Layers } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SearchClient } from "./search-client";

export const metadata = {
  title: "Recherche — TailTCG",
};

export default function RecherchePage() {
  return (
    <>
      <AppShell>
      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display text-3xl font-bold tracking-tight">
            Ajouter une carte
          </h1>
          <Link href="/extensions" className="btn btn-ghost">
            <Layers size={15} aria-hidden />
            Parcourir les extensions
          </Link>
        </div>
        <p className="mb-6 text-sm text-muted">
          Cherche une carte par son nom, ou feuillette les extensions
          internationales et japonaises.
        </p>
        <SearchClient />
      </main>
      </AppShell>
    </>
  );
}
