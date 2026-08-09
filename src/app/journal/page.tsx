import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Plus,
  BadgeEuro,
  RefreshCw,
  NotebookTabs,
  History,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatEur } from "@/lib/domain";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "Journal — TailTCG",
};

type EventKind = "add" | "sale" | "value" | "binder";

type Event = {
  at: string;
  kind: EventKind;
  itemId: string | null;
  title: string;
  detail: string;
  amount: number | null;
};

const KIND_META: Record<
  EventKind,
  { Icon: typeof Plus; tone: string; label: string }
> = {
  add: { Icon: Plus, tone: "bg-accent-soft text-accent-strong", label: "Ajout" },
  sale: { Icon: BadgeEuro, tone: "bg-gain/15 text-gain", label: "Vente" },
  value: {
    Icon: RefreshCw,
    tone: "bg-raised text-muted",
    label: "Valeur actualisée",
  },
  binder: {
    Icon: NotebookTabs,
    tone: "bg-raised text-muted",
    label: "Classeur",
  },
};

export default async function JournalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: items }, { data: hist }, { data: links }, { data: binders }] =
    await Promise.all([
      supabase
        .from("collection_value")
        .select(
          "id, card_name, set_name, created_at, purchase_price, sold_at, sold_price"
        ),
      supabase
        .from("item_value_history")
        .select("item_id, recorded_at, value"),
      supabase.from("binder_items").select("item_id, binder_id, added_at"),
      supabase.from("binders").select("id, name"),
    ]);

  const nameByItem = new Map<string, string>();
  for (const i of items ?? []) {
    if (i.id && i.card_name) nameByItem.set(i.id, i.card_name);
  }
  const binderName = new Map((binders ?? []).map((b) => [b.id, b.name]));

  const events: Event[] = [];
  for (const i of items ?? []) {
    if (!i.id || !i.created_at || !i.card_name) continue;
    events.push({
      at: i.created_at,
      kind: "add",
      itemId: i.id,
      title: i.card_name,
      detail: `ajoutée à la collection · ${i.set_name}`,
      amount: i.purchase_price,
    });
    if (i.sold_at != null) {
      events.push({
        at: `${i.sold_at}T23:59:59Z`,
        kind: "sale",
        itemId: i.id,
        title: i.card_name,
        detail: "vendue",
        amount: i.sold_price,
      });
    }
  }
  for (const h of hist ?? []) {
    const name = nameByItem.get(h.item_id);
    if (!name) continue;
    events.push({
      at: h.recorded_at,
      kind: "value",
      itemId: h.item_id,
      title: name,
      detail: "valeur actualisée",
      amount: h.value,
    });
  }
  for (const l of links ?? []) {
    const name = nameByItem.get(l.item_id);
    const binder = binderName.get(l.binder_id);
    if (!name || !binder || !l.added_at) continue;
    events.push({
      at: l.added_at,
      kind: "binder",
      itemId: l.item_id,
      title: name,
      detail: `rangée dans « ${binder} »`,
      amount: null,
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));
  const recent = events.slice(0, 120);

  // Regroupement par jour
  const groups: { day: string; events: Event[] }[] = [];
  for (const e of recent) {
    const day = new Date(e.at).toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(e);
    else groups.push({ day, events: [e] });
  }

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <h1 className="display mb-6 text-3xl font-bold tracking-tight">
          Journal
        </h1>

        {groups.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <History size={44} strokeWidth={1.3} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Rien à raconter</p>
            <p className="max-w-sm text-sm text-muted">
              Ajoute des cartes, actualise des valeurs, vends, range en
              classeurs — tout s&apos;inscrira ici.
            </p>
          </div>
        ) : (
          <div className="rise-in flex flex-col gap-6">
            {groups.map((g) => (
              <section key={g.day}>
                <h2 className="label-xs mb-2 first-letter:uppercase">{g.day}</h2>
                <div className="panel divide-y divide-edge/60 !p-0">
                  {g.events.map((e, i) => {
                    const meta = KIND_META[e.kind];
                    const row = (
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.tone}`}
                        >
                          <meta.Icon size={13} strokeWidth={2} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          <span className="font-medium">{e.title}</span>{" "}
                          <span className="text-muted">{e.detail}</span>
                        </span>
                        {e.amount != null && (
                          <span className="num shrink-0 text-sm font-medium">
                            {formatEur(e.amount)}
                          </span>
                        )}
                      </div>
                    );
                    return e.itemId ? (
                      <Link
                        key={i}
                        href={`/carte/${e.itemId}`}
                        className="block transition hover:bg-raised"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div key={i}>{row}</div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}
