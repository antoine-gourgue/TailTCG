"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    sendMagicLink,
    null
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-2xl font-semibold text-neutral-100">
          Pokédex Collection
        </h1>
        <p className="mb-8 text-center text-sm text-neutral-400">
          Connexion par lien magique
        </p>

        <form action={formAction} className="flex flex-col gap-3">
          <label htmlFor="email" className="sr-only">
            Adresse email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="ton@email.fr"
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-neutral-100 placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-neutral-100 px-4 py-3 font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50"
          >
            {pending ? "Envoi…" : "Recevoir le lien de connexion"}
          </button>
        </form>

        {state && (
          <p
            className={`mt-4 text-center text-sm ${
              state.ok ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {state.message}
          </p>
        )}
      </div>
    </main>
  );
}
