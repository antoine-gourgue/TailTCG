"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck, ListChecks, NotebookTabs, Plus, Printer, Search, X } from "lucide-react";
import { addPokemonToBinder, createBinderAndAdd, createBinderFromPokedex } from "@/app/classeurs/actions";
import { PokemonCard } from "@/components/pokemon-card";
import { Sheet } from "@/components/sheet";
import { FloatingBar } from "@/components/floating-bar";
import { Toast } from "@/components/toast";
import {
  dexNumber,
  GENERATIONS,
  generationLabel,
  matchPokemon,
  TYPE_FR,
  type PokedexEntry,
} from "@/lib/pokedex";

export type BinderRef = { id: string; name: string };

/**
 * Pokédex en cartes : une génération à la fois, recherche par nom ou numéro.
 * Un Pokémon se range dans un classeur (jamais dans la collection) : un par un
 * depuis sa fiche, ou en sélection multiple.
 */
export function PokedexGrid({
  list,
  binders,
  inBinders,
}: {
  list: PokedexEntry[];
  binders: BinderRef[];
  /** numéro → classeurs qui contiennent déjà ce Pokémon */
  inBinders: Record<number, string[]>;
}) {
  const router = useRouter();
  const [gen, setGen] = useState(1);
  const [q, setQ] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<PokedexEntry | null>(null);
  /** Pokémon à ranger : le choix du classeur est ouvert */
  const [chooser, setChooser] = useState<number[] | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);

  const counts = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of list) m.set(p.generation, (m.get(p.generation) ?? 0) + 1);
    return m;
  }, [list]);
  const needle = q.trim();
  // Une recherche parcourt tout le Pokédex, sinon la génération choisie
  const visible = list.filter((p) => (needle ? matchPokemon(p, needle) : gen === 0 || p.generation === gen));
  const binderName = (id: string) => binders.find((b) => b.id === id)?.name ?? "?";

  function togglePick(id: number) {
    setPicked((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function pickVisible() {
    setPicked((prev) => {
      const n = new Set(prev);
      for (const p of visible) n.add(p.id);
      return n;
    });
  }
  function exitSelect() {
    setSelecting(false);
    setPicked(new Set());
  }
  function closeChooser() {
    setChooser(null);
    setNewName("");
  }

  async function addTo(binderId: string, name: string) {
    if (!chooser || busy) return;
    setBusy(true);
    const res = await addPokemonToBinder(binderId, chooser);
    setBusy(false);
    if (res.error) {
      setToast({ message: res.error, tone: "error" });
      return;
    }
    const skipped = chooser.length - res.added;
    setToast({
      message:
        res.added === 0
          ? `Déjà dans « ${name} »`
          : `${res.added} Pokémon rangé${res.added > 1 ? "s" : ""} dans « ${name} »${
              skipped > 0 ? ` · ${skipped} déjà présent${skipped > 1 ? "s" : ""}` : ""
            }`,
    });
    closeChooser();
    setSelected(null);
    exitSelect();
    router.refresh();
  }
  async function addToNew() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const created = await createBinderAndAdd(name, []);
    setBusy(false);
    if (!created.binderId) {
      setToast({ message: created.error ?? "Création impossible", tone: "error" });
      return;
    }
    await addTo(created.binderId, name);
  }
  function createGenerationBinder() {
    if (pending || gen === 0) return;
    start(async () => {
      const res = await createBinderFromPokedex(gen); // redirige vers l'éditeur
      if (res?.error) setToast({ message: res.error, tone: "error" });
    });
  }

  return (
    <div>
      {/* Générations + recherche + actions */}
      <div className="mb-6 flex flex-col gap-3">
        <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
          {[{ gen: 0, region: "Tous" }, ...GENERATIONS].map((g) => {
            const active = !needle && gen === g.gen;
            const n = g.gen === 0 ? list.length : counts.get(g.gen) ?? 0;
            return (
              <button
                key={g.gen}
                type="button"
                onClick={() => {
                  setGen(g.gen);
                  setQ("");
                }}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                  active
                    ? "border-accent bg-accent text-accent-ink"
                    : "border-edge bg-surface text-muted hover:border-edge-strong hover:text-foreground"
                }`}
              >
                {g.region}
                <span className={`num text-[11px] ${active ? "text-accent-ink/80" : "text-faint"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom ou numéro…"
              className="field !pl-9 text-[13px]"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            {gen > 0 && !needle && (
              <Link
                href={`/extensions/pokedex/impression?gen=${gen}`}
                target="_blank"
                title="Planches à imprimer : cartes à taille réelle, repères de coupe"
                className="btn btn-ghost !px-2.5 text-[13px]"
              >
                <Printer size={14} aria-hidden />
                <span className="hidden sm:inline">Imprimer</span>
              </Link>
            )}
            <button
              type="button"
              onClick={createGenerationBinder}
              disabled={pending || gen === 0 || !!needle}
              title="Créer un classeur avec toute cette génération"
              className="btn btn-ghost !px-2.5 text-[13px] disabled:opacity-40"
            >
              <NotebookTabs size={14} aria-hidden />
              <span className="hidden sm:inline">{pending ? "Création…" : "Classeur de la génération"}</span>
              <span className="sm:hidden">{pending ? "Création…" : "Classeur"}</span>
            </button>
            <button
              type="button"
              onClick={() => (selecting ? exitSelect() : setSelecting(true))}
              className="btn btn-ghost !px-2.5 text-[13px]"
            >
              <ListChecks size={14} aria-hidden />
              {selecting ? "Annuler" : "Sélectionner"}
            </button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted">Aucun Pokémon ne correspond.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((p, i) => {
            const inN = inBinders[p.id]?.length ?? 0;
            const on = selecting && picked.has(p.id);
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => (selecting ? togglePick(p.id) : setSelected(p))}
                  className="group block w-full text-left"
                >
                  <div
                    className={`card-tile aspect-[63/88] ${
                      on ? "outline outline-2 outline-offset-2 outline-accent" : ""
                    }`}
                  >
                    <PokemonCard p={p} priority={i < 12} />
                    {selecting && (
                      <span
                        aria-hidden
                        className={`absolute bottom-1.5 right-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full border transition ${
                          on
                            ? "border-transparent bg-accent text-accent-ink"
                            : "border-white/50 bg-black/40 text-transparent"
                        }`}
                      >
                        <Check size={13} strokeWidth={3} />
                      </span>
                    )}
                    {inN > 0 && (
                      <span
                        className="tile-badge left-1.5 top-1.5 z-10 flex items-center gap-1"
                        title={inBinders[p.id].map(binderName).join(", ")}
                      >
                        <NotebookTabs size={11} aria-hidden />
                        {inN > 1 ? <span className="num">{inN}</span> : null}
                      </span>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Fiche d'un Pokémon */}
      <Sheet
        open={selected != null}
        onClose={() => setSelected(null)}
        label={selected?.name ?? "Pokémon"}
        size="xs"
      >
        {selected && (
          <div className="mx-auto w-full max-w-[260px] sm:max-w-none">
            <div className="card-tile aspect-[63/88]">
              <PokemonCard p={selected} priority />
            </div>
            <div className="mt-4 min-w-0">
              <p className="display truncate text-lg font-semibold leading-tight">{selected.name}</p>
              <p className="mt-0.5 text-sm text-muted">
                {generationLabel(selected.generation)}
                <span className="num text-faint"> · N° {dexNumber(selected.id)}</span>
              </p>
              {selected.types.length > 0 && (
                <p className="mt-1.5 text-xs text-muted">
                  {selected.types.map((t) => TYPE_FR[t] ?? t).join(" · ")}
                </p>
              )}
              {(inBinders[selected.id]?.length ?? 0) > 0 && (
                <p className="mt-2 text-xs text-faint">
                  Déjà dans : {inBinders[selected.id].map(binderName).join(", ")}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setChooser([selected.id])}
              className="btn btn-primary mt-4 w-full"
            >
              <NotebookTabs size={15} aria-hidden />
              Ranger dans un classeur
            </button>
            <p className="mt-2 text-center text-[11px] text-faint">
              Occupe une pochette du classeur, sans entrer dans ta collection.
            </p>
          </div>
        )}
      </Sheet>

      {/* Choix du classeur */}
      <Sheet
        open={chooser != null}
        onClose={closeChooser}
        dismissible={!busy}
        title="Ranger dans un classeur"
        description={
          chooser
            ? `${chooser.length} Pokémon · à la suite des cartes déjà rangées`
            : undefined
        }
      >
        {binders.length > 0 && (
          <div className="mb-3 flex flex-col gap-1">
            {binders.map((b) => (
              <button
                key={b.id}
                type="button"
                disabled={busy}
                onClick={() => void addTo(b.id, b.name)}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[15px] transition hover:bg-raised active:bg-raised disabled:opacity-50"
              >
                <NotebookTabs size={18} strokeWidth={1.9} className="shrink-0 text-muted" aria-hidden />
                <span className="flex-1 truncate">{b.name}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addToNew();
            }}
            maxLength={60}
            placeholder={binders.length === 0 ? "Nom du premier classeur…" : "Ou crée un nouveau classeur…"}
            className="field text-[13px]"
          />
          <button
            type="button"
            onClick={() => void addToNew()}
            disabled={busy || !newName.trim()}
            className="btn btn-primary shrink-0"
          >
            {busy ? "…" : "Créer"}
          </button>
        </div>
      </Sheet>

      {/* Sélection multiple */}
      {selecting && picked.size > 0 && (
        <FloatingBar>
          <button
            type="button"
            onClick={() => setPicked(new Set())}
            aria-label="Tout désélectionner"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
          >
            <X size={16} aria-hidden />
          </button>
          <span className="num shrink-0 whitespace-nowrap text-sm font-semibold">{picked.size}</span>
          <button
            type="button"
            onClick={pickVisible}
            title="Tout cocher"
            aria-label="Tout cocher"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
          >
            <CheckCheck size={17} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setChooser([...picked])}
            className="btn btn-primary shrink-0 !rounded-full !py-2 text-[13px]"
          >
            <Plus size={15} aria-hidden />
            <span className="hidden min-[400px]:inline">Ranger dans un classeur</span>
            <span className="min-[400px]:hidden">Ranger</span>
          </button>
        </FloatingBar>
      )}

      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
