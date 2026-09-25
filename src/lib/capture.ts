import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type CaptureRow = {
  id: string;
  owner_id: string;
  kind: "detect" | "photos" | "grade";
  item_id: string | null;
  status: "pending" | "done" | "cancelled";
  result: unknown;
  expires_at: string;
};

/** Une session dont la date d'expiration est passée */
export function isCaptureExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() < Date.now();
}

/** Charge une session par jeton si valide et non expirée (côté serveur) */
export async function loadCaptureByToken(
  token: string
): Promise<CaptureRow | null> {
  if (!UUID_RE.test(token)) return null;
  const db = createAdminClient();
  const { data } = await db
    .from("capture_sessions")
    .select("id, owner_id, kind, item_id, status, result, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!data) return null;
  if (isCaptureExpired(data.expires_at)) return null;
  return data as CaptureRow;
}
