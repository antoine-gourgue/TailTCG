"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Check, ExternalLink, MapPin, MoreHorizontal, Pencil, Plus, Store, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import {
  createSourceForm,
  updateSourceForm,
  deleteSource,
  type SourceFormState,
} from "@/app/boutiques/actions";
import {
  formatEur,
  SOURCE_KINDS,
  GEOCODED_KINDS,
  sourceKindLabel,
  type SourceKind,
} from "@/lib/domain";
import { ConfirmAction } from "@/components/confirm-action";
import { Sheet } from "@/components/sheet";
import { StatCard, StatStrip } from "@/components/stat-card";
import { CardImage } from "@/components/card-image";

// Leaflet touche window : jamais rendu côté serveur
const ShopMap = dynamic(() => import("./shop-map"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-3xl bg-surface ring-1 ring-ring md:h-105" />
  ),
});

export type SourceWithStats = {
  id: string;
  name: string;
  kind: SourceKind;
  url: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  cards: number;
  spent: number;
  /** Cartes dont le prix est connu (pour la moyenne) */
  pricedCards: number;
  /** Date du dernier achat (AAAA-MM-JJ) */
  lastAt: string | null;
  /** Dernières cartes achetées là */
  recent: { id: string; name: string; image: string | null }[];
};

const SECTION_LABEL: Record<SourceKind, string> = {
  shop: "En boutique",
  web: "Sur le web",
  flea: "En brocante",
  trade: "Échanges",
  pack: "Sorties de booster",
};

function placeholderFor(kind: SourceKind): string {
  return kind === "shop"
    ? "Nom (ex. Snoop Bayonne)"
    : kind === "web"
      ? "Nom (ex. Cardmarket)"
      : kind === "flea"
        ? "Nom (ex. Brocante de Biarritz)"
        : kind === "trade"
          ? "Nom (ex. Échange avec Lucas)"
          : "Nom (ex. Booster Déchaînement)";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" });
}

/** Lieu, URL ou note : la ligne de contexte sous le nom */
function subtitle(s: SourceWithStats): string {
  if (GEOCODED_KINDS.includes(s.kind)) return [s.address, s.city].filter(Boolean).join(", ") || "Adresse non renseignée";
  if (s.kind === "web") return s.url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") ?? "URL non renseignée";
  return s.notes ?? sourceKindLabel(s.kind);
}

function SourceFields({ kind, source }: { kind: SourceKind; source?: SourceWithStats }) {
  return (
    <>
      <div>
        <label className="label-xs mb-1.5 block">Nom</label>
        <input type="text" name="name" placeholder={placeholderFor(kind)} defaultValue={source?.name ?? ""} required className="field" />
      </div>
      {GEOCODED_KINDS.includes(kind) && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label-xs mb-1.5 block">{kind === "flea" ? "Lieu" : "Adresse"}</label>
            <input type="text" name="address" placeholder={kind === "flea" ? "facultatif" : "12 rue des Cartes"} defaultValue={source?.address ?? ""} className="field" />
          </div>
          <div>
            <label className="label-xs mb-1.5 block">Ville</label>
            <input type="text" name="city" placeholder="Bayonne" defaultValue={source?.city ?? ""} className="field" />
          </div>
        </div>
      )}
      {kind === "web" && (
        <div>
          <label className="label-xs mb-1.5 block">Site</label>
          <input type="url" name="url" placeholder="https://…" defaultValue={source?.url ?? ""} className="field" />
        </div>
      )}
      <div>
        <label className="label-xs mb-1.5 block">Notes <span className="font-normal normal-case text-faint">facultatif</span></label>
        <input type="text" name="notes" placeholder="Horaires, contact, bons plans…" defaultValue={source?.notes ?? ""} className="field" />
      </div>
    </>
  );
}

function KindChips({ kind, onChange }: { kind: SourceKind; onChange: (k: SourceKind) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {SOURCE_KINDS.map(({ kind: k, label }) => (
        <button
          key={k}
          type="button"
          data-on={kind === k}
          onClick={() => onChange(k)}
          className={`seg px-3.5 py-1.5 text-sm ${kind === k ? "font-medium text-accent-strong" : "text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FormMessage({ state }: { state: SourceFormState }) {
  if (!state) return null;
  return (
    <p className={`flex items-center gap-1.5 text-sm ${state.ok ? "text-gain" : "text-loss"}`}>
      {state.ok && <Check size={14} aria-hidden />}
      {state.message}
    </p>
  );
}

function CreateSourceForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<SourceKind>("shop");
  const [state, formAction, pending] = useActionState<SourceFormState, FormData>(createSourceForm, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <KindChips kind={kind} onChange={setKind} />
      <input type="hidden" name="kind" value={kind} />
      <SourceFields kind={kind} />
      <FormMessage state={state} />
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? (GEOCODED_KINDS.includes(kind) ? "Géocodage…" : "Création…") : "Créer"}
        </button>
        <button type="button" onClick={onDone} className="btn btn-ghost">
          {state?.ok ? "Fermer" : "Annuler"}
        </button>
      </div>
    </form>
  );
}

function EditSourceForm({ source, onDone }: { source: SourceWithStats; onDone: () => void }) {
  const [state, formAction, pending] = useActionState<SourceFormState, FormData>(updateSourceForm, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="source_id" value={source.id} />
      <SourceFields kind={source.kind} source={source} />
      <FormMessage state={state} />
      <div className="flex items-center gap-2 pt-1">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={onDone} className="btn btn-ghost">
          {state?.ok ? "Fermer" : "Annuler"}
        </button>
      </div>
    </form>
  );
}

/** Bouton d'en-tête : ouvre la fiche de création dans un panneau */
export function NewSourceButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary shadow-lg shadow-accent/30">
        <Plus size={16} aria-hidden /> Nouvelle source
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Nouvelle source" description="Une boutique, un site, une brocante, un échange ou une sortie de booster." size="md">
        {open && <CreateSourceForm onDone={() => setOpen(false)} />}
      </Sheet>
    </>
  );
}

function SourceRow({ source, share }: { source: SourceWithStats; share: number }) {
  const [editing, setEditing] = useState(false);
  const [menu, setMenu] = useState(false);
  const located = GEOCODED_KINDS.includes(source.kind);
  const avg = source.pricedCards > 0 ? source.spent / source.pricedCards : null;

  return (
    <li className="panel p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] lg:items-center lg:gap-6">
        {/* Identité et part des achats */}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <p className="truncate font-semibold">{source.name}</p>
            <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-[10px] font-medium text-muted">{sourceKindLabel(source.kind)}</span>
            {located && source.lat == null && (
              <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-strong" title="Adresse non géolocalisée : absente de la carte">
                hors carte
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
            {located ? <MapPin size={11} className="shrink-0" aria-hidden /> : source.kind === "web" ? <ExternalLink size={11} className="shrink-0" aria-hidden /> : null}
            {source.kind === "web" && source.url ? (
              <a href={source.url} target="_blank" rel="noreferrer" className="truncate hover:text-foreground hover:underline">
                {subtitle(source)}
              </a>
            ) : (
              <span className="truncate">{subtitle(source)}</span>
            )}
          </p>
          {source.cards > 0 ? (
            <div className="mt-3">
              <div className="flex h-1.5 overflow-hidden rounded-full bg-raised" aria-hidden>
                <span className="rounded-full bg-accent" style={{ width: `${Math.max(2, Math.round(share * 100))}%` }} />
              </div>
              <p className="num mt-1 flex justify-between text-[11px] text-muted">
                <span>{Math.round(share * 100)} % de tes achats</span>
                {source.lastAt && <span>dernier achat {shortDate(source.lastAt)}</span>}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-faint">Aucune carte rattachée pour l’instant.</p>
          )}
        </div>

        {/* Chiffres */}
        <dl className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-raised/60 px-2.5 py-2">
            <dt className="label-xs !text-[10px] text-muted">Cartes</dt>
            <dd className="num text-base font-bold leading-tight">{source.cards}</dd>
          </div>
          <div className="rounded-xl bg-raised/60 px-2.5 py-2">
            <dt className="label-xs !text-[10px] text-muted">Dépensé</dt>
            <dd className="num truncate text-base font-bold leading-tight">{formatEur(source.spent)}</dd>
          </div>
          <div className="rounded-xl bg-raised/60 px-2.5 py-2">
            <dt className="label-xs !text-[10px] text-muted">Moyenne</dt>
            <dd className="num truncate text-base font-bold leading-tight">{avg != null ? formatEur(avg) : <span className="font-normal text-faint">—</span>}</dd>
          </div>
        </dl>

        {/* Dernières cartes et actions */}
        <div className="flex items-center justify-between gap-3 lg:justify-end lg:gap-4">
          {source.cards > 0 && (
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                {source.recent.map((c) => (
                  <Link key={c.id} href={`/carte/${c.id}`} title={c.name} className="h-11 w-8 overflow-hidden rounded-md bg-raised shadow-sm ring-2 ring-surface transition hover:z-10 hover:-translate-y-0.5">
                    <CardImage base={c.image} alt={c.name} quality="low" placeholder="compact" />
                  </Link>
                ))}
              </div>
              <Link href={`/cartes?source=${source.id}`} className="whitespace-nowrap text-xs font-medium text-accent underline-offset-4 hover:text-accent-strong hover:underline">
                Voir les {source.cards > 1 ? `${source.cards} cartes` : "cartes"}
              </Link>
            </div>
          )}
          <div className="relative flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Modifier"
              title="Modifier"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
            >
              <Pencil size={14} aria-hidden />
            </button>
            {/* La suppression est à l'abri d'un faux clic, derrière le menu ⋯ */}
            <button
              type="button"
              onClick={() => setMenu((v) => !v)}
              aria-label="Plus d'actions"
              aria-haspopup="menu"
              aria-expanded={menu}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground"
            >
              <MoreHorizontal size={16} aria-hidden />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} aria-hidden />
                <div role="menu" className="panel absolute right-0 top-full z-20 mt-1 min-w-44 !p-1">
                  <ConfirmAction
                    action={deleteSource}
                    fields={{ source_id: source.id }}
                    title={`Supprimer « ${source.name} » ?`}
                    message="Les cartes achetées là resteront dans ta collection mais perdront leur source."
                    trigger={
                      <span className="flex items-center gap-2">
                        <Trash2 size={14} aria-hidden /> Supprimer
                      </span>
                    }
                    triggerClassName="flex w-full rounded-lg px-3 py-2 text-left text-sm text-loss transition hover:bg-raised"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Sheet open={editing} onClose={() => setEditing(false)} title={source.name} description={sourceKindLabel(source.kind)} size="md">
        {editing && <EditSourceForm source={source} onDone={() => setEditing(false)} />}
      </Sheet>
    </li>
  );
}

export function ShopsClient({ sources }: { sources: SourceWithStats[] }) {
  const [kindFilter, setKindFilter] = useState<SourceKind | null>(null);
  // Boutiques ET brocantes géolocalisées apparaissent sur la carte
  const located = sources.filter((s) => GEOCODED_KINDS.includes(s.kind));
  const onMap = located.filter((s) => s.lat != null).length;
  const totalCards = sources.reduce((s, x) => s + x.cards, 0);
  const totalSpent = sources.reduce((s, x) => s + x.spent, 0);
  const pricedCards = sources.reduce((s, x) => s + x.pricedCards, 0);
  const favorite = [...sources].sort((a, b) => b.spent - a.spent || b.cards - a.cards)[0];

  const byKind = (k: SourceKind) => sources.filter((s) => s.kind === k).length;
  const shown = sources
    .filter((s) => kindFilter === null || s.kind === kindFilter)
    .sort((a, b) => b.spent - a.spent || b.cards - a.cards || a.name.localeCompare(b.name));
  const chip = (on: boolean) => `seg flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-sm ${on ? "font-medium text-accent-strong" : "text-muted"}`;

  if (sources.length === 0) {
    return (
      <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
        <Store size={44} strokeWidth={1.3} className="text-faint" aria-hidden />
        <p className="display text-xl font-semibold">Aucune source pour l’instant</p>
        <p className="max-w-sm text-sm text-muted">
          Ajoute tes boutiques, sites et brocantes : chaque carte achetée pourra y être rattachée, et tu verras où va ton budget.
        </p>
      </div>
    );
  }

  return (
    <div className="rise-in flex flex-col gap-8">
      <StatStrip cols={4}>
        <StatCard label="Sources" value={sources.length} sub={`${onMap} sur la carte`} />
        <StatCard label="Cartes achetées" value={totalCards} sub={`${sources.filter((s) => s.cards > 0).length} source${sources.filter((s) => s.cards > 0).length > 1 ? "s" : ""} utilisée${sources.filter((s) => s.cards > 0).length > 1 ? "s" : ""}`} />
        <StatCard label="Dépensé" value={formatEur(totalSpent)} sub={pricedCards ? `${formatEur(totalSpent / pricedCards)} par carte` : "aucun prix renseigné"} />
        <StatCard label="Préférée" value={favorite && favorite.cards > 0 ? <span className="text-lg">{favorite.name}</span> : <span className="font-normal text-faint">—</span>} sub={favorite && favorite.cards > 0 ? `${formatEur(favorite.spent)} · ${favorite.cards} carte${favorite.cards > 1 ? "s" : ""}` : undefined} />
      </StatStrip>

      {located.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="display text-xl font-semibold">Sur la carte</h2>
            <p className="text-xs text-muted">
              {onMap} lieu{onMap > 1 ? "x" : ""} géolocalisé{onMap > 1 ? "s" : ""}
              {located.length - onMap > 0 && ` · ${located.length - onMap} sans adresse`}
            </p>
          </div>
          <ShopMap shops={located} />
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="display text-xl font-semibold">Tes sources</h2>
          <nav aria-label="Filtrer par type" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <button type="button" data-on={kindFilter === null} onClick={() => setKindFilter(null)} className={chip(kindFilter === null)}>
              Toutes <span className="num text-[11px] text-faint">{sources.length}</span>
            </button>
            {SOURCE_KINDS.filter(({ kind }) => byKind(kind) > 0).map(({ kind }) => (
              <button key={kind} type="button" data-on={kindFilter === kind} onClick={() => setKindFilter(kind)} className={chip(kindFilter === kind)}>
                {SECTION_LABEL[kind]} <span className="num text-[11px] text-faint">{byKind(kind)}</span>
              </button>
            ))}
          </nav>
        </div>
        <ul className="flex flex-col gap-3">
          {shown.map((s) => (
            <SourceRow key={s.id} source={s} share={totalSpent > 0 ? s.spent / totalSpent : 0} />
          ))}
        </ul>
      </section>
    </div>
  );
}
