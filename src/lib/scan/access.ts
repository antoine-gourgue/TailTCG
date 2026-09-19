import "server-only";
import { isAdminEmail } from "@/lib/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Scan de carte en bêta : réservé pour l'instant aux comptes admin
 * (ADMIN_EMAILS). Sert de garde côté serveur pour la page /scan, la route de
 * reconnaissance et la création de session de scan ; le bouton « Scanner »
 * n'est affiché qu'aux comptes autorisés.
 */
export async function canScan(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return !!user && isAdminEmail(user.email);
}
