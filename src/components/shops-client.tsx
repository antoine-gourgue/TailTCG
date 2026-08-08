"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
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

// Leaflet touche window : jamais rendu côté serveur
const ShopMap = dynamic(() => import("./shop-map"), {
  ssr: false,
  loading: () => (
    <div className="h-64 w-full animate-pulse rounded-2xl border border-edge bg-surface md:h-105" />
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
};

const inputCls = "field";

function SourceFields({
  kind,
  source,
}: {
  kind: SourceKind;
  source?: SourceWithStats;
}) {
  return (
    <>
      <input
        type="text"
        name="name"
        placeholder={
          kind === "shop"
            ? "Nom (ex. Snoop Bayonne)"
            : kind === "web"
              ? "Nom (ex. Cardmarket)"
              : kind === "flea"
                ? "Nom (ex. Brocante de Biarritz)"
                : kind === "trade"
                  ? "Nom (ex. Échange avec Lucas)"
                  : "Nom (ex. Booster Déchaînement)"
        }
        defaultValue={source?.name ?? ""}
        required
        className={inputCls}
      />
      {GEOCODED_KINDS.includes(kind) && (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            name="address"
            placeholder={kind === "flea" ? "Lieu (facultatif)" : "Adresse"}
            defaultValue={source?.address ?? ""}
            className={inputCls}
          />
          <input
            type="text"
            name="city"
            placeholder="Ville"
            defaultValue={source?.city ?? ""}
            className={inputCls}
          />
        </div>
      )}
      {kind === "web" && (
        <input
          type="url"
          name="url"
          placeholder="https://…"
          defaultValue={source?.url ?? ""}
          className={inputCls}
        />
      )}
      <input
        type="text"
        name="notes"
        placeholder="Notes (facultatif)"
        defaultValue={source?.notes ?? ""}
        className={inputCls}
      />
    </>
  );
}

function EditSourceForm({
  source,
  onDone,
}: {
  source: SourceWithStats;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState<SourceFormState, FormData>(
    updateSourceForm,
    null
  );

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="source_id" value={source.id} />
      <SourceFields kind={source.kind} source={source} />
      {state && (
        <p className={`text-xs ${state.ok ? "text-gain" : "text-loss"}`}>
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-primary !py-1.5 text-sm"
        >
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="text-sm text-muted hover:text-foreground"
        >
          Fermer
        </button>
      </div>
    </form>
  );
}

function SourceRow({ source }: { source: SourceWithStats }) {
  const [editing, setEditing] = useState(false);

  return (
    <li className="panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {source.name}
            {GEOCODED_KINDS.includes(source.kind) && source.lat == null && (
              <span
                className="ml-2 text-xs text-accent-strong"
                title="Adresse non géolocalisée : absente de la carte"
              >
                ⚠ non géolocalisée
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted">
            {GEOCODED_KINDS.includes(source.kind)
              ? [source.address, source.city].filter(Boolean).join(", ") ||
                "Adresse non renseignée"
              : source.kind === "web"
                ? source.url ?? "URL non renseignée"
                : source.notes ?? sourceKindLabel(source.kind)}
          </p>
          <p className="mt-1 text-sm text-muted">
            <span className="num text-foreground">{source.cards}</span> carte
            {source.cards > 1 ? "s" : ""} ·{" "}
            <span className="num text-foreground">{formatEur(source.spent)}</span>
            {source.cards > 0 && (
              <>
                {" · "}
                <Link
                  href={`/?source=${source.id}`}
                  className="underline hover:text-foreground"
                >
                  voir
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex shrink-0 gap-3 text-sm">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="text-muted transition hover:text-foreground"
          >
            {editing ? "Fermer" : "Modifier"}
          </button>
          <ConfirmAction
            action={deleteSource}
            fields={{ source_id: source.id }}
            title={`Supprimer « ${source.name} » ?`}
            message="Les cartes achetées là resteront dans ta collection mais perdront leur source."
            trigger="Supprimer"
            triggerClassName="text-loss transition hover:opacity-80"
          />
        </div>
      </div>
      {editing && <EditSourceForm source={source} onDone={() => setEditing(false)} />}
    </li>
  );
}

function CreateSourceForm() {
  const [kind, setKind] = useState<SourceKind>("shop");
  const [state, formAction, pending] = useActionState<SourceFormState, FormData>(
    createSourceForm,
    null
  );

  return (
    <form action={formAction} className="panel flex flex-col gap-2 p-4">
      <div className="flex flex-wrap gap-2">
        {SOURCE_KINDS.map(({ kind: k, label }) => (
          <button
            key={k}
            type="button"
            data-on={kind === k}
            onClick={() => setKind(k)}
            className={`seg px-3.5 py-1.5 text-sm ${
              kind === k ? "font-medium text-accent-strong" : "text-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <SourceFields kind={kind} />
      {state && (
        <p className={`text-xs ${state.ok ? "text-gain" : "text-loss"}`}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary self-start">
        {pending
          ? GEOCODED_KINDS.includes(kind)
            ? "Géocodage…"
            : "Création…"
          : `Créer (${sourceKindLabel(kind).toLowerCase()})`}
      </button>
    </form>
  );
}

export function ShopsClient({ sources }: { sources: SourceWithStats[] }) {
  // Boutiques ET brocantes géolocalisées apparaissent sur la carte
  const located = sources.filter((s) => GEOCODED_KINDS.includes(s.kind));
  const sections = SOURCE_KINDS.map(({ kind, label }) => ({
    kind,
    label:
      kind === "shop"
        ? "En boutique"
        : kind === "web"
          ? "Sur le web"
          : kind === "flea"
            ? "En brocante"
            : kind === "trade"
              ? "Échanges"
              : "Sorties de booster",
    entries: sources.filter((s) => s.kind === kind),
    labelSingular: label,
  })).filter((s) => s.entries.length > 0 || s.kind === "shop" || s.kind === "web");

  return (
    <div className="flex flex-col gap-8">
      <ShopMap shops={located} />

      <div className="grid gap-8 lg:grid-cols-2">
        {sections.map((section) => (
          <section key={section.kind}>
            <h2 className="mb-3 display text-xl font-semibold">
              {section.label}
            </h2>
            {section.entries.length === 0 ? (
              <p className="mb-4 text-sm text-muted">
                Rien ici pour l&apos;instant.
              </p>
            ) : (
              <ul className="mb-4 flex flex-col gap-3">
                {section.entries.map((s) => (
                  <SourceRow key={s.id} source={s} />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      <section>
        <h2 className="mb-3 display text-xl font-semibold">
          Ajouter une source
        </h2>
        <CreateSourceForm />
      </section>
    </div>
  );
}
