import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import type { SourceOption } from "@/app/items/actions";
import { BatchAddClient } from "./batch-client";

export const metadata = {
  title: "Ajouter en lot — TailTCG",
};

// Ajout en lot : la sélection d'un set, carte par carte (prix, valeur, état, quantité)
export default async function BatchAddPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sources } = await supabase.from("sources").select("id, name, kind, city, url").order("name");

  return (
    <AppShell>
      <main className="page py-8">
        <BatchAddClient sources={(sources ?? []) as SourceOption[]} />
      </main>
    </AppShell>
  );
}
