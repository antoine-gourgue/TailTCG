import { redirect } from "next/navigation";
import { FileJson, FileSpreadsheet, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { signOutEverywhere } from "./actions";

export const metadata = {
  title: "Paramètres — TailTCG",
};

export default async function ParametresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="display mb-6 text-3xl font-bold tracking-tight">
          Paramètres
        </h1>

        <div className="flex flex-col gap-4">
          {/* Compte */}
          <section className="panel p-5">
            <h2 className="display mb-4 text-base font-semibold">Compte</h2>
            <dl className="mb-5 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="label-xs mb-1">Email</dt>
                <dd>{user.email}</dd>
              </div>
              {memberSince && (
                <div>
                  <dt className="label-xs mb-1">Membre depuis</dt>
                  <dd>{memberSince}</dd>
                </div>
              )}
            </dl>
            <form action={signOutEverywhere}>
              <button type="submit" className="btn btn-ghost">
                <ShieldOff size={15} aria-hidden />
                Se déconnecter de tous les appareils
              </button>
            </form>
            <p className="mt-2 text-xs text-faint">
              Révoque toutes les sessions actives (ordinateur, téléphone…). Tu
              devras redemander un lien magique partout.
            </p>
          </section>

          {/* Sauvegardes */}
          <section className="panel p-5">
            <h2 className="display mb-1 text-base font-semibold">Sauvegardes</h2>
            <p className="mb-4 text-sm text-muted">
              Le plan gratuit Supabase ne fait pas de sauvegarde automatique :
              télécharge un export de temps en temps et garde-le au chaud.
            </p>
            <div className="flex flex-wrap gap-2">
              <a href="/api/export/json" download className="btn btn-primary">
                <FileJson size={15} aria-hidden />
                Export complet (JSON)
              </a>
              <a href="/api/export/csv" download className="btn btn-ghost">
                <FileSpreadsheet size={15} aria-hidden />
                Export tableur (CSV)
              </a>
            </div>
            <p className="mt-3 text-xs text-faint">
              Le JSON contient tout (cartes, sources, photos référencées,
              historique des cotes) — c&apos;est lui qui permettrait de tout
              restaurer. Le CSV s&apos;ouvre dans Excel/Numbers pour consulter
              la collection hors ligne.
            </p>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
