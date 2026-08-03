"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { updatePassword, type PasswordState } from "@/app/parametres/actions";

export function SetPasswordForm() {
  const [state, formAction, pending] = useActionState<PasswordState, FormData>(
    updatePassword,
    null
  );

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="password" className="label-xs mb-1.5 block">
            Nouveau mot de passe
          </label>
          <input
            id="password"
            type="password"
            name="password"
            minLength={8}
            required
            autoComplete="new-password"
            className="field"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="label-xs mb-1.5 block">
            Confirmation
          </label>
          <input
            id="confirm"
            type="password"
            name="confirm"
            minLength={8}
            required
            autoComplete="new-password"
            className="field"
          />
        </div>
      </div>
      {state && (
        <p className={`text-sm ${state.ok ? "text-gain" : "text-loss"}`}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        <KeyRound size={15} aria-hidden />
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </button>
    </form>
  );
}
