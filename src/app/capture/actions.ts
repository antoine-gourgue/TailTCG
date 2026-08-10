"use server";

import { createClient } from "@/lib/supabase/server";

export type CaptureSession = { token: string } | { error: string };

/** Desktop : ouvre une session de capture (jeton à flasher, expire 10 min) */
export async function createCaptureSession(
  kind: "detect" | "photos",
  itemId?: string
): Promise<CaptureSession> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non connecté" };

  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("capture_sessions")
    .insert({ kind, item_id: itemId ?? null, expires_at })
    .select("token")
    .single();
  if (error || !data) return { error: error?.message ?? "Impossible" };
  return { token: data.token };
}
