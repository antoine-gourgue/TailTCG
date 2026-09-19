"use server";

import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export type CaptureSession = { id: string; token: string } | { error: string };

/** Desktop : ouvre une session de capture (jeton à flasher ; 30 min pour scanner une pile de cartes, 10 min pour des photos) */
export async function createCaptureSession(
  kind: "detect" | "photos",
  itemId?: string
): Promise<CaptureSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };
  // Scan de carte en bêta : comptes autorisés seulement (les photos restent ouvertes à tous)
  if (kind === "detect" && !isAdminEmail(user.email)) return { error: "Scan réservé (bêta)" };

  const minutes = kind === "detect" ? 30 : 10;
  const expires_at = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("capture_sessions")
    .insert({ kind, item_id: itemId ?? null, expires_at })
    .select("id, token")
    .single();
  if (error || !data) return { error: error?.message ?? "Impossible" };
  return { id: data.id, token: data.token };
}
