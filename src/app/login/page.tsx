"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    null
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="rise-in w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-2xl text-accent-ink shadow-lg">
            ◓
          </span>
          <h1 className="display text-3xl font-bold tracking-tight">
            Pokédex Collection
          </h1>
          <p className="mt-2 text-sm text-muted">
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
