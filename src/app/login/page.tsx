"use client";

import { useActionState, useState } from "react";
import { Logo } from "@/components/logo";
import { signInWithPassword, signUp, type LoginState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [loginState, loginAction, loginPending] = useActionState<
    LoginState,
    FormData
  >(signInWithPassword, null);
  const [signupState, signupAction, signupPending] = useActionState<
    LoginState,
    FormData
  >(signUp, null);

  const state = mode === "login" ? loginState : signupState;
  const pending = loginPending || signupPending;

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="rise-in w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo variant="lockup" baseline size={64} />
          <p className="mt-4 text-sm text-muted">
            Ta collection de cartes, organisée et valorisée.
          </p>
        </div>

        <div className="panel p-5">
          {/* Onglets connexion / inscription */}
          <div className="mb-4 flex overflow-hidden rounded-xl border border-edge">
            {(
              [
                ["login", "Connexion"],
                ["signup", "Inscription"],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm transition ${
                  mode === m
                    ? "bg-accent-soft font-semibold text-accent-strong"
                    : "text-muted hover:text-foreground"
                } ${m === "signup" ? "border-l border-edge" : ""}`}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            action={mode === "login" ? loginAction : signupAction}
            className="flex flex-col gap-3"
          >
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
                minLength={mode === "signup" ? 8 : undefined}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                className="field"
              />
            </div>
            {mode === "signup" && (
              <div>
                <label htmlFor="confirm" className="label-xs mb-1.5 block">
                  Confirme le mot de passe
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className="field"
                />
              </div>
            )}

            <button type="submit" disabled={pending} className="btn btn-primary mt-1">
              {pending
                ? mode === "login"
                  ? "Connexion…"
                  : "Création…"
                : mode === "login"
                  ? "Se connecter"
                  : "Créer mon compte"}
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
      </div>
    </main>
  );
}
