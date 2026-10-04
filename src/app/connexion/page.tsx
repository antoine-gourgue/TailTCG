import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthScreen } from "./auth-screen";

export const metadata = {
  title: "Connexion — TailTCG",
};

const NOTICES: Record<string, string> = {
  "lien-invalide": "Ce lien n'est plus valide. Connecte-toi, ou demande un nouveau lien.",
};

// Connexion ; déjà connecté, on file sur la collection
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/collection");
  const { error } = await searchParams;
  return <AuthScreen mode="login" notice={error ? (NOTICES[error] ?? null) : null} />;
}
