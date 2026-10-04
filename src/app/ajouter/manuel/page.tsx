import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { CustomCardForm } from "@/components/custom-card-form";

export const metadata = {
  title: "Cartes hors catalogue — TailTCG",
};

export default async function AjoutManuelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  return (
    <AppShell>
      <main className="page py-8">
        <PageHead kicker="Explorer" title="Cartes hors catalogue" sub="Promos japonaises, cartes absentes de TCGdex… Une photo, un nom, un set, un numéro — et autant de cartes que tu veux d'un coup.">
          <Link href="/catalogue" className="btn btn-ghost shrink-0">
            <ChevronLeft size={15} aria-hidden />
            Catalogue
          </Link>
        </PageHead>
        <CustomCardForm />
      </main>
    </AppShell>
  );
}
