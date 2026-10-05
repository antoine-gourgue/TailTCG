"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, ChartLine, Check, CircleCheck, Database, Euro, ExternalLink, MailCheck, RefreshCw, Timer, Trash2, Unplug } from "lucide-react";
import { adminPurgeExpiredCaptures, adminPurgeOrphans, adminPurgeTrash, adminRunCron, adminRunGuide } from "@/app/admin/actions";
import { ConfirmAction } from "@/components/confirm-action";
import { Toast } from "@/components/toast";
import { Badge, Dot, IconBox, PanelHead, Spark, type Tone } from "@/components/admin/admin-ui";

export type JobView = {
  key: "cards" | "guide" | "catalog" | "sealed";
  title: string;
  where: string;
  when: string;
  last: string;
  detail: string;
  status: "ok" | "late" | "unknown";
  daily?: number[];
};

const JOB_ICON = { cards: ChartLine, guide: Euro, catalog: Database, sealed: Boxes } as const;
const JOB_TONE: Record<JobView["key"], Tone> = { cards: "ok", guide: "ok", catalog: "scan", sealed: "sealed" };
const WORKFLOW_URL = "https://github.com/antoine-gourgue/TailTCG/actions/workflows/playable-sets.yml";

type ToastState = { m: string; t?: "success" | "error" } | null;

/** Tâches planifiées : état, dernier passage, relance à la main */
export function JobsPanel({ jobs }: { jobs: JobView[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const late = jobs.filter((j) => j.status !== "ok").length;

  async function run(key: string, fn: () => Promise<{ ok: true; summary: string } | { ok: false; message: string }>) {
    setBusy(key);
    const r = await fn();
    setBusy(null);
    setToast(r.ok ? { m: r.summary } : { m: r.message, t: "error" });
    if (r.ok) router.refresh();
  }

  return (
    <section className="panel p-5">
      <PanelHead title="Tâches planifiées" hint="Ce qui tourne chaque nuit, et quand ça a tourné pour la dernière fois">
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-raised px-3 py-1.5 text-xs font-medium">
          <Dot tone={late ? "warn" : "ok"} />
          {late ? `${late} en retard` : `${jobs.length} sur ${jobs.length} à jour`}
        </span>
      </PanelHead>
      <ul className="divide-y divide-ring">
        {jobs.map((j) => (
          <li key={j.key} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.3fr)_130px_120px]">
            <IconBox icon={JOB_ICON[j.key]} tone={j.status === "ok" ? JOB_TONE[j.key] : "warn"} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {j.title}
                {j.status === "ok" ? (
                  <Badge tone="ok">
                    <CircleCheck size={11} aria-hidden /> À jour
                  </Badge>
                ) : (
                  <Badge tone="warn">{j.status === "late" ? "En retard" : "Inconnu"}</Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-faint">
                {j.where} · {j.when}
              </p>
            </div>
            <div className="col-start-2 min-w-0 md:col-start-auto">
              <p className="text-[12.5px]">{j.last}</p>
              <p className="num mt-0.5 truncate text-[11px] text-faint">{j.detail}</p>
            </div>
            <div className="hidden md:block">{j.daily && <Spark values={j.daily} color="var(--gain)" className="h-7 w-[130px]" />}</div>
            <div className="col-start-2 flex md:col-start-auto md:justify-end">
              {j.key === "cards" && (
                <button type="button" disabled={busy != null} onClick={() => run("cards", adminRunCron)} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                  <RefreshCw size={13} className={busy === "cards" ? "animate-spin" : ""} aria-hidden /> {busy === "cards" ? "En cours…" : "Lancer"}
                </button>
              )}
              {j.key === "guide" && (
                <button type="button" disabled={busy != null} onClick={() => run("guide", adminRunGuide)} className="btn btn-ghost !px-3 !py-1.5 text-xs">
                  <RefreshCw size={13} className={busy === "guide" ? "animate-spin" : ""} aria-hidden /> {busy === "guide" ? "En cours…" : "Lancer"}
                </button>
              )}
              {(j.key === "catalog" || j.key === "sealed") && (
                <a href={WORKFLOW_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost whitespace-nowrap !px-3 !py-1.5 text-xs">
                  <ExternalLink size={13} aria-hidden /> Voir le run
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </section>
  );
}

/** Ménage : corbeille, captures expirées, lignes orphelines, emails non confirmés */
export function MaintenancePanel({ trash, expiredCaptures, orphans, unconfirmed }: { trash: number; expiredCaptures: number; orphans: { table: string; rows: number }[] | null; unconfirmed: number }) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastState>(null);
  const orphanRows = orphans?.reduce((n, o) => n + o.rows, 0) ?? 0;

  async function run(fn: () => Promise<{ ok: true; count: number } | { ok: false; message: string }>, done: (n: number) => string) {
    const r = await fn();
    setToast(r.ok ? { m: done(r.count) } : { m: r.message, t: "error" });
    if (r.ok) router.refresh();
  }

  const clean = (
    <Badge tone="ok">
      <Check size={11} aria-hidden /> Propre
    </Badge>
  );
  const row = "flex items-center gap-3 py-3 first:pt-0 last:pb-0";
  return (
    <section className="panel p-5">
      <PanelHead title="Maintenance" hint="Le ménage à faire de temps en temps" />
      <ul className="divide-y divide-ring">
        <li className={row}>
          <IconBox icon={Trash2} tone={trash ? "warn" : "ok"} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Corbeille</p>
            <p className="text-xs text-faint">{trash ? `${trash.toLocaleString("fr-FR")} carte${trash > 1 ? "s" : ""} supprimée${trash > 1 ? "s" : ""} par leurs propriétaires` : "Vide"}</p>
          </div>
          {trash ? (
            <ConfirmAction
              action={() => run(adminPurgeTrash, (n) => `${n} carte${n > 1 ? "s" : ""} définitivement supprimée${n > 1 ? "s" : ""}`)}
              fields={{}}
              title="Vider la corbeille de tous les comptes ?"
              message={`${trash} carte(s) seront définitivement effacées, avec leurs photos et leurs historiques. Les comptes ne pourront plus les restaurer.`}
              confirmLabel="Vider la corbeille"
              trigger="Vider"
              triggerClassName="btn !px-3 !py-1.5 text-xs font-semibold !text-loss ring-1 ring-loss/35 bg-loss/10"
            />
          ) : (
            clean
          )}
        </li>
        <li className={row}>
          <IconBox icon={Timer} tone={expiredCaptures ? "warn" : "ok"} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Captures expirées</p>
            <p className="text-xs text-faint">{expiredCaptures ? `${expiredCaptures} session${expiredCaptures > 1 ? "s" : ""} téléphone jamais terminée${expiredCaptures > 1 ? "s" : ""}` : "Aucune session en souffrance"}</p>
          </div>
          {expiredCaptures ? (
            <ConfirmAction
              action={() => run(adminPurgeExpiredCaptures, (n) => `${n} session${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}`)}
              fields={{}}
              title="Nettoyer les captures expirées ?"
              message="Les sessions de capture expirées sans avoir abouti sont supprimées, avec leurs scans en attente. Les cartes déjà ajoutées ne bougent pas."
              confirmLabel="Nettoyer"
              trigger="Nettoyer"
              triggerClassName="btn btn-ghost !px-3 !py-1.5 text-xs"
            />
          ) : (
            clean
          )}
        </li>
        <li className={row}>
          <IconBox icon={Unplug} tone={orphanRows ? "warn" : "ok"} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Lignes orphelines</p>
            <p className="truncate text-xs text-faint">
              {orphans == null ? "Vérification impossible pour l'instant" : orphanRows ? `${orphanRows} ligne${orphanRows > 1 ? "s" : ""} sans compte · ${orphans.map((o) => o.table).join(", ")}` : "Aucune ligne sans propriétaire"}
            </p>
          </div>
          {orphanRows ? (
            <ConfirmAction
              action={() => run(adminPurgeOrphans, (n) => `${n} ligne${n > 1 ? "s" : ""} orpheline${n > 1 ? "s" : ""} supprimée${n > 1 ? "s" : ""}`)}
              fields={{}}
              title="Supprimer les lignes orphelines ?"
              message={`${orphanRows} ligne(s) appartenant à des comptes qui n'existent plus seront effacées. Les données des comptes existants ne sont pas touchées.`}
              confirmLabel="Supprimer"
              trigger="Purger"
              triggerClassName="btn !px-3 !py-1.5 text-xs font-semibold !text-loss ring-1 ring-loss/35 bg-loss/10"
            />
          ) : orphans == null ? null : (
            clean
          )}
        </li>
        <li className={row}>
          <IconBox icon={MailCheck} tone={unconfirmed ? "warn" : "ok"} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Emails non confirmés</p>
            <p className="text-xs text-faint">{unconfirmed ? `${unconfirmed} compte${unconfirmed > 1 ? "s" : ""} en attente de confirmation` : "Tous les comptes sont confirmés"}</p>
          </div>
          <Badge tone={unconfirmed ? "warn" : "ok"}>{unconfirmed ? unconfirmed : <Check size={11} aria-hidden />}</Badge>
        </li>
      </ul>
      {toast && <Toast message={toast.m} tone={toast.t} onDone={() => setToast(null)} />}
    </section>
  );
}
