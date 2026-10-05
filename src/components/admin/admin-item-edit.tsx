"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Save, Trash2, TriangleAlert } from "lucide-react";
import { CONDITIONS, CARD_TYPES, LANGUAGES } from "@/lib/domain";
import { adminHardDeleteItem, adminRestoreItem, adminSoftDeleteItem, adminUpdateItem } from "@/app/admin/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";
import { IconBox, PanelHead } from "@/components/admin/admin-ui";

type SourceOpt = { id: string; name: string };
type ToastState = { m: string; t?: "success" | "error" } | null;

/** Édition admin d'un exemplaire : état et langue en puces, le reste en champs */
export function AdminItemEdit({
  itemId,
  ownerId,
  sources,
  defaults,
}: {
  itemId: string;
  ownerId: string;
  sources: SourceOpt[];
  defaults: {
    condition: string;
    quantity: number;
    purchase_price: number | null;
    manual_price: number | null;
    language: string;
    card_type: string | null;
    graded: boolean;
    grade: string | null;
    source_id: string | null;
    notes: string | null;
  };
}) {
  const router = useRouter();
  const [f, setF] = useState(defaults);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  async function save() {
    setSaving(true);
    const r = await adminUpdateItem(itemId, ownerId, {
      condition: f.condition,
      quantity: Math.max(1, Number(f.quantity) || 1),
      purchase_price: f.purchase_price,
      manual_price: f.manual_price,
      language: f.language,
      card_type: f.card_type,
      graded: f.graded,
      grade: f.graded ? f.grade : null,
      source_id: f.source_id,
      notes: f.notes,
    });
    setSaving(false);
    setToast(r.ok ? { m: "Carte mise à jour" } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const label = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-muted";

  return (
    <section className="panel p-5">
      <PanelHead title="Modifier la carte" hint="Les changements s'appliquent directement à la collection du compte." />
      <div className="flex flex-col gap-4">
        <div>
          <span className={label}>État</span>
          <div className="flex flex-wrap gap-1.5">
            {CONDITIONS.map((c) => (
              <button key={c.code} type="button" onClick={() => setF({ ...f, condition: c.code })} data-on={f.condition === c.code} className="seg rounded-full px-3 py-1.5 text-xs font-medium" title={c.label}>
                <span className="num font-semibold">{c.code}</span> <span className="text-muted">{c.label}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Langue</span>
          <div className="flex flex-wrap gap-1.5">
            {LANGUAGES.map((l) => (
              <button key={l} type="button" onClick={() => setF({ ...f, language: l })} data-on={f.language === l} className="seg num rounded-full px-3 py-1.5 text-xs font-semibold">
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="min-w-0">
            <span className={label}>Quantité</span>
            <input type="number" min={1} value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} className="field num" />
          </label>
          <label className="min-w-0">
            <span className={label}>Payé (€)</span>
            <input type="text" inputMode="decimal" defaultValue={f.purchase_price ?? ""} onChange={(e) => setF({ ...f, purchase_price: num(e.target.value) })} placeholder="—" className="field num" />
          </label>
          <label className="min-w-0">
            <span className={label}>Valeur saisie (€)</span>
            <input type="text" inputMode="decimal" defaultValue={f.manual_price ?? ""} onChange={(e) => setF({ ...f, manual_price: num(e.target.value) })} placeholder="—" className="field num" />
          </label>
          <label className="min-w-0">
            <span className={label}>Variante</span>
            <select value={f.card_type ?? ""} onChange={(e) => setF({ ...f, card_type: e.target.value || null })} className="field">
              <option value="">—</option>
              {CARD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 min-w-0">
            <span className={label}>Boutique ou site</span>
            <select value={f.source_id ?? ""} onChange={(e) => setF({ ...f, source_id: e.target.value || null })} className="field">
              <option value="">—</option>
              {sources.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 min-w-0">
            <span className={label}>Gradée</span>
            <span className="flex items-center gap-2">
              <button type="button" onClick={() => setF({ ...f, graded: !f.graded })} data-on={f.graded} className="seg shrink-0 rounded-full px-3 py-2 text-xs font-medium">
                {f.graded ? "Oui" : "Non"}
              </button>
              {f.graded && <input type="text" defaultValue={f.grade ?? ""} onChange={(e) => setF({ ...f, grade: e.target.value || null })} placeholder="PSA 9, PCA 10…" className="field min-w-0" />}
            </span>
          </label>
        </div>
        <label className="block">
          <span className={label}>Notes</span>
          <textarea defaultValue={f.notes ?? ""} onChange={(e) => setF({ ...f, notes: e.target.value || null })} rows={2} className="field" />
        </label>
        <div className="flex justify-end">
          <button type="button" onClick={save} disabled={saving} className="btn btn-primary shadow-lg shadow-accent/30">
            <Save size={15} aria-hidden />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </section>
  );
}

/** Corbeille, restauration, suppression définitive d'un exemplaire */
export function ItemDangerZone({ itemId, ownerId, trash }: { itemId: string; ownerId: string; trash: boolean }) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState>(null);
  const row = "flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0";
  return (
    <section className="panel p-5 ring-1 ring-loss/25" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--loss) 6%, var(--surface)), var(--surface) 70%)" }}>
      <PanelHead
        title={
          <span className="flex items-center gap-2 text-loss">
            <TriangleAlert size={16} aria-hidden /> Zone sensible
          </span>
        }
        hint="Chaque action demande une confirmation."
      />
      <ul className="divide-y divide-ring">
        <li className={row}>
          <IconBox icon={trash ? RotateCcw : Trash2} tone="warn" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{trash ? "Restaurer la carte" : "Mettre à la corbeille"}</p>
            <p className="text-xs text-faint">{trash ? "Elle revient dans la collection du compte." : "Le compte peut encore la restaurer depuis sa corbeille."}</p>
          </div>
          <ConfirmAction
            action={async () => {
              const r = trash ? await adminRestoreItem(itemId, ownerId) : await adminSoftDeleteItem(itemId, ownerId);
              setToast(r.ok ? { m: trash ? "Carte restaurée" : "Carte mise à la corbeille" } : { m: r.message ?? "Échec", t: "error" });
              if (r.ok) router.refresh();
            }}
            fields={{}}
            title={trash ? "Restaurer cette carte ?" : "Mettre cette carte à la corbeille ?"}
            message={trash ? "Elle réapparaît dans la collection du compte." : "Elle disparaît de la collection du compte, qui peut la restaurer."}
            confirmLabel={trash ? "Restaurer" : "Mettre à la corbeille"}
            trigger={trash ? "Restaurer" : "Corbeille"}
            triggerClassName="btn btn-ghost !px-3 !py-1.5 text-xs"
          />
        </li>
        <li className={row}>
          <IconBox icon={Trash2} tone="ko" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Supprimer définitivement</p>
            <p className="text-xs text-faint">Efface la carte, ses photos, sa pré-gradation et son historique. Sans retour.</p>
          </div>
          <ConfirmAction
            action={async () => {
              const r = await adminHardDeleteItem(itemId, ownerId);
              if (r.ok) router.push(`/admin/utilisateurs/${ownerId}`);
              else setToast({ m: r.message ?? "Échec", t: "error" });
            }}
            fields={{}}
            title="Supprimer définitivement cette carte ?"
            message="La carte, ses photos, sa pré-gradation et son historique de valeur seront effacés. Sans retour."
            confirmLabel="Supprimer"
            trigger="Supprimer"
            triggerClassName="btn !px-3 !py-1.5 text-xs font-semibold !text-loss ring-1 ring-loss/35 bg-loss/10"
          />
        </li>
      </ul>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </section>
  );
}
