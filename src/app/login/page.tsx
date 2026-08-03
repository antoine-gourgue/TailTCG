"use client";

import { useActionState } from "react";
import { Logo } from "@/components/logo";
import { sendMagicLink, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    null
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="rise-in w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo variant="lockup" baseline size={64} />
          <p className="mt-4 text-sm text-muted">
            Le classeur est fermé à clé — connexion par lien magique.
          </p>
        </div>

        <form action={formAction} className="panel flex flex-col gap-3 p-5">
          <label htmlFor="email" className="label-xs">
            Adresse email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="ton@email.fr"
            className="field"
          />
          <button type="submit" disabled={pending} className="btn btn-primary mt-1">
            {pending ? "Envoi…" : "Recevoir le lien de connexion"}
          </button>
          {state && (
            <p
              className={`text-center text-sm ${
                state.ok ? "text-gain" : "text-loss"
              }`}
            >
              {state.message}
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
