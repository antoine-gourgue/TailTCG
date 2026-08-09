"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Palette, X, Ban } from "lucide-react";
import { BINDER_COLORS } from "@/lib/binder-colors";
import { updateBinderStyle } from "@/app/classeurs/actions";
import { CardImage } from "@/components/card-image";
import { Toast } from "@/components/toast";

export type CoverCandidate = { id: string; card_name: string; image_url: string };

/**
 * Personnalisation du classeur : couleur de tranche et choix des
 * 4 cartes affichées sur la couverture (l'ordre de sélection compte).
 */
export function BinderStyleButton({
  binderId,
  color,
  coverIds,
  items,
}: {
  binderId: string;
  color: string | null;
  coverIds: string[];
  items: CoverCandidate[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selColor, setSelColor] = useState<string | null>(color);
  const [selIds, setSelIds] = useState<string[]>(coverIds);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function openModal() {
    setSelColor(color);
    setSelIds(coverIds);
    setOpen(true);
  }

  function toggleCard(id: string) {
    setSelIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  async function save() {
    setSaving(true);
    const { error } = await updateBinderStyle(binderId, selColor, selIds);
    setSaving(false);
    setOpen(false);
    setToast(
      error
        ? { message: "Enregistrement impossible", tone: "error" }
        : { message: "Classeur personnalisé" }
    );
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Personnaliser"
        aria-label="Personnaliser le classeur"
        className="btn btn-ghost !px-2.5"
      >
        <Palette size={15} aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !saving && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Personnaliser le classeur"
        >
          <div
            className="panel rise-in relative w-full max-w-md p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow-lg transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
            <p className="display mb-4 text-base font-semibold">
              Personnaliser le classeur
            </p>

            <p className="label-xs mb-2">Couleur de la tranche</p>
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelColor(null)}
                title="Neutre"
                aria-label="Tranche neutre"
                aria-pressed={selColor == null}
                className={`flex h-8 w-8 items-center justify-center rounded-full border bg-raised text-muted transition ${
                  selColor == null
                    ? "border-accent ring-2 ring-accent/40"
                    : "border-edge hover:border-edge-strong"
                }`}
              >
                <Ban size={13} aria-hidden />
              </button>
              {BINDER_COLORS.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setSelColor(c.code)}
                  title={c.label}
                  aria-label={`Tranche ${c.label.toLowerCase()}`}
                  aria-pressed={selColor === c.code}
                  className={`h-8 w-8 rounded-full border transition ${
                    selColor === c.code
                      ? "border-foreground ring-2 ring-accent/40"
                      : "border-black/20 hover:scale-110"
                  }`}
                  style={{ backgroundColor: c.hex }}
                />
              ))}
            </div>

            <div className="mb-2 flex items-baseline justify-between">
              <p className="label-xs">Cartes de couverture</p>
              <span className="num text-xs text-faint">{selIds.length}/4</span>
            </div>
            <p className="mb-3 text-xs text-muted">
              L&apos;ordre de sélection définit leur place. Aucune sélection =
              les quatre premières cartes.
            </p>
            <div className="mb-5 grid max-h-64 grid-cols-4 gap-2 overflow-y-auto pr-1">
              {items.map((it) => {
                const pos = selIds.indexOf(it.id);
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggleCard(it.id)}
                    aria-pressed={pos !== -1}
                    title={it.card_name}
                    className="group/cover relative"
                  >
                    <div
                      className={`card-tile aspect-[63/88] transition ${
                        pos !== -1
                          ? "outline outline-2 outline-offset-2 outline-accent"
                          : "opacity-80 group-hover/cover:opacity-100"
                      }`}
                    >
                      <CardImage base={it.image_url || null} alt={it.card_name} />
                    </div>
                    {pos !== -1 && (
                      <span className="num absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink shadow">
                        {pos + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="btn btn-ghost"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
