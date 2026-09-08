"use client";

import { useActionState } from "react";
import { Logo } from "@/components/logo";
import { resetPasswordWithToken, type LoginState } from "../login/actions";

export function ResetPasswordForm({ tokenHash }: { tokenHash: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(
    resetPasswordWithToken,
    null
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center px-4">
      <div className="rise-in w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo variant="lockup" baseline size={64} />
          <p className="mt-4 text-sm text-muted">
            Choisis un nouveau mot de passe pour ton compte.
          </p>
        </div>

        <div className="panel p-5">
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="token_hash" value={tokenHash} />
            <div>
              <label htmlFor="password" className="label-xs mb-1.5 block">
                Nouveau mot de passe
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                minLength={8}
                autoFocus
                autoComplete="new-password"
                className="field"
              />
            </div>
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

            <button type="submit" disabled={pending} className="btn btn-primary mt-1">
              {pending ? "Enregistrement…" : "Définir le mot de passe"}
            </button>

            {state && !state.ok && (
              <p className="text-center text-sm text-loss">{state.message}</p>
            )}
          </form>
        </div>
      </div>
    </main>
  );
}
