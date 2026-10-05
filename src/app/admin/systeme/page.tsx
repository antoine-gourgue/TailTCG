import { Cloud, Database, KeyRound, ShieldCheck } from "lucide-react";
import { TABLE_GROUPS, findOrphans, loadAdminData, loadAdminHealth, loadTableCounts } from "@/lib/admin-data";
import { clock, fmtInt, maskEmail, shortDate } from "@/lib/admin-format";
import { Badge, IconBox, PanelHead } from "@/components/admin/admin-ui";
import { JobsPanel, MaintenancePanel, type JobView } from "@/components/admin/system-panels";

const GROUP_COLOR = { scan: "var(--scan)", accent: "var(--accent-strong)", game: "var(--game)" } as const;

export default async function AdminSystem() {
  const [d, h, counts, orphans] = await Promise.all([loadAdminData(), loadAdminHealth(), loadTableCounts(), findOrphans().catch(() => null)]);

  const jobs: JobView[] = [
    {
      key: "cards",
      title: "Cotes des cartes",
      where: "Cron Vercel",
      when: "chaque jour, 06:00 UTC",
      last: h.cards.lastDay ? `Relevé du ${shortDate(h.cards.lastDay, h.now)}` : "Aucun relevé sur 14 jours",
      detail: `${fmtInt(h.cards.lastCount)} cartes · ${fmtInt(h.cards.total)} relevés en base`,
      status: h.cards.status,
      daily: h.cards.daily,
    },
    {
      key: "guide",
      title: "Guide Cardmarket",
      where: "Cron Vercel",
      when: "chaque jour, 03:15 UTC",
      last: h.guide.fileAt ? `Fichier du ${shortDate(h.guide.fileAt, h.now)} à ${clock(h.guide.fileAt)}` : "Jamais rafraîchi",
      detail: `${fmtInt(h.guide.rows)} produits · miroir rafraîchi ${h.guide.refreshedAt ? `le ${shortDate(h.guide.refreshedAt, h.now)} à ${clock(h.guide.refreshedAt)}` : "jamais"}`,
      status: h.guide.status,
    },
    {
      key: "catalog",
      title: "Catalogue, logos et scan",
      where: "GitHub Actions",
      when: "chaque jour, 04:17 UTC",
      last: h.catalog.lastSealedDay ? `Dernier passage le ${shortDate(h.catalog.lastSealedDay, h.now)}` : "Aucun passage récent",
      detail: `${fmtInt(h.catalog.cards)} cartes · ${fmtInt(h.catalog.sets)} extensions · ${fmtInt(h.catalog.jaSets)} JP`,
      status: h.catalog.status,
    },
    {
      key: "sealed",
      title: "Cotes des scellés",
      where: "GitHub Actions",
      when: "même passage",
      last: h.catalog.lastSealedDay ? `Relevé du ${shortDate(h.catalog.lastSealedDay, h.now)}` : "Aucun relevé",
      detail: `${fmtInt(h.catalog.sealedProducts)} produits · ${fmtInt(h.catalog.sealedWithCardmarket)} liés à Cardmarket · ${fmtInt(h.catalog.sealedSnapshots)} relevés`,
      status: h.catalog.status,
    },
  ];

  const max = Math.max(...counts.values(), 1);
  const logw = (v: number) => (Math.log10(v + 1) / Math.log10(max + 1)) * 100;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim()).filter(Boolean);
  const photos = d.accounts.reduce((n, a) => n + a.photos, 0);
  const unconfirmed = d.accounts.filter((a) => !a.confirmed).length;
  const pregradeVisuals = new Set(d.pregrades.map((g) => g.item_id)).size;

  return (
    <div className="flex flex-col gap-3.5">
      <JobsPanel jobs={jobs} />

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Base de données" hint="Lignes par table, échelle logarithmique" />
          {TABLE_GROUPS.map((g, gi) => (
            <div key={g.label} className={gi ? "mt-4" : ""}>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">{g.label}</p>
              {g.tables
                .map((t) => [t, counts.get(t) ?? 0] as const)
                .sort((a, b) => b[1] - a[1])
                .map(([t, v]) => (
                  <div key={t} className="grid grid-cols-[minmax(0,1fr)_80px_56px] items-center gap-3 py-1 sm:grid-cols-[minmax(0,190px)_minmax(0,1fr)_64px]">
                    <span className="num truncate text-[12px]">{t}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-raised">
                      <i className="block h-full rounded-full" style={{ width: `${v ? Math.max(2, logw(v)) : 0}%`, background: GROUP_COLOR[g.tone] }} />
                    </div>
                    <span className="num text-right text-[12px] font-semibold">{fmtInt(v)}</span>
                  </div>
                ))}
            </div>
          ))}
        </section>

        <div className="flex flex-col gap-3.5">
          <MaintenancePanel trash={h.trash} expiredCaptures={h.expiredCaptures} orphans={orphans} unconfirmed={unconfirmed} />
          <section className="panel p-5">
            <PanelHead title="Stockage" hint="Bucket card-photos" />
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Photos perso", photos],
                ["Hors catalogue", d.customCards.length],
                ["Pré-gradations", pregradeVisuals],
              ].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-raised px-3 py-2.5">
                  <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.12em] text-muted">{k}</p>
                  <p className="num mt-1 text-lg font-bold">{fmtInt(v as number)}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>

      <section className="panel p-5">
        <PanelHead title="Accès et configuration" hint="Vérifié côté serveur, aucune valeur secrète affichée" />
        <ul className="divide-y divide-ring">
          <li className="flex items-center gap-3 py-3 first:pt-0">
            <IconBox icon={ShieldCheck} tone="accent" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Administrateurs</p>
              <p className="num truncate text-xs text-faint">{admins.length ? admins.map(maskEmail).join(" · ") : "Aucun : le back-office serait fermé"}</p>
            </div>
            <Badge tone={admins.length ? "muted" : "ko"}>ADMIN_EMAILS · {admins.length}</Badge>
          </li>
          <li className="flex items-center gap-3 py-3">
            <IconBox icon={KeyRound} tone={process.env.CRON_SECRET ? "ok" : "ko"} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Secret des crons</p>
              <p className="text-xs text-faint">CRON_SECRET, nécessaire pour les relancer d&apos;ici</p>
            </div>
            <Badge tone={process.env.CRON_SECRET ? "ok" : "ko"}>{process.env.CRON_SECRET ? "Configuré" : "Absent"}</Badge>
          </li>
          <li className="flex items-center gap-3 py-3">
            <IconBox icon={Database} tone={process.env.SUPABASE_SECRET_KEY ? "ok" : "ko"} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Clé service Supabase</p>
              <p className="text-xs text-faint">SUPABASE_SECRET_KEY, utilisée par le back-office et les crons</p>
            </div>
            <Badge tone={process.env.SUPABASE_SECRET_KEY ? "ok" : "ko"}>{process.env.SUPABASE_SECRET_KEY ? "Configurée" : "Absente"}</Badge>
          </li>
          <li className="flex items-center gap-3 py-3 last:pb-0">
            <IconBox icon={Cloud} tone="muted" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Région d&apos;exécution</p>
              <p className="text-xs text-faint">{process.env.VERCEL_REGION ? "Fonctions Vercel" : "Serveur local"}</p>
            </div>
            <span className="num rounded-md bg-raised px-2 py-0.5 text-[11.5px] text-muted">{process.env.VERCEL_REGION ?? "local"}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
