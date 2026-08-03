import { SiteHeader } from "@/components/site-header";
import { SearchClient } from "./search-client";

export const metadata = {
  title: "Recherche — Pokédex Collection",
};

export default function RecherchePage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-6 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Recherche
        </h1>
        <SearchClient />
      </main>
    </>
  );
}
