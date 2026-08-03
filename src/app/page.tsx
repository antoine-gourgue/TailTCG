import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SiteHeader } from "@/components/site-header";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="mb-2 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Collection
        </h1>
        <p className="mb-8 text-sm text-muted">
          La grille de collection arrive en Phase 3. En attendant, la{" "}
          <Link href="/recherche" className="underline hover:text-foreground">
            recherche TCGdex
          </Link>{" "}
          est ouverte.
        </p>
      </main>
    </>
  );
}
