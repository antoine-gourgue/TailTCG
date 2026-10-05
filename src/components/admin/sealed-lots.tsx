"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, X } from "lucide-react";
import { adminDeleteSealedLot, adminUpdateSealedLot } from "@/app/admin/actions";
import { formatEur } from "@/lib/domain";
import { shortDate } from "@/lib/admin-format";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";
import { PanelHead } from "@/components/admin/admin-ui";

export type SealedLotRow = {
  id: string;
  quantity: number;
  purchase_price: number | null;
  purchase_date: string | null;
  manual_price: number | null;
  created_at: string | null;
};

type ToastState = { m: string; t?: "success" | "error" } | null;

/** Lots d'un produit chez un compte : ce que chacun a coûté, vaut, et son édition */
export function SealedLots({ lots, ownerId, productId, cote, now }: { lots: SealedLotRow[]; ownerId: string; productId: number; cote: number | null; now: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const qty = lots.reduce((n, l) => n + l.quantity, 0);
  const paid = lots.reduce((n, l) => n + (l.purchase_price ?? 0) * l.quantity, 0);

  return (
    <section className="panel p-5">
      <PanelHead title="Lots" hint={`${qty} exemplaire${qty > 1 ? "s" : ""} en ${lots.length} lot${lots.length > 1 ? "s" : ""} · payé ${formatEur(paid)}`} />
      <ul className="divide-y divide-ring">
        {lots.map((l) => {
          const unit = l.manual_price ?? cote;
          const value = unit != null ? unit * l.quantity : null;
          const lotPaid = l.purchase_price != null ? l.purchase_price * l.quantity : null;
          const gain = value != null && lotPaid != null ? value - lotPaid : null;
          return (
            <li key={l.id} className="py-3 first:pt-0 last:pb-0">
              {editing === l.id ? (
                <LotForm
                  lot={l}
                  onCancel={() => setEditing(null)}
                  onSave={async (fields) => {
                    const r = await adminUpdateSealedLot(l.id, ownerId, productId, fields);
                    setToast(r.ok ? { m: "Lot mis à jour" } : { m: r.message ?? "Échec", t: "error" });
                    if (r.ok) {
                      setEditing(null);
                      router.refresh();
                    }
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1 basis-40">
                    <p className="num font-semibold">
                      {l.quantity} × {l.purchase_price != null ? formatEur(l.purchase_price) : <span className="font-normal text-faint">prix inconnu</span>}
                    </p>
                    <p className="text-xs text-faint">
                      {l.purchase_date ? `acheté le ${shortDate(l.purchase_date, now)}` : "date d'achat inconnue"} · ajouté le {shortDate(l.created_at, now)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num font-semibold">
                      {value != null ? formatEur(value) : "—"}
                      {l.manual_price != null && <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 py-px align-middle text-[9.5px] font-semibold text-accent-strong">saisie</span>}
                    </p>
                    <p className={`num text-xs font-semibold ${gain == null ? "text-faint" : gain >= 0 ? "text-gain" : "text-loss"}`}>{gain != null ? `${gain >= 0 ? "+" : ""}${formatEur(gain)}` : "—"}</p>
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setEditing(l.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-raised hover:text-foreground" aria-label="Modifier le lot" title="Modifier">
                      <Pencil size={14} aria-hidden />
                    </button>
                    <ConfirmAction
                      action={async () => {
                        const r = await adminDeleteSealedLot(l.id, ownerId, productId);
                        setToast(r.ok ? { m: "Lot supprimé" } : { m: r.message ?? "Échec", t: "error" });
                        if (r.ok) router.refresh();
                      }}
                      fields={{}}
                      title="Supprimer ce lot ?"
                      message={`${l.quantity} exemplaire(s) disparaissent de la collection du compte.`}
                      confirmLabel="Supprimer"
                      trigger={<Trash2 size={14} aria-hidden />}
                      triggerClassName="flex h-8 w-8 items-center justify-center rounded-lg text-faint transition hover:bg-raised hover:text-loss"
                      triggerAriaLabel="Supprimer le lot"
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </section>
  );
}

function LotForm({
  lot,
  onCancel,
  onSave,
}: {
  lot: SealedLotRow;
  onCancel: () => void;
  onSave: (f: { quantity: number; purchase_price: number | null; purchase_date: string | null; manual_price: number | null }) => Promise<void>;
}) {
  const [quantity, setQuantity] = useState(String(lot.quantity));
  const [paid, setPaid] = useState(lot.purchase_price != null ? String(lot.purchase_price).replace(".", ",") : "");
  const [date, setDate] = useState(lot.purchase_date ?? "");
  const [manual, setManual] = useState(lot.manual_price != null ? String(lot.manual_price).replace(".", ",") : "");
  const [saving, setSaving] = useState(false);
  const money = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const label = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted";
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave({ quantity: Math.max(1, Math.floor(Number(quantity) || 1)), purchase_price: money(paid), purchase_date: date || null, manual_price: money(manual) });
        setSaving(false);
      }}
      className="rounded-2xl bg-raised/60 p-3 ring-1 ring-ring"
    >
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <label className="min-w-0">
          <span className={label}>Quantité</span>
          <input type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} className="field num" />
        </label>
        <label className="min-w-0">
          <span className={label}>Payé (€ / unité)</span>
          <input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value)} placeholder="—" className="field num" />
        </label>
        <label className="min-w-0">
          <span className={label}>Date d&apos;achat</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
        </label>
        <label className="min-w-0">
          <span className={label}>Valeur saisie (€)</span>
          <input inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="cote" className="field num" />
        </label>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn btn-ghost !px-3 !py-1.5 text-xs">
          <X size={13} aria-hidden /> Annuler
        </button>
        <button type="submit" disabled={saving} className="btn btn-primary !px-3 !py-1.5 text-xs">
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </form>
  );
}
