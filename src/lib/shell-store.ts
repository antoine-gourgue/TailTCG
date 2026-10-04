// Cache mémoire des données de la coquille (sidebar, dock mobile), partagé
// entre les montages pour éviter le clignotement à chaque navigation
export type ShellData = {
  email: string;
  /** cartes actives (quantités) */
  count: number;
  /** valeur estimée des cartes (prix saisis), null si aucune */
  value: number | null;
  /** prix d'achat cumulé des cartes */
  invested: number;
  /** plus-value latente des cartes (valeur − investi), null sans valeur */
  gain: number | null;
  sealedCount: number;
  binders: number;
  wishes: number;
  graded: number;
  displayName: string | null;
  isAdmin: boolean;
};

let cache: ShellData | null = null;

export function getShellCache(): ShellData | null {
  return cache;
}

export function setShellCache(d: ShellData) {
  cache = d;
}

export function patchShellCache(p: Partial<ShellData>) {
  if (cache) cache = { ...cache, ...p };
}
