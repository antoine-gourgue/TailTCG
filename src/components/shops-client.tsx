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
import { formatEur } from "@/lib/domain";

// Leaflet touche window : jamais rendu côté serveur
const ShopMap = dynamic(() => import("./shop-map"), {
  ssr: false,
  loading: () => (
    <div className="h-105 w-full animate-pulse rounded-xl border border-edge bg-surface" />
  ),
});

export type SourceWithStats = {
  id: string;
  name: string;
  kind: "shop" | "web";
  url: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  notes: string | null;
  cards: number;
  spent: number;
};

const inputCls =
  "w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-neutral-500 focus:outline-none";

function SourceFields({
  kind,
  source,
}: {
  kind: "shop" | "web";
  source?: SourceWithStats;
}) {
  return (
    <>
      <input
        type="text"
        name="name"
        placeholder={kind === "shop" ? "Nom (ex. Snoop Bayonne)" : "Nom (ex. Cardmarket)"}
        defaultValue={source?.name ?? ""}
        required
        className={inputCls}
      />
      {kind === "shop" ? (
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            name="address"
            placeholder="Adresse"
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
      ) : (
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
        <p className={`text-xs ${state.ok ? "text-emerald-400" : "text-red-400"}`}>
          {state.message}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50"
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
    <li className="rounded-xl border border-edge bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {source.name}
            {source.kind === "shop" && source.lat == null && (
              <span
                className="ml-2 text-xs text-amber-400"
                title="Adresse non géolocalisée : absente de la carte"
              >
                ⚠ non géolocalisée
              </span>
            )}
          </p>
          <p className="truncate text-xs text-muted">
            {source.kind === "shop"
              ? [source.address, source.city].filter(Boolean).join(", ") ||
                "Adresse non renseignée"
              : source.url ?? "URL non renseignée"}
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
          <form
            action={deleteSource}
            onSubmit={(e) => {
              if (
                !window.confirm(
                  `Supprimer « ${source.name} » ? Les cartes achetées là perdront leur source.`
                )
              )
                e.preventDefault();
            }}
          >
            <input type="hidden" name="source_id" value={source.id} />
            <button type="submit" className="text-red-400 transition hover:text-red-300">
              Supprimer
            </button>
          </form>
        </div>
      </div>
      {editing && <EditSourceForm source={source} onDone={() => setEditing(false)} />}
    </li>
  );
}

function CreateSourceForm() {
  const [kind, setKind] = useState<"shop" | "web">("shop");
  const [state, formAction, pending] = useActionState<SourceFormState, FormData>(
    createSourceForm,
    null
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-xl border border-edge p-4"
    >
      <div className="flex gap-2">
        {(
          [
            ["shop", "Boutique"],
            ["web", "Site web"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              kind === k
                ? "border-neutral-300 bg-neutral-100 text-neutral-950"
                : "border-edge bg-surface text-muted hover:border-neutral-500"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <SourceFields kind={kind} />
      {state && (
        <p className={`text-xs ${state.ok ? "text-emerald-400" : "text-red-400"}`}>
          {state.message}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-white disabled:opacity-50"
      >
        {pending
          ? kind === "shop"
            ? "Géocodage…"
            : "Création…"
          : kind === "shop"
            ? "Créer la boutique"
            : "Créer le site"}
      </button>
    </form>
  );
}

export function ShopsClient({ sources }: { sources: SourceWithStats[] }) {
  const shops = sources.filter((s) => s.kind === "shop");
  const webs = sources.filter((s) => s.kind === "web");

  return (
    <div className="flex flex-col gap-8">
      <ShopMap shops={shops} />

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
            En boutique
          </h2>
          {shops.length === 0 ? (
            <p className="mb-4 text-sm text-muted">Aucune boutique enregistrée.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-3">
              {shops.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
            Sur le web
          </h2>
          {webs.length === 0 ? (
            <p className="mb-4 text-sm text-muted">Aucun site enregistré.</p>
          ) : (
            <ul className="mb-4 flex flex-col gap-3">
              {webs.map((s) => (
                <SourceRow key={s.id} source={s} />
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-xl font-semibold">
          Ajouter une source
        </h2>
        <CreateSourceForm />
      </section>
    </div>
  );
}
