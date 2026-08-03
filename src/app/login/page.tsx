"use client";

import { useActionState } from "react";
import { Logo } from "@/components/logo";
import { signInWithPassword, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    signInWithPassword,
    null
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="rise-in w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo variant="lockup" baseline size={64} />
          <p className="mt-4 text-sm text-muted">Le classeur est fermé à clé.</p>
        </div>

        <form action={formAction} className="panel flex flex-col gap-3 p-5">
          <div>
            <label htmlFor="email" className="label-xs mb-1.5 block">
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
          </div>
          <div>
            <label htmlFor="password" className="label-xs mb-1.5 block">
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              className="field"
            />
          </div>
          <button type="submit" disabled={pending} className="btn btn-primary mt-1">
            {pending ? "Connexion…" : "Se connecter"}
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
