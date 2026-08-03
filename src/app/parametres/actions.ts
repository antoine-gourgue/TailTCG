"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Révoque toutes les sessions (tous les appareils), pas seulement celle-ci
export async function signOutEverywhere() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect("/login");
}
