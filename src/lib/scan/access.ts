import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Scan de carte : ouvert à tout compte connecté. Garde côté serveur pour la
 * page /scan et la route de reconnaissance (le relais QR, lui, passe par le
 * jeton de session).
 */
export async function canScan(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user;
}
