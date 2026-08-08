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

export type RevalueState = { ok: boolean; message: string } | null;

// Fréquence du rappel d'actualisation des valeurs estimées (null = jamais)
export async function setRevalueWeeks(
  _prev: RevalueState,
  formData: FormData
): Promise<RevalueState> {
  const raw = String(formData.get("weeks") ?? "").trim();
  const weeks = raw === "" ? null : Number.parseInt(raw, 10);
  if (weeks !== null && ![1, 2, 3, 4].includes(weeks)) {
    return { ok: false, message: "Fréquence invalide." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Non connecté." };

  const { error } = await supabase.from("user_settings").upsert(
    {
      owner_id: user.id,
      revalue_weeks: weeks,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner_id" }
  );
  if (error) return { ok: false, message: `Impossible : ${error.message}` };

  return {
    ok: true,
    message:
      weeks === null
        ? "Rappel désactivé."
        : `Rappel réglé : toutes les ${weeks} semaine${weeks > 1 ? "s" : ""}.`,
  };
}

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
