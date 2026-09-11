/**
 * Lit toutes les lignes d'une requête Supabase par pages de 1000 (le plafond
 * PostgREST par requête). Borné par `maxPages` pour rester sûr même avec
 * d'énormes collections. `make(from, to)` doit renvoyer une requête avec ses
 * colonnes, filtres et tri, à laquelle on applique `.range`.
 */
export async function fetchAll<T>(
  make: (from: number, to: number) => PromiseLike<{ data: T[] | null }>,
  { pageSize = 1000, maxPages = 30 }: { pageSize?: number; maxPages?: number } = {}
): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const from = page * pageSize;
    const { data } = await make(from, from + pageSize - 1);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
  }
  return out;
}
