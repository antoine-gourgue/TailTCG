"use client";

import { useState, useTransition } from "react";
import { Plus, NotebookTabs, Search, ChevronLeft, Book } from "lucide-react";
import { createBinder, createBinderFromSet } from "@/app/classeurs/actions";
import { CardImage } from "@/components/card-image";
import { Sheet } from "@/components/sheet";

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

  const titles = {
    choose: ["Nouveau classeur", "Ensuite, tu choisiras son design dans l'éditeur."],
    empty: ["Classeur vide", "Toutes tes Pikachu, tes primes, tes gradées…"],
    set: ["À partir d'un set", "Choisis une extension — le classeur reprendra toutes ses cartes."],
  } as const;
  const [title, description] = titles[step];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">
        <Plus size={15} aria-hidden />
        {label}
      </button>

      <Sheet
        open={open}
        onClose={close}
        dismissible={!pending}
        size="md"
        label="Nouveau classeur"
        header={
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {step !== "choose" && (
              <button
                type="button"
                onClick={reset}
                aria-label="Retour"
                className="-ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
              >
                <ChevronLeft size={16} aria-hidden />
              </button>
            )}
            <div className="min-w-0 flex-1">
              <p className="display text-base font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
          </div>
        }
      >
        {step === "choose" && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setStep("empty")}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-raised active:bg-raised"
            >
              <Book size={20} strokeWidth={1.9} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">Classeur vide</span>
                <span className="block text-xs text-muted">Une sous-collection à remplir toi-même</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setStep("set")}
              className="flex items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-raised active:bg-raised"
            >
              <NotebookTabs size={20} strokeWidth={1.9} className="shrink-0 text-muted" aria-hidden />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium">À partir d&apos;un set</span>
                <span className="block text-xs text-muted">
                  Tout le set, tes cartes remplies, les manquantes en attente
                </span>
              </span>
            </button>
          </div>
        )}

        {step === "empty" && (
          <>
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
            <div className="sheet-actions">
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
                className="field !pl-9 text-[15px]"
              />
            </div>
            {sets.length === 0 ? (
              <p className="text-sm text-muted">Catalogue indisponible pour le moment.</p>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted">Aucune extension ne correspond.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {results.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={pending}
                    onClick={() => createFromSet(s)}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-raised active:bg-raised disabled:opacity-50"
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
                      <span className="block truncate text-[15px] font-medium">{s.name}</span>
                      <span className="block truncate text-xs text-muted">{s.serie}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {pending && <p className="mt-3 text-sm text-muted">Création du classeur…</p>}
          </>
        )}
      </Sheet>
    </>
  );
}
