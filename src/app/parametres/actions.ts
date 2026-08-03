"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Révoque toutes les sessions (tous les appareils), pas seulement celle-ci
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}

export type PasswordState = { ok: boolean; message: string } | null;

// Définit ou change le mot de passe du compte (session active requise) :
// permet ensuite une connexion instantanée sans email, donc sans limite
export async function updatePassword(
  _prev: PasswordState,
  formData: FormData
): Promise<PasswordState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 8) {
    return { ok: false, message: "8 caractères minimum." };
  }
  if (password !== confirm) {
    return { ok: false, message: "Les deux saisies ne correspondent pas." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non connecté." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, message: `Impossible : ${error.message}` };
  }

  return {
    ok: true,
    message: "Mot de passe enregistré — la connexion est maintenant instantanée.",
  };
}
