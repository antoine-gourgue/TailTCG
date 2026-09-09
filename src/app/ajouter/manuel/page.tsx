import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CustomCardForm } from "@/components/custom-card-form";

export const metadata = {
  title: "Cartes hors catalogue — TailTCG",
};

export default async function AjoutManuelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">
              Cartes hors catalogue
            </h1>
            <p className="max-w-2xl text-sm text-muted">
              Promos japonaises, cartes absentes de TCGdex… Une photo, un nom,
              un set, un numéro — et autant de cartes que tu veux d&apos;un coup.
            </p>
          </div>
          <Link href="/recherche" className="btn btn-ghost shrink-0">
            <ChevronLeft size={15} aria-hidden />
            Catalogue
          </Link>
        </div>
        <CustomCardForm />
      </main>
    </AppShell>
  );
}
