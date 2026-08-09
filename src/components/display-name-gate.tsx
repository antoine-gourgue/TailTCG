"use client";

import { useActionState, useEffect } from "react";
import { setDisplayName, type NameState } from "@/app/parametres/actions";
import { patchShellCache } from "@/lib/shell-store";
import { Logo } from "@/components/logo";

/**
 * Modale bloquante : un compte connecté sans pseudo ne peut rien faire
 * tant qu'il n'en a pas choisi un. Pas de croix, pas d'échappatoire.
 */
export function DisplayNameGate() {
  const [state, formAction, pending] = useActionState<NameState, FormData>(
    setDisplayName,
    null
  );

  useEffect(() => {
    if (state?.ok && state.name) {
      patchShellCache({ displayName: state.name });
    }
  }, [state]);

  if (state?.ok) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Choisis ton pseudo"
    >
      <div className="panel rise-in w-full max-w-sm p-6 text-center">
        <div className="mb-4 flex justify-center">
          <Logo variant="mark" size={44} />
        </div>
        <p className="display text-xl font-bold">Choisis ton pseudo</p>
        <p className="mx-auto mt-2 max-w-xs text-sm text-muted">
          C&apos;est le nom qui apparaîtra sur ta collection partagée.
          Il te le faut pour continuer.
        </p>
        <form action={formAction} className="mt-5">
          <input
            type="text"
            name="display_name"
            required
            autoFocus
            minLength={2}
            maxLength={30}
            placeholder="Ton pseudo…"
            className="field text-center"
          />
          {state && !state.ok && (
            <p className="mt-2 text-xs text-loss">{state.message}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="btn btn-primary mt-4 w-full justify-center"
          >
            {pending ? "Enregistrement…" : "C'est parti"}
          </button>
        </form>
      </div>
    </div>
  );
}
