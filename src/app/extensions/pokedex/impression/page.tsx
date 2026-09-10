import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPokedex } from "@/lib/pokedex-server";
import { GENERATIONS } from "@/lib/pokedex";
import { PokedexPrint } from "@/components/pokedex-print";

export const metadata = {
  title: "Impression du Pokédex — TailTCG",
};

// Planches à imprimer d'une génération (Cmd+P → PDF ou papier)
export default async function PokedexPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ gen?: string }>;
}) {
  const { gen: genParam } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const gen = GENERATIONS.find((g) => g.gen === Number(genParam))?.gen ?? 1;
  const list = (await loadPokedex(supabase)).filter((p) => p.generation === gen);
  return <PokedexPrint list={list} gen={gen} />;
}
