"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X, NotebookTabs, Search, ChevronLeft, Book } from "lucide-react";
import { createBinder, createBinderFromSet } from "@/app/classeurs/actions";
import { CardImage } from "@/components/card-image";

export type BinderSet = {
  id: string;
  name: string;
  serie: string;
  logo: string | null;
};

/**
 * Assistant de création d'un classeur : étape 1 = vide (nom) ou à partir d'un
 * set ; puis le classeur est créé et on arrive dans l'éditeur pour choisir le
 * design (couverture, pages, anneaux).
 */
export function NewBinderButton({
  label = "Nouveau classeur",
  sets = [],
}: {
  label?: string;
  sets?: BinderSet[];
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"choose" | "empty" | "set">("choose");
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function reset() {
    setStep("choose");
    setName("");
    setQ("");
  }
  function close() {
    setOpen(false);
    reset();
  }

  function createEmpty() {
    const n = name.trim();
    if (!n || pending) return;
    start(async () => {
      const fd = new FormData();
      fd.set("name", n);
      await createBinder(fd); // redirige vers l'éditeur
    });
  }
  function createFromSet(set: BinderSet) {
    if (pending) return;
    start(async () => {
      await createBinderFromSet(set.id, "fr"); // redirige vers l'éditeur
    });
  }

  const needle = q
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const results = needle
    ? sets
        .filter((s) =>
          `${s.name} ${s.serie} ${s.id}`
            .toLowerCase()
            .normalize("NFD")
            .replace(/\p{Diacritic}/gu, "")
            .includes(needle)
        )
        .slice(0, 40)
    : sets.slice(0, 40);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        <Plus size={15} aria-hidden />
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !pending && close()}
          role="dialog"
          aria-modal="true"
          aria-label="Nouveau classeur"
        >
          <div
            className="panel rise-in relative flex max-h-[85vh] w-full max-w-md flex-col p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow-lg transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>

            {step !== "choose" && (
              <button
                type="button"
                onClick={reset}
                className="mb-2 inline-flex items-center gap-1 self-start text-sm text-muted transition hover:text-foreground"
              >
                <ChevronLeft size={14} aria-hidden />
                Retour
              </button>
            )}

            {step === "choose" && (
              <>
                <p className="display mb-1 text-base font-semibold">Nouveau classeur</p>
                <p className="mb-4 text-sm text-muted">
                  Ensuite, tu choisiras son design dans l&apos;éditeur.
                </p>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => setStep("empty")}
                    className="flex items-center gap-3 rounded-xl border border-edge px-4 py-3 text-left transition hover:border-edge-strong"
                  >
                    <Book size={18} className="shrink-0 text-muted" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">Classeur vide</span>
                      <span className="block text-xs text-muted">
                        Une sous-collection à remplir toi-même
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep("set")}
                    className="flex items-center gap-3 rounded-xl border border-edge px-4 py-3 text-left transition hover:border-edge-strong"
                  >
                    <NotebookTabs size={18} className="shrink-0 text-muted" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium">À partir d&apos;un set</span>
                      <span className="block text-xs text-muted">
                        Tout le set, tes cartes remplies, les manquantes en attente
                      </span>
                    </span>
                  </button>
                </div>
              </>
            )}

            {step === "empty" && (
              <>
                <p className="display mb-1 text-base font-semibold">Classeur vide</p>
                <p className="mb-4 text-sm text-muted">
                  Toutes tes Pikachu, tes primes, tes gradées…
                </p>
                <input
                  type="text"
                  value={name}
                  autoFocus
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") createEmpty();
                  }}
                  placeholder="Nom du classeur"
                  className="field"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button type="button" onClick={close} disabled={pending} className="btn btn-ghost">
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={createEmpty}
                    disabled={pending || !name.trim()}
                    className="btn btn-primary"
                  >
                    {pending ? "Création…" : "Créer et personnaliser"}
                  </button>
                </div>
              </>
            )}

            {step === "set" && (
              <>
                <p className="display mb-1 text-base font-semibold">À partir d&apos;un set</p>
                <p className="mb-3 text-sm text-muted">
                  Choisis une extension — le classeur reprendra toutes ses cartes.
                </p>
                <div className="relative mb-3">
                  <Search
                    size={14}
                    aria-hidden
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                  />
                  <input
                    type="text"
                    value={q}
                    autoFocus
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Nom de l'extension…"
                    className="field !pl-9 text-[13px]"
                  />
                </div>
                {sets.length === 0 ? (
                  <p className="text-sm text-muted">Catalogue indisponible pour le moment.</p>
                ) : results.length === 0 ? (
                  <p className="text-sm text-muted">Aucune extension ne correspond.</p>
                ) : (
                  <div className="-mx-1 flex flex-col gap-1 overflow-y-auto px-1">
                    {results.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        disabled={pending}
                        onClick={() => createFromSet(s)}
                        className="flex items-center gap-3 rounded-xl border border-edge px-3 py-2 text-left transition hover:border-edge-strong disabled:opacity-50"
                      >
                        <span className="flex h-8 w-12 shrink-0 items-center justify-center">
                          {s.logo ? (
                            <CardImage
                              base={`${s.logo}.webp`}
                              alt=""
                              direct
                              className="max-h-8 max-w-full object-contain"
                            />
                          ) : (
                            <NotebookTabs size={16} className="text-faint" aria-hidden />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{s.name}</span>
                          <span className="block truncate text-xs text-muted">{s.serie}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {pending && (
                  <p className="mt-3 text-sm text-muted">Création du classeur…</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
