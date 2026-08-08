import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { CustomCardForm } from "@/components/custom-card-form";

export const metadata = {
  title: "Carte hors catalogue — TailTCG",
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
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Carte hors catalogue
        </h1>
        <p className="mb-6 max-w-2xl text-sm text-muted">
          Crée la fiche de la carte (identité + photo), comme si elle sortait
          du catalogue. Tu ajouteras ensuite ton exemplaire — état, prix,
          source — par le formulaire habituel, et tu pourras la posséder en
          plusieurs exemplaires.
        </p>
        <CustomCardForm />
      </main>
    </AppShell>
  );
}
