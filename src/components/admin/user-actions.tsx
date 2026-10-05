"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Copy, KeyRound, Share2, ShieldOff, Trash2, TriangleAlert } from "lucide-react";
import { adminDeleteUser, adminDisableShare, adminRecoveryLink, adminSetBanned } from "@/app/admin/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Sheet } from "@/components/sheet";
import { Toast } from "@/components/toast";
import { IconBox, PanelHead } from "@/components/admin/admin-ui";

/** Lien de réinitialisation du mot de passe, à transmettre à la main (usage unique) */
export function ResetLinkButton({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setOpen(true);
    if (link) return;
    setBusy(true);
    setError(null);
    const r = await adminRecoveryLink(email);
    setBusy(false);
    if (r.ok) setLink(r.link);
    else setError(r.message);
  }

  return (
    <>
      <button type="button" onClick={generate} className="btn btn-ghost">
        <KeyRound size={14} aria-hidden />
        Lien de réinitialisation
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Lien de réinitialisation" description="À usage unique. Il ouvre la page de nouveau mot de passe, sans connecter personne avant.">
        {busy && <p className="text-sm text-muted">Génération…</p>}
        {error && <p className="text-sm text-loss">{error}</p>}
        {link && (
          <div className="flex flex-col gap-3">
            <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} className="field num text-[12px]" />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  // presse-papiers refusé : le champ reste sélectionnable
                }
              }}
              className="btn btn-primary"
            >
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? "Copié" : "Copier le lien"}
            </button>
          </div>
        )}
      </Sheet>
    </>
  );
}

/** Actions qui touchent le compte lui-même, chacune confirmée */
export function DangerZone({ userId, shared, banned, self }: { userId: string; shared: boolean; banned: boolean; self: boolean }) {
  const router = useRouter();
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; message?: string }>, ok: string) {
    const r = await fn();
    setToast(r.ok ? { m: ok } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  const row = "flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0";
  return (
    <section className="panel p-5 ring-1 ring-loss/25" style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--loss) 6%, var(--surface)), var(--surface) 70%)" }}>
      <PanelHead
        title={
          <span className="flex items-center gap-2 text-loss">
            <TriangleAlert size={16} aria-hidden /> Zone sensible
          </span>
        }
        hint="Ces actions touchent le compte lui-même. Chacune demande une confirmation."
      />
      <ul className="divide-y divide-ring">
        <li className={row}>
          <IconBox icon={Share2} tone={shared ? "accent" : "off"} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Couper la vitrine</p>
            <p className="text-xs text-faint">{shared ? "Le lien public cesse de fonctionner. Le compte pourra en créer un autre." : "Aucune vitrine publique pour ce compte."}</p>
          </div>
          <ConfirmAction
            action={() => run(() => adminDisableShare(userId), "Vitrine coupée")}
            fields={{}}
            title="Couper la vitrine ?"
            message="Le lien public actuel ne fonctionnera plus."
            confirmLabel="Couper"
            trigger={
              <>
                <ShieldOff size={13} aria-hidden /> Couper
              </>
            }
            triggerClassName={`btn btn-ghost !px-3 !py-1.5 text-xs ${shared ? "" : "pointer-events-none opacity-40"}`}
          />
        </li>
        <li className={row}>
          <IconBox icon={Ban} tone="warn" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{banned ? "Réactiver le compte" : "Suspendre le compte"}</p>
            <p className="text-xs text-faint">{banned ? "La connexion redevient possible." : "Bloque la connexion, garde toutes les données. Réversible."}</p>
          </div>
          <ConfirmAction
            action={() => run(() => adminSetBanned(userId, !banned), banned ? "Compte réactivé" : "Compte suspendu")}
            fields={{}}
            title={banned ? "Réactiver ce compte ?" : "Suspendre ce compte ?"}
            message={banned ? "Le compte pourra de nouveau se connecter." : "Le compte ne pourra plus se connecter tant qu'il est suspendu. Ses données restent intactes."}
            confirmLabel={banned ? "Réactiver" : "Suspendre"}
            trigger={banned ? "Réactiver" : "Suspendre"}
            triggerClassName={`btn btn-ghost !px-3 !py-1.5 text-xs ${self ? "pointer-events-none opacity-40" : ""}`}
          />
        </li>
        <li className={row}>
          <IconBox icon={Trash2} tone="ko" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Supprimer le compte</p>
            <p className="text-xs text-faint">{self ? "Impossible sur ton propre compte." : "Efface cartes, scellés, classeurs, jeu, captures et photos. Sans retour."}</p>
          </div>
          <ConfirmAction
            action={async () => {
              const r = await adminDeleteUser(userId);
              if (r.ok) router.push("/admin/utilisateurs");
              else setToast({ m: r.message ?? "Échec", t: "error" });
            }}
            fields={{}}
            title="Supprimer ce compte ?"
            message="Toutes ses données seront définitivement effacées : cartes, scellés, classeurs, jeu, captures, photos. Sans retour."
            confirmLabel="Supprimer le compte"
            trigger="Supprimer"
            triggerClassName={`btn !px-3 !py-1.5 text-xs font-semibold !text-loss ring-1 ring-loss/35 bg-loss/10 ${self ? "pointer-events-none opacity-40" : ""}`}
          />
        </li>
      </ul>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </section>
  );
}
