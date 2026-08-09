import { loadAdminBundle, dailyCounts, dayWindow } from "@/lib/admin-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { MiniBars } from "@/components/admin/mini-bars";
import { SystemActions } from "@/components/admin/system-actions";

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleDateString("fr-FR") : "—";
}

export default async function AdminSystem() {
  const b = await loadAdminBundle();
  const db = createAdminClient();

  // Comptes exacts par table
  const tables = [
    "items",
    "item_photos",
    "item_gradings",
    "item_value_history",
    "binders",
    "binder_items",
    "sources",
    "wishlist",
    "custom_cards",
    "user_settings",
    "price_snapshots",
  ] as const;
  const counts = await Promise.all(
    tables.map(async (t) => {
      const { count } = await db.from(t).select("*", { count: "exact", head: true });
      return { table: t, count: count ?? 0 };
    })
  );

  // Fraîcheur du cron : y a-t-il un relevé aujourd'hui / hier ?
  const last = b.snapshots[0]?.captured_at ?? null;
  const { today, yesterday } = dayWindow();
  const cronOk = last === today || last === yesterday;

  // Volume de relevés par jour (14 j)
  const snapDaily = dailyCounts(
    b.snapshots.map((s) => s.captured_at),
    14,
    today
  );

  const envAdmins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-8">
      <SystemActions trashCount={b.totals.deleted} />

      {/* Cron */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <div className="mb-2 flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${cronOk ? "bg-gain" : "bg-loss"}`}
              aria-hidden
            />
            <p className="label-xs">Cron des cotes</p>
          </div>
          <p className="text-sm">
            {cronOk ? "À jour" : "En retard"} — dernier relevé{" "}
            <span className="num">{fmt(last)}</span>
          </p>
          <p className="mt-1 text-xs text-faint">
            <span className="num">{b.snapshotCount}</span> relevés au total
          </p>
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-3">Relevés du cron · 14 jours</p>
          <MiniBars data={snapDaily} height={80} everyLabel={3} />
        </div>
      </section>

      {/* Comptes par table */}
      <section>
        <h3 className="display mb-3 text-lg font-semibold">Base de données</h3>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {counts.map((c, i) => (
                <tr key={c.table} className={i > 0 ? "border-t border-edge/50" : ""}>
                  <td className="num px-4 py-2.5 text-muted">{c.table}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Stockage & config */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-5">
          <p className="label-xs mb-2">Stockage (bucket card-photos)</p>
          <p className="text-sm text-muted">
            <span className="num font-bold text-foreground">{b.totals.photos}</span>{" "}
            photos perso ·{" "}
            <span className="num font-bold text-foreground">{b.totals.customCards}</span>{" "}
            visuels de cartes hors catalogue · plus les visuels de
            pré-gradation.
          </p>
        </div>
        <div className="panel p-5">
          <p className="label-xs mb-2">Administrateurs (ADMIN_EMAILS)</p>
          {envAdmins.length === 0 ? (
            <p className="text-sm text-loss">
              Aucun défini — le back-office serait fermé en production.
            </p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {envAdmins.map((e) => (
                <li key={e} className="num text-muted">{e}</li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
