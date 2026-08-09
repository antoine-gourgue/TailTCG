"use client";

import { useActionState, useState, useTransition } from "react";
import { Share2, Copy, Check, RefreshCw, EyeOff } from "lucide-react";
import {
  updateShare,
  setShareShowValues,
  type ShareState,
} from "@/app/parametres/actions";

// Gestion du lien public de la collection (jeton secret révocable)
export function SharePanel({
  initialToken,
  initialShowValues = false,
}: {
  initialToken: string | null;
  initialShowValues?: boolean;
}) {
  const [state, formAction, pending] = useActionState<ShareState, FormData>(
    updateShare,
    null
  );
  const [copied, setCopied] = useState(false);
  const [showValues, setShowValues] = useState(initialShowValues);
  const [, startValues] = useTransition();

  const token = state !== null ? state.token : initialToken;
  const url =
    token && typeof window !== "undefined"
      ? `${window.location.origin}/v/${token}`
      : token
        ? `/v/${token}`
        : null;

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  if (!token) {
    return (
      <form action={formAction}>
        <input type="hidden" name="mode" value="enable" />
        <button type="submit" disabled={pending} className="btn btn-primary">
          <Share2 size={15} aria-hidden />
          {pending ? "Activation…" : "Activer le partage"}
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="num min-w-0 flex-1 truncate rounded-xl border border-edge bg-raised px-3 py-2 text-xs">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className={`btn !py-2 text-sm ${copied ? "border border-gain text-gain" : "btn-ghost"}`}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          {copied ? "Copié !" : "Copier"}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="mode" value="rotate" />
          <button type="submit" disabled={pending} className="btn btn-ghost !py-1.5 text-[13px]">
            <RefreshCw size={13} aria-hidden />
            Nouveau lien
          </button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="mode" value="disable" />
          <button type="submit" disabled={pending} className="btn btn-danger !py-1.5 text-[13px]">
            <EyeOff size={13} aria-hidden />
            Couper le partage
          </button>
        </form>
      </div>
      <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-edge px-3 py-2.5">
        <input
          type="checkbox"
          checked={showValues}
          onChange={(e) => {
            const next = e.target.checked;
            setShowValues(next);
            startValues(() => {
              setShareShowValues(next);
            });
          }}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span className="text-sm">
          Inclure les valeurs
          <span className="mt-0.5 block text-xs text-muted">
            Prix payés, plus-values, total investi et boutiques visibles par
            tes visiteurs. Décoché, la vitrine ne montre que tes cartes.
          </span>
        </span>
      </label>
      <p className="text-xs text-faint">
        « Nouveau lien » invalide l&apos;ancien immédiatement ; « Couper » rend
        la collection privée à nouveau.
      </p>
    </div>
  );
}
