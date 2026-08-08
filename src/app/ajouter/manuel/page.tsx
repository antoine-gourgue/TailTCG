import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ItemForm } from "@/components/item-form";
import type { SourceOption } from "@/app/items/actions";

export const metadata = {
  title: "Ajout manuel — TailTCG",
};

export default async function AjoutManuelPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sources } = await supabase
    .from("sources")
    .select("id, name, kind, city, url")
    .order("name");

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Ajout manuel
        </h1>
        <p className="mb-6 max-w-2xl text-sm text-muted">
          Pour les cartes absentes du catalogue TCGdex — promos japonaises,
          raretés… Saisis son identité toi-même, et tes photos feront le
          visuel dans la collection.
        </p>
        <ItemForm
          mode="create"
          cardFields={{ card_name: "", set_name: "", local_id: "" }}
          defaults={{
            card_type: null,
            language: "JP",
            condition: null,
            quantity: 1,
            purchase_price: null,
            manual_price: null,
            purchase_date: null,
            source_id: null,
            cardmarket_url: null,
            graded: false,
            grade: null,
            notes: null,
          }}
          sources={(sources ?? []) as SourceOption[]}
        />
      </main>
    </AppShell>
  );
}
