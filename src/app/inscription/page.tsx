import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthScreen } from "@/app/login/auth-screen";

export const metadata = {
  title: "Inscription — TailTCG",
};

// Inscription ; déjà connecté, on file sur la collection
export default async function SignupPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/collection");
  return <AuthScreen mode="signup" />;
}
