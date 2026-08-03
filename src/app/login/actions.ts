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

  const allowed = (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  if (!allowed || email !== allowed) {
    return { ok: false, message: "Cette adresse n'est pas autorisée." };
  }
  if (!password) {
    return { ok: false, message: "Entre ton mot de passe." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: "Mot de passe incorrect." };
  }

  redirect("/");
}
