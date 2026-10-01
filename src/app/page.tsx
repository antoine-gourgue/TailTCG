import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Landing } from "@/components/landing";

// Accueil : landing pour les visiteurs ; une fois connecté, la page
// principale est le tableau de bord Collection. Les anciens liens vers la
// liste des cartes (« /?source=… », « /?set=… », « /?select »…) suivent
// vers /cartes avec leurs paramètres.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <Landing />;
  }

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const v of Array.isArray(value) ? value : [value ?? ""]) query.append(key, v);
  }
  redirect(query.size > 0 ? `/cartes?${query}` : "/collection");
}
