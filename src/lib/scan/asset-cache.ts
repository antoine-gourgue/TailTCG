/**
 * Téléchargement d'un asset lourd du scan (modèle ONNX, index) gardé dans la
 * Cache API du navigateur : le premier scan télécharge, les suivants lisent
 * en local, quels que soient les en-têtes HTTP du stockage. Utilisable dans
 * les workers comme sur le fil principal.
 */
const CACHE_NAME = "tailtcg-scan-assets-v1";

export async function cachedFetch(url: string): Promise<Response> {
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) return hit;
      const res = await fetch(url);
      if (res.ok) {
        try {
          await cache.put(url, res.clone());
        } catch {
          /* quota : on sert sans mettre en cache */
        }
      }
      return res;
    }
  } catch {
    /* Cache API indisponible (navigation privée…) */
  }
  return fetch(url);
}

export async function cachedArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await cachedFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.arrayBuffer();
}

export async function cachedJson<T>(url: string): Promise<T> {
  const res = await cachedFetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
  return res.json() as Promise<T>;
}
