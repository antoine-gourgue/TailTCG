"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Ban, ShieldOff, Trash2, Copy, Check } from "lucide-react";
import {
  adminDisableShare,
  adminSetBanned,
  adminRecoveryLink,
  adminDeleteUser,
} from "@/app/admin/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";

export function UserAdminActions({
  userId,
  email,
  shared,
  banned,
}: {
  userId: string;
  email: string;
  shared: boolean;
  banned: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ m: string; t?: "success" | "error" } | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string }>, okMsg: string) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    setToast(r.ok ? { m: okMsg } : { m: r.message ?? "Échec", t: "error" });
    if (r.ok) router.refresh();
  }

  async function genLink() {
    setBusy("link");
    const r = await adminRecoveryLink(email);
    setBusy(null);
    if (r.ok) setLink(r.link);
    else setToast({ m: r.message ?? "Échec", t: "error" });
  }

  return (
    <section className="panel p-5">
      <p className="label-xs mb-3">Actions administrateur</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy != null}
          onClick={genLink}
          className="btn btn-ghost"
        >
          <KeyRound size={15} aria-hidden />
          {busy === "link" ? "…" : "Lien de réinitialisation"}
        </button>

        {shared && (
          <button
            type="button"
            disabled={busy != null}
            onClick={() =>
              run("share", () => adminDisableShare(userId), "Partage coupé")
            }
            className="btn btn-ghost"
          >
            <ShieldOff size={15} aria-hidden />
            Couper le partage
          </button>
        )}

        <button
          type="button"
          disabled={busy != null}
          onClick={() =>
            run(
              "ban",
              () => adminSetBanned(userId, !banned),
              banned ? "Compte réactivé" : "Compte suspendu"
            )
          }
          className="btn btn-ghost"
        >
          <Ban size={15} aria-hidden />
          {banned ? "Réactiver le compte" : "Suspendre le compte"}
        </button>

        <ConfirmAction
          action={async () => {
            const r = await adminDeleteUser(userId);
            if (r.ok) router.push("/admin/utilisateurs");
            else setToast({ m: r.message ?? "Échec", t: "error" });
          }}
          fields={{}}
          title="Supprimer ce compte ?"
          message="Toutes ses données (cartes, classeurs, photos, pré-gradations…) seront définitivement effacées. Sans retour."
          confirmLabel="Supprimer le compte"
          trigger={
            <>
              <Trash2 size={15} aria-hidden />
              Supprimer le compte
            </>
          }
          triggerClassName="btn !bg-loss font-semibold !text-white hover:opacity-90"
        />
      </div>

      {link && (
        <div className="mt-3">
          <p className="label-xs mb-1.5">
            Lien de réinitialisation (usage unique, à transmettre)
          </p>
          <div className="flex gap-2">
            <input
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className="field flex-1 text-[13px]"
            />
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {}
              }}
              className="btn btn-primary"
            >
              {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />
      )}
    </section>
  );
}
