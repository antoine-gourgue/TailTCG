import { redirect } from "next/navigation";
import {
  FileJson,
  FileSpreadsheet,
  ShieldOff,
  Share,
  SquarePlus,
  EllipsisVertical,
  Smartphone,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { SetPasswordForm } from "@/components/set-password-form";
import { RevalueForm } from "@/components/revalue-form";
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

  const { data: settings } = await supabase
    .from("user_settings")
    .select("revalue_weeks")
    .eq("owner_id", user.id)
    .maybeSingle();

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

          {/* Connexion */}
          <section className="panel p-5">
            <h2 className="display mb-1 text-base font-semibold">
              Mot de passe
            </h2>
            <p className="mb-4 text-sm text-muted">
              Définis un mot de passe pour te connecter instantanément, sans
              email ni limite d&apos;envois. Le lien magique reste disponible en
              secours.
            </p>
            <SetPasswordForm />
          </section>

          {/* Rappel de réévaluation */}
          <section className="panel p-5">
            <h2 className="display mb-1 text-base font-semibold">
              Rappel d&apos;actualisation des valeurs
            </h2>
            <p className="mb-4 text-sm text-muted">
              Une notification apparaît sur ta collection quand la valeur
              estimée d&apos;une carte n&apos;a pas été actualisée depuis la
              période choisie — chaque saisie est datée et trace la courbe de
              la carte.
            </p>
            <RevalueForm current={settings?.revalue_weeks ?? null} />
          </section>

          {/* Installer l'app */}
          <section className="panel p-5">
            <h2 className="display mb-1 flex items-center gap-2 text-base font-semibold">
              <Smartphone size={16} aria-hidden />
              Installer sur ton téléphone
            </h2>
            <p className="mb-4 text-sm text-muted">
              TailTCG s&apos;installe comme une vraie app, avec son icône sur
              l&apos;écran d&apos;accueil — pratique pour photographier tes
              cartes.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-edge p-4">
                <p className="label-xs mb-2.5">iPhone / iPad (Safari)</p>
                <ol className="flex flex-col gap-2 text-sm text-muted">
                  <li className="flex items-center gap-2">
                    <span className="num shrink-0 font-semibold text-foreground">1.</span>
                    Ouvre tailtcg.vercel.app dans Safari
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="num shrink-0 font-semibold text-foreground">2.</span>
                    Touche <Share size={14} className="inline shrink-0" aria-label="Partager" />{" "}
                    (Partager) en bas de l&apos;écran
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="num shrink-0 font-semibold text-foreground">3.</span>
                    Choisis{" "}
                    <span className="inline-flex items-center gap-1 text-foreground">
                      <SquarePlus size={14} aria-hidden /> « Sur l&apos;écran d&apos;accueil »
                    </span>
                  </li>
                </ol>
              </div>
              <div className="rounded-xl border border-edge p-4">
                <p className="label-xs mb-2.5">Android (Chrome)</p>
                <ol className="flex flex-col gap-2 text-sm text-muted">
                  <li className="flex items-center gap-2">
                    <span className="num shrink-0 font-semibold text-foreground">1.</span>
                    Ouvre tailtcg.vercel.app dans Chrome
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="num shrink-0 font-semibold text-foreground">2.</span>
                    Touche le menu{" "}
                    <EllipsisVertical size={14} className="inline shrink-0" aria-label="Menu" /> en
                    haut à droite
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="num shrink-0 font-semibold text-foreground">3.</span>
                    Choisis « Ajouter à l&apos;écran d&apos;accueil »
                  </li>
                </ol>
              </div>
            </div>
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
