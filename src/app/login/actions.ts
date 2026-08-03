"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  ok: boolean;
  message: string;
} | null;

// Connexion instantanée par mot de passe : aucun email, aucune limite
export async function signInWithPassword(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Email et mot de passe requis." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: "Email ou mot de passe incorrect." };
  }

  redirect("/");
}

// Inscription ouverte : le compte est actif immédiatement (emails
// auto-confirmés — le service d'envoi intégré est trop limité pour des
// confirmations), la RLS cloisonne chaque collection par owner_id
export async function signUp(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!email || !password) {
    return { ok: false, message: "Email et mot de passe requis." };
  }
  if (password.length < 8) {
    return { ok: false, message: "8 caractères minimum pour le mot de passe." };
  }
  if (password !== confirm) {
    return { ok: false, message: "Les deux mots de passe ne correspondent pas." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    if (error.code === "user_already_exists" || /already/i.test(error.message)) {
      return { ok: false, message: "Un compte existe déjà avec cette adresse." };
    }
    return { ok: false, message: `Inscription impossible : ${error.message}` };
  }
  if (!data.session) {
    return {
      ok: false,
      message: "Compte créé mais session absente — réessaie de te connecter.",
    };
  }

  redirect("/");
}
