import { loadAdminData } from "@/lib/admin-data";
import { shortDate } from "@/lib/admin-format";
import { Avatar, PanelHead } from "@/components/admin/admin-ui";
import { UsersBrowser } from "@/components/admin/users-browser";

const DAY = 86_400_000;

export default async function AdminUsers() {
  const d = await loadAdminData();
  const bySignup = [...d.accounts].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

  // Frise : du 1er du mois de la première inscription à aujourd'hui
  const first = bySignup[0]?.createdAt ? new Date(bySignup[0].createdAt) : new Date(d.now);
  const start = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  const span = Math.max(DAY, d.now - start);
  const pos = (t: number) => ((t - start) / span) * 100;
  const ticks = Array.from({ length: 5 }, (_, k) => start + (span * k) / 4);
  // Les comptes proches dans le temps montent d'un étage pour ne pas se chevaucher
  const pins: { a: (typeof bySignup)[number]; x: number; level: number }[] = [];
  for (const a of bySignup) {
    const x = pos(a.createdAt ? new Date(a.createdAt).getTime() : d.now);
    const before = pins[pins.length - 1];
    pins.push({ a, x, level: before && x - before.x < 12 ? (before.level + 1) % 4 : 0 });
  }
  const confirmed = d.accounts.filter((a) => a.confirmed).length;
  const shared = d.accounts.filter((a) => a.shared).length;

  return (
    <div className="flex flex-col gap-5">
      <section className="panel p-5">
        <PanelHead title="Arrivées" hint="Chaque compte à sa date d'inscription">
          <span className="num hidden text-xs text-faint sm:block">
            {d.accounts.length} comptes · {confirmed} emails confirmés · {shared} vitrine{shared > 1 ? "s" : ""}
          </span>
        </PanelHead>
        <div className="relative mx-6 hidden h-[150px] md:block">
          <div className="absolute inset-x-0 top-[116px] h-0.5 rounded bg-raised" />
          {ticks.map((t) => (
            <span key={t} className="num absolute top-[126px] -translate-x-1/2 whitespace-nowrap text-[10.5px] text-faint" style={{ left: `${pos(t)}%` }}>
              {shortDate(new Date(t).toISOString(), d.now)}
            </span>
          ))}
          {pins.map(({ a, x, level: l }) => (
            <div
              key={a.id}
              className={`absolute bottom-[34px] flex flex-col ${x > 78 ? "items-end" : "items-start"}`}
              style={x > 78 ? { right: `${100 - x}%`, top: l * 30 } : { left: `${x}%`, top: l * 30 }}
            >
              <span className={`${x > 78 ? "translate-x-[13px]" : "-translate-x-[13px]"} inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-raised py-[3px] pl-[3px] pr-2.5 text-[11.5px] font-semibold`}>
                <Avatar name={a.name ?? a.email} hue={a.hue} size="sm" />
                {a.name ?? a.email}
              </span>
              <span className="w-0.5 flex-1 bg-edge" />
            </div>
          ))}
        </div>
        <ul className="divide-y divide-ring md:hidden">
          {bySignup.map((a) => (
            <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0">
              <Avatar name={a.name ?? a.email} hue={a.hue} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{a.name ?? a.email}</span>
              <span className="num text-xs text-faint">{shortDate(a.createdAt, d.now)}</span>
            </li>
          ))}
        </ul>
      </section>
      <UsersBrowser accounts={d.accounts} now={d.now} />
    </div>
  );
}
