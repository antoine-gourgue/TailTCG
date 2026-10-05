"use client";

import { useState, useTransition } from "react";
import { PencilLine, RotateCcw } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { formatEur } from "@/lib/domain";
import { setSealedValue } from "../../actions";

/**
 * « Ma valeur » : le prix unitaire que je fixe moi-même pour mes exemplaires
 * de ce produit, à la place de la cote — comme « Actualiser la valeur » sur
 * la fiche d'une carte. La sheet montre ce que ça donne pour toute ma réserve
 * avant d'enregistrer ; « Revenir à la cote » efface la saisie.
 */
export function ValueButton({
  productId,
  owned,
  cote,
  manual,
  className = "btn btn-ghost",
}: {
  productId: number;
  owned: number;
  cote: number | null;
  manual: number | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(manual != null ? String(manual).replace(".", ",") : "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = Number.parseFloat(draft.replace(",", "."));
  const unit = draft.trim() === "" ? cote : Number.isFinite(parsed) && parsed >= 0 ? parsed : null;

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await setSealedValue(null, formData);
      if (res?.ok) setOpen(false);
      else setError(res?.error ?? "Erreur inconnue.");
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <PencilLine size={15} aria-hidden />
        Ma valeur
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!pending}
        title="Ma valeur"
        description={
          cote != null ? (
            <>
              Remplace la cote (<span className="num text-foreground">{formatEur(cote)}</span>) pour {owned > 1 ? `tes ${owned} exemplaires` : "ton exemplaire"}. Laisse vide pour y revenir.
            </>
          ) : (
            <>Ce produit n&apos;a pas de cote : ta valeur sert de référence pour {owned > 1 ? `tes ${owned} exemplaires` : "ton exemplaire"}.</>
          )
        }
      >
        <form action={submit} className="flex flex-col gap-4">
          <input type="hidden" name="product_id" value={productId} />
          <label className="block text-sm">
            <span className="label-xs mb-1.5 block">Valeur unitaire (€)</span>
            <input
              name="value"
              type="text"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={cote != null ? String(cote).replace(".", ",") : "—"}
              className="field num text-lg"
            />
          </label>

          {/* Ce que ça donne pour toute la réserve, avant d'enregistrer */}
          <div className="flex items-baseline justify-between rounded-2xl bg-raised px-4 py-3">
            <span className="text-sm text-muted">{owned > 1 ? `Mes ${owned} exemplaires` : "Mon exemplaire"}</span>
            <span className="num text-base font-bold">{unit != null ? formatEur(unit * owned) : "—"}</span>
          </div>

          {error && <p className="text-sm text-loss">{error}</p>}

          <div className="flex flex-col gap-2 sm:flex-row-reverse sm:justify-start">
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "Enregistrement…" : "Enregistrer"}
            </button>
            {manual != null && (
              <button type="submit" name="clear" value="1" disabled={pending} className="btn btn-ghost">
                <RotateCcw size={14} aria-hidden />
                Revenir à la cote
              </button>
            )}
          </div>
        </form>
      </Sheet>
    </>
  );
}
