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
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Ajouter une carte
        </h1>
        <p className="mb-6 text-sm text-muted">
          Cherche dans le catalogue français TCGdex, clique sur la bonne carte,
          le reste se pré-remplit.
        </p>
        <SearchClient />
      </main>
      </AppShell>
    </>
  );
}
