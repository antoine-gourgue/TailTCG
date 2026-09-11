/**
 * Clés publiques de signature des JWT du projet, mises en cache au niveau du
 * module (une instance serveur les garde une heure) : `getClaims` vérifie
 * alors les sessions sans aucun appel réseau. Si une clé inconnue arrive
 * (rotation), auth-js retombe sur le JWKS du serveur.
 */
type Jwks = { keys: Array<Record<string, unknown> & { kid?: string }> };

const TTL_MS = 3_600_000;
let cached: Jwks | null = null;
let cachedAt = 0;
let inflight: Promise<Jwks | null> | null = null;

export async function getJwks(): Promise<Jwks | null> {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
      if (!r.ok) return cached;
      const j = (await r.json()) as Jwks;
      if (Array.isArray(j.keys) && j.keys.length > 0) {
        cached = j;
        cachedAt = Date.now();
      }
      return cached;
    } catch {
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
