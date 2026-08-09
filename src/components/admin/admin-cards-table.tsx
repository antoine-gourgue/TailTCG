"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Trash2, Undo2, X, SearchIcon, Eye } from "lucide-react";
import { formatEur } from "@/lib/domain";
import {
  adminSoftDeleteItem,
  adminRestoreItem,
  adminHardDeleteItem,
} from "@/app/admin/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";

export type AdminItem = {
  id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  tcgdex_id: string;
  condition: string;
  card_type: string | null;
  language: string;
  quantity: number;
  purchase_price: number | null;
  manual_price: number | null;
  graded: boolean;
  grade: string | null;
  sold_at: string | null;
  sold_price: number | null;
  deleted_at: string | null;
  created_at: string | null;
  notes: string | null;
};

function fmt(d: string | null) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

export function AdminCardsTable({
  items,
  ownerId,
}: {
  items: AdminItem[];
  ownerId: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"active" | "trash" | "all">("active");
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    return items.filter(
      (i) =>
        (scope === "all" ||
          (scope === "trash" ? i.deleted_at != null : i.deleted_at == null)) &&
        (!n || `${i.card_name} ${i.set_name} ${i.local_id}`.toLowerCase().includes(n))
    );
  }, [items, q, scope]);

  async function act(
    key: string,
    fn: () => Promise<{ ok: boolean; message?: string }>,
    okMsg: string
  ) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    setToast(r.ok ? { m: okMsg } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-xl border border-edge bg-raised px-3 py-2 text-sm">
          <SearchIcon size={14} className="text-faint" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Chercher…"
            className="w-40 bg-transparent outline-none placeholder:text-faint"
          />
        </div>
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as typeof scope)}
          className="field !w-auto text-[13px]"
        >
          <option value="active">Actives</option>
          <option value="trash">Corbeille</option>
          <option value="all">Toutes</option>
        </select>
        <span className="ml-auto text-xs text-faint">{rows.length} carte(s)</span>
      </div>

      <div className="panel overflow-hidden !p-0">
        <table className="w-full text-sm">
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="px-4 py-4 text-muted">Aucune carte.</td>
              </tr>
            ) : (
              rows.map((i) => {
                const open = openId === i.id;
                const gain =
                  i.manual_price != null && i.purchase_price != null
                    ? (i.manual_price - i.purchase_price) * i.quantity
                    : null;
                return (
                  <>
                    <tr
                      key={i.id}
                      className="cursor-pointer border-t border-edge/50 transition hover:bg-raised first:border-t-0"
                      onClick={() => setOpenId(open ? null : i.id)}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2">
                          <ChevronDown
                            size={14}
                            className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
                            aria-hidden
                          />
                          <Link
                            href={`/admin/utilisateurs/${ownerId}/carte/${i.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium hover:text-accent-strong"
                          >
                            {i.card_name}
                          </Link>
                          {i.deleted_at && (
                            <span className="rounded bg-loss/15 px-1.5 py-0.5 text-[10px] font-semibold text-loss">
                              Corbeille
                            </span>
                          )}
                          {i.sold_at && (
                            <span className="rounded bg-gain/15 px-1.5 py-0.5 text-[10px] font-semibold text-gain">
                              Vendue
                            </span>
                          )}
                          {i.graded && (
                            <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-ink">
                              {i.grade ?? "Gradée"}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="hidden px-4 py-2.5 text-muted sm:table-cell">
                        {i.set_name} <span className="num text-faint">· {i.local_id}</span>
                      </td>
                      <td className="num px-4 py-2.5 text-right font-medium">
                        {formatEur(i.manual_price)}
                      </td>
                    </tr>
                    {open && (
                      <tr key={`${i.id}-d`} className="border-t border-edge/30 bg-raised/40">
                        <td colSpan={3} className="px-4 py-3">
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
                            <div><dt className="label-xs">État</dt><dd className="num">{i.condition}</dd></div>
                            <div><dt className="label-xs">Type</dt><dd>{i.card_type ?? "—"}</dd></div>
                            <div><dt className="label-xs">Langue</dt><dd>{i.language}</dd></div>
                            <div><dt className="label-xs">Quantité</dt><dd className="num">×{i.quantity}</dd></div>
                            <div><dt className="label-xs">Payé</dt><dd className="num">{formatEur(i.purchase_price)}</dd></div>
                            <div><dt className="label-xs">Estimé</dt><dd className="num">{formatEur(i.manual_price)}</dd></div>
                            <div><dt className="label-xs">Plus-value</dt><dd className="num">{gain == null ? "—" : formatEur(gain)}</dd></div>
                            <div><dt className="label-xs">Vendue</dt><dd className="num">{i.sold_at ? `${formatEur(i.sold_price)} · ${fmt(i.sold_at)}` : "—"}</dd></div>
                            <div className="col-span-2"><dt className="label-xs">TCGdex</dt><dd className="num truncate">{i.tcgdex_id}</dd></div>
                            <div><dt className="label-xs">Ajoutée</dt><dd className="num">{fmt(i.created_at)}</dd></div>
                          </dl>
                          {i.notes && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-muted">
                              <span className="label-xs">Notes</span>
                              <br />
                              {i.notes}
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Link
                              href={`/admin/utilisateurs/${ownerId}/carte/${i.id}`}
                              className="btn btn-ghost !py-1.5 text-[13px]"
                            >
                              <Eye size={13} aria-hidden /> Voir & modifier
                            </Link>
                            {i.deleted_at == null ? (
                              <button
                                type="button"
                                disabled={busy != null}
                                onClick={() =>
                                  act(i.id, () => adminSoftDeleteItem(i.id, ownerId), "Envoyée à la corbeille")
                                }
                                className="btn btn-ghost !py-1.5 text-[13px]"
                              >
                                <Trash2 size={13} aria-hidden /> Corbeille
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy != null}
                                onClick={() =>
                                  act(i.id, () => adminRestoreItem(i.id, ownerId), "Restaurée")
                                }
                                className="btn btn-ghost !py-1.5 text-[13px]"
                              >
                                <Undo2 size={13} aria-hidden /> Restaurer
                              </button>
                            )}
                            <ConfirmAction
                              action={async () => {
                                const r = await adminHardDeleteItem(i.id, ownerId);
                                setToast(r.ok ? { m: "Supprimée définitivement" } : { m: r.message ?? "Échec", t: "error" });
                                if (r.ok) router.refresh();
                              }}
                              fields={{}}
                              title="Supprimer définitivement ?"
                              message="La carte, ses photos, son historique et sa pré-gradation seront effacés. Sans retour."
                              trigger={<><X size={13} aria-hidden /> Supprimer</>}
                              triggerClassName="btn btn-ghost !py-1.5 text-[13px] !text-loss"
                            />
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </div>
  );
}
