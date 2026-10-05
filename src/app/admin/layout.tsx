import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { loadAdminData, loadAdminHealth } from "@/lib/admin-data";
import { shortDate } from "@/lib/admin-format";
import { AppShell } from "@/components/app-shell";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { Dot } from "@/components/admin/admin-ui";

export const metadata = { title: "Back-office — TailTCG" };

const WEEK = 7 * 86_400_000;

// Verrou global du back-office + en-tête commun (chiffres et état des tâches)
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) notFound();

  const [data, health] = await Promise.all([loadAdminData(), loadAdminHealth()]);
  const active7 = data.accounts.filter((a) => a.lastActivity && data.now - new Date(a.lastActivity).getTime() <= WEEK).length;
  const lastSignup = data.accounts.reduce<string | null>((m, a) => (a.createdAt && (!m || a.createdAt > m) ? a.createdAt : m), null);
  const n = data.accounts.length;

  return (
    <AppShell>
      <main className="page py-8">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-strong">
              <ShieldCheck size={13} aria-hidden />
              Administration
            </p>
            <h1 className="display mt-1 text-[28px] font-bold tracking-tight sm:text-3xl">Back-office</h1>
            <p className="mt-1 text-sm text-muted">
              {n} compte{n > 1 ? "s" : ""} · {active7} actif{active7 > 1 ? "s" : ""} cette semaine
              {lastSignup && ` · dernière inscription le ${shortDate(lastSignup, data.now)}`}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-surface px-3.5 py-2 text-[13px] font-medium ring-1 ring-ring">
            <Dot tone={health.jobsLate === 0 ? "ok" : "warn"} />
            {health.jobsLate === 0 ? "Tâches de nuit à jour" : `${health.jobsLate} tâche${health.jobsLate > 1 ? "s" : ""} en retard`}
          </span>
        </div>
        <AdminTabs users={n} systemWarn={health.jobsLate > 0 || health.expiredCaptures > 0} />
        {children}
      </main>
    </AppShell>
  );
}
