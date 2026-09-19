// Variables d'environnement des scripts : .env.local en local, variables du
// job (secrets GitHub Actions) sinon. Jamais affichées.
import { existsSync, readFileSync } from "node:fs";

const fromFile = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    if (!/^[A-Z_]+=/.test(line)) continue;
    const i = line.indexOf("=");
    fromFile[line.slice(0, i)] = line.slice(i + 1).replace(/^"|"$/g, "");
  }
}

/** Valeur d'une variable (fichier local d'abord, puis process.env), ou null */
export const env = (name) => fromFile[name] ?? process.env[name] ?? null;

/** URL et clé service Supabase, ou null si absentes (le script saute alors ce qui en dépend) */
export function supabaseAdminEnv() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const key = env("SUPABASE_SECRET_KEY");
  return url && key ? { url, key } : null;
}
