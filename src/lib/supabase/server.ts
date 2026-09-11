import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getJwks } from "@/lib/supabase/jwks";

/**
 * Id de l'utilisateur connecté, vérifié localement (signature du JWT avec
 * les clés asymétriques du projet) : pas d'aller-retour vers l'API Auth à
 * chaque action serveur. Null si aucune session valide.
 */
export async function currentUserId(): Promise<string | null> {
  const [supabase, jwks] = await Promise.all([createClient(), getJwks()]);
  const { data, error } = await supabase.auth.getClaims(undefined, jwks ? { jwks: jwks as JwksOption } : undefined);
  const sub = data?.claims?.sub;
  if (typeof sub === "string" && sub.length > 0) return sub;
  if (!error) return null;
  // Vérification locale impossible (clé inconnue, jeton ancien) : l'API Auth tranche
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type JwksOption = NonNullable<
  NonNullable<Parameters<Awaited<ReturnType<typeof createClient>>["auth"]["getClaims"]>[1]>["jwks"]
>;

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      // Session en cookie httpOnly : inaccessible à document.cookie, donc
      // au vol par un éventuel XSS (audit)
      cookieOptions: { httpOnly: true, secure: true, sameSite: "lax" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Appelé depuis un Server Component : les cookies sont posés
            // par le middleware, on peut ignorer l'écriture ici.
          }
        },
      },
    }
  );
}
