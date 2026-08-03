"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = {
  ok: boolean;
  message: string;
} | null;

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!email) {
    return { ok: false, message: "Entre ton adresse email." };
  }

  const allowed = (process.env.ALLOWED_EMAIL ?? "").trim().toLowerCase();
  if (!allowed || email !== allowed) {
    return { ok: false, message: "Cette adresse n'est pas autorisée." };
  }

  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin") ?? requestHeaders.get("host");
  const baseUrl = origin?.startsWith("http") ? origin : `https://${origin}`;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${baseUrl}/auth/callback`,
    },
  });

  if (error) {
    return { ok: false, message: `Envoi impossible : ${error.message}` };
  }

  return {
    ok: true,
    message: "Lien envoyé — vérifie ta boîte mail (et les spams).",
  };
}
