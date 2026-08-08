"use client";

import { useActionState } from "react";
import { BellRing } from "lucide-react";
import { setRevalueWeeks, type RevalueState } from "@/app/parametres/actions";

export function RevalueForm({ current }: { current: number | null }) {
  const [state, formAction, pending] = useActionState<RevalueState, FormData>(
    setRevalueWeeks,
    null
  );

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <select name="weeks" defaultValue={current ?? ""} className="field !w-auto">
        <option value="">Jamais</option>
        <option value="1">Toutes les semaines</option>
        <option value="2">Toutes les 2 semaines</option>
        <option value="3">Toutes les 3 semaines</option>
        <option value="4">Toutes les 4 semaines</option>
      </select>
      <button type="submit" disabled={pending} className="btn btn-ghost">
        <BellRing size={15} aria-hidden />
        {pending ? "Enregistrement…" : "Enregistrer"}
      </button>
      {state && (
        <p className={`text-sm ${state.ok ? "text-gain" : "text-loss"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
