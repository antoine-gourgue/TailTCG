import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Plus,
  BadgeEuro,
  RefreshCw,
  NotebookTabs,
  History,
  Boxes,
  Award,
  Heart,
  Camera,
  Trash2,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatEur } from "@/lib/domain";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { CardImage } from "@/components/card-image";

export const metadata = {
  title: "Journal — TailTCG",
};

type EventKind =
  | "add"
  | "sale"
  | "sealed"
  | "value"
  | "binder"
  | "grading"
  | "wish"
  | "photo"
  | "removed";

type Thumb =
  | { kind: "card"; base: string | null }
  | { kind: "product"; src: string | null };

type Event = {
  at: string;
  kind: EventKind;
  href: string | null;
  title: string;
  detail: string;
  amount: number | null;
  thumb: Thumb | null;
};

const KIND_META: Record<
  EventKind,
  { Icon: typeof Plus; tone: string; label: string; plural: string }
> = {
  add: { Icon: Plus, tone: "bg-accent-soft text-accent-strong", label: "Ajout", plural: "Ajouts" },
  sale: { Icon: BadgeEuro, tone: "bg-gain/15 text-gain", label: "Vente", plural: "Ventes" },
  sealed: { Icon: Boxes, tone: "bg-sealed/15 text-sealed", label: "Scellé", plural: "Scellés" },
  value: { Icon: RefreshCw, tone: "bg-raised text-muted", label: "Valeur", plural: "Valeurs" },
  binder: { Icon: NotebookTabs, tone: "bg-raised text-muted", label: "Classeur", plural: "Classeurs" },
  grading: { Icon: Award, tone: "bg-accent-soft text-accent-strong", label: "Pré-gradation", plural: "Pré-gradées" },
  wish: { Icon: Heart, tone: "bg-loss/10 text-loss", label: "Recherchée", plural: "Recherchées" },
  photo: { Icon: Camera, tone: "bg-raised text-muted", label: "Photos", plural: "Photos" },
  removed: { Icon: Trash2, tone: "bg-raised text-muted", label: "Retrait", plural: "Retraits" },
};

const FILTERS: EventKind[] = ["add", "sealed", "sale", "value", "binder", "grading", "wish", "photo", "removed"];
const PAGE = 150;
/** Au-delà, les actualisations de valeur d'une journée sont résumées en une ligne */
const VALUE_FOLD = 3;

/** Il y a 30 jours (en ms) — calculé hors rendu pour rester idempotent */
function monthAgo(): number {
  return Date.now() - 30 * 86_400_000;
}

function currentYear(): number {
  return new Date().getFullYear();
}

function isKind(v: string | undefined): v is EventKind {
  return !!v && v in KIND_META;
}

/** « dimanche 4 octobre » — l'année seulement si ce n'est pas celle en cours */
function dayKey(iso: string, thisYear: number): string {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: d.getFullYear() === thisYear ? undefined : "numeric" });
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; n?: string }>;
}) {
  const { type, n } = await searchParams;
  const filter: EventKind | null = isKind(type) ? type : null;
  const limit = Math.max(PAGE, Math.min(2000, Number(n) || PAGE));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const [
    { data: items },
    { data: removed },
    { data: hist },
    { data: links },
    { data: binders },
    { data: sealed },
    { data: gradings },
    { data: wishes },
    { data: photos },
  ] = await Promise.all([
    supabase
      .from("collection_value")
      .select("id, card_name, set_name, image_url, created_at, purchase_price, quantity, sold_at, sold_price"),
    supabase
      .from("items")
      .select("id, card_name, set_name, image_url, deleted_at")
      .not("deleted_at", "is", null),
    supabase.from("item_value_history").select("item_id, recorded_at, value"),
    supabase.from("binder_items").select("item_id, binder_id, added_at"),
    supabase.from("binders").select("id, name"),
    supabase
      .from("sealed_items")
      .select("id, quantity, purchase_price, created_at, product:sealed_products(id, name, image)"),
    supabase.from("item_gradings").select("item_id, grade, created_at"),
    supabase.from("wishlist").select("tcgdex_id, card_name, set_name, image_url, created_at"),
    supabase.from("item_photos").select("item_id, created_at"),
  ]);

  const byItem = new Map<string, { name: string; image: string | null }>();
  for (const i of items ?? []) {
    if (i.id && i.card_name) byItem.set(i.id, { name: i.card_name, image: i.image_url });
  }
  const binderName = new Map((binders ?? []).map((b) => [b.id, b.name]));

  const events: Event[] = [];
  for (const i of items ?? []) {
    if (!i.id || !i.created_at || !i.card_name) continue;
    const qty = i.quantity ?? 1;
    events.push({
      at: i.created_at,
      kind: "add",
      href: `/carte/${i.id}`,
      title: i.card_name,
      detail: `ajoutée à la collection · ${i.set_name}${qty > 1 ? ` · ×${qty}` : ""}`,
      amount: i.purchase_price != null ? i.purchase_price * qty : null,
      thumb: { kind: "card", base: i.image_url },
    });
    if (i.sold_at != null) {
      events.push({
        at: `${i.sold_at}T23:59:59Z`,
        kind: "sale",
        href: `/carte/${i.id}`,
        title: i.card_name,
        detail: `vendue · ${i.set_name}`,
        amount: i.sold_price,
        thumb: { kind: "card", base: i.image_url },
      });
    }
  }
  for (const r of removed ?? []) {
    if (!r.deleted_at) continue;
    events.push({
      at: r.deleted_at,
      kind: "removed",
      href: null,
      title: r.card_name,
      detail: `retirée de la collection · ${r.set_name}`,
      amount: null,
      thumb: { kind: "card", base: r.image_url },
    });
  }
  for (const h of hist ?? []) {
    const it = byItem.get(h.item_id);
    if (!it) continue;
    events.push({
      at: h.recorded_at,
      kind: "value",
      href: `/carte/${h.item_id}`,
      title: it.name,
      detail: "valeur actualisée",
      amount: h.value,
      thumb: { kind: "card", base: it.image },
    });
  }
  for (const l of links ?? []) {
    const it = byItem.get(l.item_id);
    const binder = binderName.get(l.binder_id);
    if (!it || !binder || !l.added_at) continue;
    events.push({
      at: l.added_at,
      kind: "binder",
      href: `/classeurs/${l.binder_id}`,
      title: it.name,
      detail: `rangée dans « ${binder} »`,
      amount: null,
      thumb: { kind: "card", base: it.image },
    });
  }
  for (const s of sealed ?? []) {
    const product = Array.isArray(s.product) ? s.product[0] : s.product;
    if (!s.created_at || !product) continue;
    events.push({
      at: s.created_at,
      kind: "sealed",
      href: `/scelles/produit/${product.id}`,
      title: product.name,
      detail: `ajouté aux scellés${s.quantity > 1 ? ` · ×${s.quantity}` : ""}`,
      amount: s.purchase_price != null ? s.purchase_price * s.quantity : null,
      thumb: { kind: "product", src: product.image },
    });
  }
  for (const g of gradings ?? []) {
    const it = byItem.get(g.item_id);
    if (!it || !g.created_at) continue;
    events.push({
      at: g.created_at,
      kind: "grading",
      href: `/carte/${g.item_id}`,
      title: it.name,
      detail: `pré-gradée · note ${g.grade.toLocaleString("fr-FR")}`,
      amount: null,
      thumb: { kind: "card", base: it.image },
    });
  }
  for (const w of wishes ?? []) {
    if (!w.created_at) continue;
    events.push({
      at: w.created_at,
      kind: "wish",
      href: "/recherchees",
      title: w.card_name,
      detail: `ajoutée aux recherchées · ${w.set_name}`,
      amount: null,
      thumb: { kind: "card", base: w.image_url },
    });
  }
  // Photos : une ligne par carte et par jour, quel que soit le nombre de clichés
  const photoDays = new Map<string, { at: string; itemId: string; count: number }>();
  for (const p of photos ?? []) {
    if (!p.created_at || !byItem.has(p.item_id)) continue;
    const key = `${p.item_id}|${p.created_at.slice(0, 10)}`;
    const cur = photoDays.get(key);
    if (cur) {
      cur.count += 1;
      if (p.created_at > cur.at) cur.at = p.created_at;
    } else photoDays.set(key, { at: p.created_at, itemId: p.item_id, count: 1 });
  }
  for (const p of photoDays.values()) {
    const it = byItem.get(p.itemId)!;
    events.push({
      at: p.at,
      kind: "photo",
      href: `/carte/${p.itemId}`,
      title: it.name,
      detail: p.count > 1 ? `${p.count} photos ajoutées` : "photo ajoutée",
      amount: null,
      thumb: { kind: "card", base: it.image },
    });
  }

  events.sort((a, b) => b.at.localeCompare(a.at));

  // Compteurs par type (sur tout l'historique) pour les filtres
  const counts = new Map<EventKind, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);

  // Chiffres des 30 derniers jours
  const since = monthAgo();
  const thisYear = currentYear();
  const month = events.filter((e) => new Date(e.at).getTime() >= since);
  const added = month.filter((e) => e.kind === "add" || e.kind === "sealed");
  const spent = added.reduce((s, e) => s + (e.amount ?? 0), 0);
  const sales = month.filter((e) => e.kind === "sale");
  const cashed = sales.reduce((s, e) => s + (e.amount ?? 0), 0);
  const updates = month.filter((e) => e.kind === "value").length;
  const binderMoves = month.filter((e) => e.kind === "binder").length;

  const filtered = filter ? events.filter((e) => e.kind === filter) : events;
  const shown = filtered.slice(0, limit);

  // Regroupement par jour ; les actualisations de valeur nombreuses sont résumées
  const groups: { day: string; events: Event[]; spent: number; cashed: number }[] = [];
  for (const e of shown) {
    const day = dayKey(e.at, thisYear);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.events.push(e);
    else groups.push({ day, events: [e], spent: 0, cashed: 0 });
  }
  for (const g of groups) {
    for (const e of g.events) {
      if ((e.kind === "add" || e.kind === "sealed") && e.amount) g.spent += e.amount;
      if (e.kind === "sale" && e.amount) g.cashed += e.amount;
    }
    if (!filter) {
      const values = g.events.filter((e) => e.kind === "value");
      if (values.length > VALUE_FOLD) {
        const first = g.events.findIndex((e) => e.kind === "value");
        g.events = g.events.filter((e) => e.kind !== "value");
        g.events.splice(first, 0, {
          at: values[0].at,
          kind: "value",
          href: "/journal?type=value",
          title: "Valeurs actualisées",
          detail: `${values.length} cartes ce jour-là`,
          amount: null,
          thumb: null,
        });
      }
    }
  }

  const query = (k: EventKind | null, size?: number) => {
    const p = new URLSearchParams();
    if (k) p.set("type", k);
    if (size && size > PAGE) p.set("n", String(size));
    const s = p.toString();
    return s ? `/journal?${s}` : "/journal";
  };

  return (
    <AppShell>
      <main className="page max-w-4xl py-8">
        <PageHead
          kicker="Explorer"
          title="Journal"
          count={events.length || null}
          sub="Tout ce qui s’est passé dans ta collection, jour par jour."
        />

        {events.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <History size={44} strokeWidth={1.3} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Rien à raconter</p>
            <p className="max-w-sm text-sm text-muted">
              Ajoute des cartes, actualise des valeurs, vends, range en
              classeurs — tout s’inscrira ici.
            </p>
          </div>
        ) : (
          <div className="rise-in flex flex-col gap-6">
            <section>
              <p className="label-xs mb-2 text-muted">Sur 30 jours</p>
              <StatStrip cols={4}>
                <StatCard label="Ajouts" value={added.length} sub={`${added.filter((e) => e.kind === "add").length} cartes · ${added.filter((e) => e.kind === "sealed").length} scellés`} />
                <StatCard label="Dépensé" value={formatEur(spent)} sub={added.length ? `${formatEur(spent / added.length)} par ajout` : "aucun achat"} />
                <StatCard label="Ventes" value={sales.length} sub={cashed ? `${formatEur(cashed)} encaissés` : "rien vendu"} tone={cashed ? "up" : undefined} />
                <StatCard label="Mises à jour" value={updates} sub={`${binderMoves} rangement${binderMoves > 1 ? "s" : ""} en classeur`} />
              </StatStrip>
            </section>

            {/* Filtres par type d'événement */}
            <nav aria-label="Filtrer le journal" className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
              <Link href={query(null)} data-on={filter === null} className={`seg shrink-0 px-3.5 py-1.5 text-sm ${filter === null ? "font-medium text-accent-strong" : "text-muted"}`}>
                Tout
              </Link>
              {FILTERS.filter((k) => counts.get(k)).map((k) => (
                <Link
                  key={k}
                  href={query(k)}
                  data-on={filter === k}
                  className={`seg flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-sm ${filter === k ? "font-medium text-accent-strong" : "text-muted"}`}
                >
                  {KIND_META[k].plural}
                  <span className="num text-[11px] text-faint">{counts.get(k)}</span>
                </Link>
              ))}
            </nav>

            {groups.map((g) => (
              <section key={g.day}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <h2 className="label-xs first-letter:uppercase">{g.day}</h2>
                  <p className="num text-[11px] text-muted">
                    {g.events.length} événement{g.events.length > 1 ? "s" : ""}
                    {g.spent > 0 && <> · <span className="text-foreground">{formatEur(g.spent)}</span> dépensés</>}
                    {g.cashed > 0 && <> · <span className="text-gain">{formatEur(g.cashed)}</span> encaissés</>}
                  </p>
                </div>
                <div className="panel divide-y divide-ring !p-0">
                  {g.events.map((e, i) => {
                    const meta = KIND_META[e.kind];
                    const time = new Date(e.at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                    const row = (
                      <div className="flex items-center gap-3 px-3.5 py-2.5 sm:px-4">
                        <Thumbnail thumb={e.thumb} tone={meta.tone} Icon={meta.Icon} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-sm leading-snug sm:line-clamp-none sm:truncate">
                            <span className="font-medium">{e.title}</span>{" "}
                            <span className="text-muted">{e.detail}</span>
                          </span>
                          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                            <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full ${meta.tone}`}>
                              <meta.Icon size={9} strokeWidth={2.5} aria-hidden />
                            </span>
                            {meta.label}
                            {e.kind !== "sale" && <span className="num"> · {time}</span>}
                          </span>
                        </span>
                        {e.amount != null && e.amount > 0 && (
                          <span className={`num shrink-0 text-sm font-semibold ${e.kind === "sale" ? "text-gain" : ""}`}>
                            {e.kind === "sale" ? "+" : ""}
                            {formatEur(e.amount)}
                          </span>
                        )}
                      </div>
                    );
                    return e.href ? (
                      <Link key={i} href={e.href} className="block transition hover:bg-raised/60">
                        {row}
                      </Link>
                    ) : (
                      <div key={i}>{row}</div>
                    );
                  })}
                </div>
              </section>
            ))}

            {filtered.length > shown.length && (
              <Link href={query(filter, limit + PAGE)} className="btn btn-ghost self-center">
                <ChevronDown size={15} aria-hidden /> Voir plus ({filtered.length - shown.length} restants)
              </Link>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}

/** Vignette de la ligne : carte, produit scellé, ou icône du type */
function Thumbnail({ thumb, tone, Icon }: { thumb: Thumb | null; tone: string; Icon: typeof Plus }) {
  if (thumb?.kind === "card") {
    return (
      <span className="h-12 w-9 shrink-0 overflow-hidden rounded-md bg-raised shadow-sm">
        <CardImage base={thumb.base} alt="" quality="low" placeholder="compact" />
      </span>
    );
  }
  if (thumb?.kind === "product") {
    return (
      <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 shadow-sm">
        {thumb.src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb.src} alt="" className="max-h-full max-w-full object-contain" loading="lazy" />
        ) : (
          <Boxes size={18} className="text-neutral-400" aria-hidden />
        )}
      </span>
    );
  }
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`}>
      <Icon size={15} strokeWidth={2} aria-hidden />
    </span>
  );
}
