"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { adminDeleteBinder, adminDeleteSource } from "@/app/admin/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";

type Toast = { m: string; t?: "success" | "error" } | null;

export function AdminBindersList({
  ownerId,
  binders,
}: {
  ownerId: string;
  binders: { id: string; name: string; count: number }[];
}) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  return (
    <div className="panel p-5">
      <p className="label-xs mb-3">Classeurs ({binders.length})</p>
      {binders.length === 0 ? (
        <p className="text-sm text-muted">Aucun.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {binders.map((b) => (
            <li
              key={b.id}
              className="flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm"
            >
              <Link
                href={`/admin/utilisateurs/${ownerId}/classeur/${b.id}`}
                className="min-w-0 flex-1 truncate font-medium hover:text-accent-strong"
              >
                {b.name}
              </Link>
              <span className="num shrink-0 text-xs text-faint">{b.count} carte(s)</span>
              <ConfirmAction
                action={async () => {
                  const r = await adminDeleteBinder(b.id, ownerId);
                  setToast(r.ok ? { m: "Classeur supprimé" } : { m: r.message ?? "Échec", t: "error" });
                  if (r.ok) router.refresh();
                }}
                fields={{}}
                title="Supprimer ce classeur ?"
                message="Le classeur est supprimé ; les cartes restent dans la collection de l'utilisateur."
                trigger={<Trash2 size={13} aria-hidden />}
                triggerClassName="btn btn-ghost !px-2 !py-1 !text-loss"
                triggerAriaLabel="Supprimer le classeur"
              />
            </li>
          ))}
        </ul>
      )}
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </div>
  );
}

export function AdminSourcesList({
  ownerId,
  sources,
}: {
  ownerId: string;
  sources: { id: string; name: string; kind: string; city: string | null }[];
}) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  return (
    <div className="panel p-5">
      <p className="label-xs mb-3">Sources ({sources.length})</p>
      {sources.length === 0 ? (
        <p className="text-sm text-muted">Aucune.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {sources.map((s) => (
            <li
              key={s.id}
              className="flex items-center gap-2 rounded-lg border border-edge px-3 py-2 text-sm"
            >
              <Link
                href={`/admin/utilisateurs/${ownerId}/boutique/${s.id}`}
                className="min-w-0 flex-1 truncate hover:text-accent-strong"
              >
                <span className="font-medium">{s.name}</span>{" "}
                <span className="text-xs text-muted">
                  {s.kind}
                  {s.city ? ` · ${s.city}` : ""}
                </span>
              </Link>
              <ConfirmAction
                action={async () => {
                  const r = await adminDeleteSource(s.id, ownerId);
                  setToast(r.ok ? { m: "Source supprimée" } : { m: r.message ?? "Échec", t: "error" });
                  if (r.ok) router.refresh();
                }}
                fields={{}}
                title="Supprimer cette source ?"
                message="Les cartes rattachées perdent leur source, mais ne sont pas supprimées."
                trigger={<Trash2 size={13} aria-hidden />}
                triggerClassName="btn btn-ghost !px-2 !py-1 !text-loss"
                triggerAriaLabel="Supprimer la source"
              />
            </li>
          ))}
        </ul>
      )}
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </div>
  );
}
