// Cache mémoire des données de la coquille (sidebar), partagé entre les
// montages pour éviter le clignotement à chaque navigation
export type ShellData = {
  email: string;
  count: number;
  value: number | null;
  displayName: string | null;
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
