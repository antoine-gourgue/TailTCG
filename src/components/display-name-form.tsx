"use client";

import { useActionState } from "react";
import { setDisplayName, type NameState } from "@/app/parametres/actions";
import { patchShellCache } from "@/lib/shell-store";

// Édition du pseudo public depuis Paramètres
export function DisplayNameForm({ initialName }: { initialName: string | null }) {
  const [state, formAction, pending] = useActionState<NameState, FormData>(
    (prev, fd) =>
      setDisplayName(prev, fd).then((r) => {
        if (r?.ok && r.name) patchShellCache({ displayName: r.name });
        return r;
      }),
    null
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="display_name"
        defaultValue={initialName ?? ""}
        required
        minLength={2}
        maxLength={30}
        placeholder="Ton pseudo…"
        className="field !w-56 text-[13px]"
      />
      <button type="submit" disabled={pending} className="btn btn-ghost">
        {pending ? "…" : "Enregistrer"}
      </button>
      {state && (
        <span className={`text-xs ${state.ok ? "text-gain" : "text-loss"}`}>
          {state.message}
        </span>
      )}
    </form>
  );
}
