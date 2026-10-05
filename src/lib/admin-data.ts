import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/paginate";
import { sealedCotes } from "@/lib/sealed-prices";
import { isAdminEmail } from "@/lib/admin";

/**
 * Données du back-office, lues avec le client service role (tous comptes).
 * Tout est paginé (`fetchAll`) : les cartes de jeu dépassent déjà le plafond
 * PostgREST de 1000 lignes. `cache()` dédoublonne les appels d'une même
 * requête (layout + page). La valeur d'un compte est celle de son propre
 * portefeuille : cartes à leur valeur saisie + scellés (saisie ou cote) ;
 * la cote Cardmarket des cartes est donnée à part (`market`).
 */

const DAY = 86_400_000;
export const ACTIVITY_DAYS = 30;

/** Teintes d'avatar, attribuées dans l'ordre d'inscription : deux comptes voisins ne se confondent pas */
const HUES = [12, 205, 275, 145, 40, 320, 175, 95];

export type AdminAccount = {
  id: string;
  email: string;
  name: string | null;
  hue: number;
  createdAt: string | null;
  lastSignIn: string | null;
  confirmed: boolean;
  banned: boolean;
  admin: boolean;
  shared: boolean;
  showValues: boolean;
  cards: number;
  refs: number;
  /** valeur du portefeuille (cartes saisies + scellés), null si rien n'est valorisé */
  value: number | null;
  /** cote Cardmarket des cartes + cote des scellés */
  market: number | null;
  invested: number;
  sealed: number;
  sealedProducts: number;
  game: number;
  openings: number;
  gameGraded: number;
  pregrades: number;
  binders: number;
  wishes: number;
  sources: number;
  customCards: number;
  photos: number;
  trash: number;
  sold: number;
  lastActivity: string | null;
  /** gestes par jour sur 30 jours (cartes, scellés, boosters, scans) */
  spark: number[];
};

export type AdminItem = {
  id: string;
  owner_id: string;
  card_name: string;
  set_id: string;
  set_name: string;
  tcgdex_id: string;
  image_url: string;
  language: string;
  condition: string;
  rarity: string | null;
  quantity: number | null;
  purchase_price: number | null;
  current_price: number | null;
  market_trend: number | null;
  sold_at: string | null;
  created_at: string | null;
};
export type AdminSealedLot = {
  owner_id: string;
  quantity: number;
  purchase_price: number | null;
  manual_price: number | null;
  created_at: string | null;
  product: { id: number; name: string; kind: string; image: string; set_name: string; set_name_fr: string | null; cardmarket_id: number | null; price_usd: number | null };
};
export type AdminGameCard = {
  owner_id: string;
  set_id: string;
  set_name: string;
  card_name: string;
  rarity: string | null;
  tier: string;
  image_url: string | null;
  graded: boolean;
  for_trade: boolean;
  obtained_at: string;
};
export type AdminEvent = {
  ownerId: string;
  kind: "cartes" | "scellés" | "boosters" | "scans";
  day: string;
  at: string;
  count: number;
  images: string[];
};

export type AdminData = {
  now: number;
  accounts: AdminAccount[];
  items: AdminItem[];
  sealed: AdminSealedLot[];
  sealedCote: Map<number, number>;
  game: AdminGameCard[];
  openings: { owner_id: string; set_id: string; opened_at: string }[];
  trades: { status: string }[];
  pregrades: { owner_id: string; item_id: string; grade: number; created_at: string | null }[];
  customCards: { owner_id: string; name: string; image_path: string | null; created_at: string | null }[];
  captures: { owner_id: string; kind: string; status: string; created_at: string | null; expires_at: string }[];
  scans: { owner_id: string; created_at: string | null }[];
  trash: number;
  events: AdminEvent[];
  /** séries quotidiennes (30 j) tous comptes */
  daily: { days: string[]; cards: number[]; sealed: number[]; openings: number[]; scans: number[] };
};

const isoDay = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Jours (ISO) des N derniers jours, du plus ancien à aujourd'hui */
export function lastDays(now: number, n: number): string[] {
  return Array.from({ length: n }, (_, k) => isoDay(now - (n - 1 - k) * DAY));
}

function perDay(dates: (string | null | undefined)[], days: string[]): number[] {
  const idx = new Map(days.map((d, i) => [d, i]));
  const out = days.map(() => 0);
  for (const raw of dates) {
    if (!raw) continue;
    const i = idx.get(raw.slice(0, 10));
    if (i != null) out[i] += 1;
  }
  return out;
}

async function listAllUsers() {
  const db = createAdminClient();
  const users: User[] = [];
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

export const loadAdminData = cache(async (): Promise<AdminData> => {
  const db = createAdminClient();
  const now = Date.now();

  const [users, settings, items, trashRows, sealedRaw, game, openings, trades, pregrades, binders, wishes, sources, customCards, photos, captures, scans] = await Promise.all([
    listAllUsers(),
    fetchAll((a, b) => db.from("user_settings").select("owner_id, display_name, share_token, share_show_values").order("owner_id").range(a, b)),
    fetchAll<AdminItem>((a, b) =>
      db
        .from("collection_value")
        .select("id, owner_id, card_name, set_id, set_name, tcgdex_id, image_url, language, condition, rarity, quantity, purchase_price, current_price, market_trend, sold_at, created_at")
        .order("id")
        .range(a, b) as unknown as PromiseLike<{ data: AdminItem[] | null }>,
    ),
    fetchAll((a, b) => db.from("items").select("owner_id").not("deleted_at", "is", null).order("id").range(a, b)),
    fetchAll((a, b) =>
      db
        .from("sealed_items")
        .select("owner_id, quantity, purchase_price, manual_price, created_at, product:sealed_products(id, name, kind, image, set_name, set_name_fr, cardmarket_id, price_usd)")
        .order("id")
        .range(a, b),
    ),
    fetchAll<AdminGameCard>((a, b) =>
      db.from("game_cards").select("owner_id, set_id, set_name, card_name, rarity, tier, image_url, graded, for_trade, obtained_at").order("obtained_at", { ascending: false }).order("id").range(a, b),
    ),
    fetchAll((a, b) => db.from("game_openings").select("owner_id, set_id, opened_at").order("opened_at", { ascending: false }).order("id").range(a, b)),
    fetchAll((a, b) => db.from("game_trades").select("status").order("id").range(a, b)),
    fetchAll((a, b) => db.from("item_gradings").select("owner_id, item_id, grade, created_at").order("created_at", { ascending: false }).order("id").range(a, b)),
    fetchAll((a, b) => db.from("binders").select("owner_id").order("id").range(a, b)),
    fetchAll((a, b) => db.from("wishlist").select("owner_id").order("id").range(a, b)),
    fetchAll((a, b) => db.from("sources").select("owner_id").order("id").range(a, b)),
    fetchAll((a, b) => db.from("custom_cards").select("owner_id, name, image_path, created_at").order("created_at", { ascending: false }).order("id").range(a, b)),
    fetchAll((a, b) => db.from("item_photos").select("owner_id").order("id").range(a, b)),
    fetchAll((a, b) => db.from("capture_sessions").select("owner_id, kind, status, created_at, expires_at").order("created_at", { ascending: false }).order("id").range(a, b)),
    fetchAll((a, b) => db.from("capture_scans").select("owner_id, created_at").order("created_at", { ascending: false }).order("id").range(a, b)),
  ]);

  // Scellés : produit joint (objet ou tableau selon PostgREST) et cote par produit
  const sealed = sealedRaw
    .map((l) => ({ ...l, product: (Array.isArray(l.product) ? l.product[0] : l.product) as AdminSealedLot["product"] | null }))
    .filter((l): l is AdminSealedLot => l.product != null);
  const products = [...new Map(sealed.map((l) => [l.product.id, l.product])).values()];
  const cotes = products.length ? await sealedCotes(products, db) : new Map();
  const sealedCote = new Map([...cotes.entries()].map(([id, c]) => [id, c.value]));

  const days = lastDays(now, ACTIVITY_DAYS);
  const settingsBy = new Map(settings.map((s) => [s.owner_id, s]));
  const countBy = <T extends { owner_id: string }>(rows: T[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.owner_id, (m.get(r.owner_id) ?? 0) + 1);
    return m;
  };
  const binderN = countBy(binders);
  const wishN = countBy(wishes);
  const sourceN = countBy(sources);
  const customN = countBy(customCards);
  const photoN = countBy(photos);
  const trashN = countBy(trashRows);
  const openN = countBy(openings);

  const byOwner = <T extends { owner_id: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.owner_id);
      if (list) list.push(r);
      else m.set(r.owner_id, [r]);
    }
    return m;
  };
  const itemsBy = byOwner(items);
  const sealedBy = byOwner(sealed);
  const gameBy = byOwner(game);
  const openBy = byOwner(openings);
  const scansBy = byOwner(scans);
  const pregradeBy = new Map<string, Set<string>>();
  for (const g of pregrades) {
    const s = pregradeBy.get(g.owner_id) ?? new Set<string>();
    s.add(g.item_id);
    pregradeBy.set(g.owner_id, s);
  }

  const sortedUsers = [...users].sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
  const hueBy = new Map(sortedUsers.map((u, i) => [u.id, HUES[i % HUES.length]]));

  const accounts: AdminAccount[] = users.map((u) => {
    const its = itemsBy.get(u.id) ?? [];
    const lots = sealedBy.get(u.id) ?? [];
    const gm = gameBy.get(u.id) ?? [];
    const op = openBy.get(u.id) ?? [];
    const sc = scansBy.get(u.id) ?? [];
    const s = settingsBy.get(u.id);
    let cards = 0;
    let value = 0;
    let market = 0;
    let invested = 0;
    let valued = false;
    let marketed = false;
    let sold = 0;
    for (const i of its) {
      const q = i.quantity ?? 1;
      if (i.sold_at != null) {
        sold += 1;
        continue;
      }
      cards += q;
      invested += (i.purchase_price ?? 0) * q;
      if (i.current_price != null) {
        value += i.current_price * q;
        valued = true;
      }
      if (i.market_trend != null) {
        market += i.market_trend * q;
        marketed = true;
      }
    }
    let sealedQty = 0;
    for (const l of lots) {
      sealedQty += l.quantity;
      invested += (l.purchase_price ?? 0) * l.quantity;
      const cote = sealedCote.get(l.product.id) ?? null;
      const unit = l.manual_price ?? cote;
      if (unit != null) {
        value += unit * l.quantity;
        valued = true;
      }
      if (cote != null) {
        market += cote * l.quantity;
        marketed = true;
      }
    }
    const acts = [...its.map((i) => i.created_at), ...lots.map((l) => l.created_at), ...op.map((o) => o.opened_at), ...sc.map((x) => x.created_at)];
    const last = acts.reduce<string | null>((m, d) => (d && (!m || d > m) ? d : m), null);
    return {
      id: u.id,
      email: u.email ?? "—",
      name: s?.display_name ?? null,
      hue: hueBy.get(u.id) ?? 200,
      createdAt: u.created_at ?? null,
      lastSignIn: u.last_sign_in_at ?? null,
      confirmed: !!u.email_confirmed_at,
      banned: !!u.banned_until && new Date(u.banned_until).getTime() > now,
      admin: isAdminEmail(u.email),
      shared: s?.share_token != null,
      showValues: s?.share_show_values ?? false,
      cards,
      refs: its.filter((i) => i.sold_at == null).length,
      value: valued ? value : null,
      market: marketed ? market : null,
      invested,
      sealed: sealedQty,
      sealedProducts: new Set(lots.map((l) => l.product.id)).size,
      game: gm.length,
      openings: openN.get(u.id) ?? 0,
      gameGraded: gm.filter((c) => c.graded).length,
      pregrades: pregradeBy.get(u.id)?.size ?? 0,
      binders: binderN.get(u.id) ?? 0,
      wishes: wishN.get(u.id) ?? 0,
      sources: sourceN.get(u.id) ?? 0,
      customCards: customN.get(u.id) ?? 0,
      photos: photoN.get(u.id) ?? 0,
      trash: trashN.get(u.id) ?? 0,
      sold,
      lastActivity: last,
      spark: perDay(acts, days),
    };
  });
  accounts.sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || b.cards - a.cards);

  // Fil d'activité : gestes regroupés par compte, jour et type
  const groups = new Map<string, AdminEvent>();
  const push = (ownerId: string, kind: AdminEvent["kind"], at: string | null, n = 1, image?: string | null) => {
    if (!at) return;
    const day = at.slice(0, 10);
    const key = `${ownerId}|${day}|${kind}`;
    const g = groups.get(key) ?? { ownerId, kind, day, at, count: 0, images: [] };
    g.count += n;
    if (at > g.at) g.at = at;
    if (image && g.images.length < 6) g.images.push(image);
    groups.set(key, g);
  };
  for (const i of items) push(i.owner_id, "cartes", i.created_at, 1, i.image_url?.includes("tcgdex") ? i.image_url : null);
  for (const l of sealed) push(l.owner_id, "scellés", l.created_at, l.quantity, l.product.image);
  for (const o of openings) push(o.owner_id, "boosters", o.opened_at);
  for (const x of scans) push(x.owner_id, "scans", x.created_at);
  const events = [...groups.values()].sort((a, b) => b.at.localeCompare(a.at));

  return {
    now,
    accounts,
    items,
    sealed,
    sealedCote,
    game,
    openings,
    trades,
    pregrades,
    customCards,
    captures,
    scans,
    trash: trashRows.length,
    events,
    daily: {
      days,
      cards: perDay(items.map((i) => i.created_at), days),
      sealed: (() => {
        const idx = new Map(days.map((d, i) => [d, i]));
        const out = days.map(() => 0);
        for (const l of sealed) {
          const i = l.created_at ? idx.get(l.created_at.slice(0, 10)) : undefined;
          if (i != null) out[i] += l.quantity;
        }
        return out;
      })(),
      openings: perDay(openings.map((o) => o.opened_at), days),
      scans: perDay(scans.map((s) => s.created_at), days),
    },
  };
});

/* ═══════════ Santé : tâches planifiées et ménage ═══════════ */

export type JobStatus = "ok" | "late" | "unknown";
export type AdminHealth = {
  now: number;
  cards: { status: JobStatus; lastDay: string | null; lastCount: number; total: number; daily: number[] };
  guide: { status: JobStatus; fileAt: string | null; refreshedAt: string | null; rows: number };
  catalog: { status: JobStatus; lastSealedDay: string | null; sealedSnapshots: number; cards: number; sets: number; jaSets: number; sealedProducts: number; sealedWithCardmarket: number };
  expiredCaptures: number;
  trash: number;
  jobsLate: number;
};

export const loadAdminHealth = cache(async (): Promise<AdminHealth> => {
  const db = createAdminClient();
  const now = Date.now();
  const days14 = lastDays(now, 14);
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;

  const [snaps, total, meta, lastSealed, sealedSnapshots, cards, sets, jaSets, sealedProducts, sealedWithCm, expiredCaptures, trash] = await Promise.all([
    fetchAll((a, b) => db.from("price_snapshots").select("captured_at").gte("captured_at", days14[0]).order("captured_at").order("tcgdex_id").range(a, b)),
    count(db.from("price_snapshots").select("*", { count: "exact", head: true })),
    db.from("cardmarket_price_guide_meta").select("created_at, refreshed_at, row_count").eq("id", 1).maybeSingle(),
    db.from("sealed_price_snapshots").select("day").order("day", { ascending: false }).limit(1).maybeSingle(),
    count(db.from("sealed_price_snapshots").select("*", { count: "exact", head: true })),
    count(db.from("catalog_cards").select("*", { count: "exact", head: true })),
    count(db.from("catalog_sets").select("*", { count: "exact", head: true })),
    count(db.from("catalog_sets").select("*", { count: "exact", head: true }).eq("lang", "ja")),
    count(db.from("sealed_products").select("*", { count: "exact", head: true })),
    count(db.from("sealed_products").select("*", { count: "exact", head: true }).not("cardmarket_id", "is", null)),
    count(db.from("capture_sessions").select("*", { count: "exact", head: true }).neq("status", "done").lt("expires_at", new Date(now).toISOString())),
    count(db.from("items").select("*", { count: "exact", head: true }).not("deleted_at", "is", null)),
  ]);

  const daily = perDay(snaps.map((s) => s.captured_at), days14);
  const lastIdx = daily.findLastIndex((n) => n > 0);
  const lastDay = lastIdx >= 0 ? days14[lastIdx] : null;
  const yesterday = isoDay(now - DAY);
  const fresh = (day: string | null) => (day == null ? "unknown" : day >= yesterday ? "ok" : "late");
  const refreshedAt = meta.data?.refreshed_at ?? null;
  const guideStatus: JobStatus = refreshedAt == null ? "unknown" : now - new Date(refreshedAt).getTime() < 2.2 * DAY ? "ok" : "late";

  const cardsJob = { status: fresh(lastDay) as JobStatus, lastDay, lastCount: lastIdx >= 0 ? daily[lastIdx] : 0, total, daily };
  const catalog = {
    status: fresh(lastSealed.data?.day ?? null) as JobStatus,
    lastSealedDay: lastSealed.data?.day ?? null,
    sealedSnapshots,
    cards,
    sets,
    jaSets,
    sealedProducts,
    sealedWithCardmarket: sealedWithCm,
  };
  const jobsLate = [cardsJob.status, guideStatus, catalog.status].filter((s) => s !== "ok").length;
  return {
    now,
    cards: cardsJob,
    guide: { status: guideStatus, fileAt: meta.data?.created_at ?? null, refreshedAt, rows: meta.data?.row_count ?? 0 },
    catalog,
    expiredCaptures,
    trash,
    jobsLate,
  };
});

/* ═══════════ Base : volumes par table et lignes orphelines ═══════════ */

export const TABLE_GROUPS = [
  { label: "Catalogue", tone: "scan", tables: ["cardmarket_price_guide", "catalog_cards", "sealed_price_snapshots", "sealed_products", "catalog_sets"] },
  { label: "Comptes", tone: "accent", tables: ["price_snapshots", "items", "item_value_history", "binder_placeholders", "binder_items", "binders", "sealed_items", "wishlist", "sources", "custom_cards", "item_photos", "item_gradings", "capture_sessions", "capture_scans", "user_settings"] },
  { label: "Jeu", tone: "game", tables: ["game_cards", "game_openings", "game_profiles", "game_trades"] },
] as const;

/** Tables portant un owner_id (lignes d'un compte) et leur colonne propriétaire */
export const OWNED_TABLES = [
  "game_cards",
  "game_openings",
  "game_profiles",
  "capture_scans",
  "capture_sessions",
  "binder_items",
  "binder_placeholders",
  "binders",
  "wishlist",
  "sealed_items",
  "custom_cards",
  "item_value_history",
  "item_photos",
  "item_gradings",
  "items",
  "sources",
  "user_settings",
] as const;

export async function loadTableCounts(): Promise<Map<string, number>> {
  const db = createAdminClient();
  const names = [...new Set(TABLE_GROUPS.flatMap((g) => g.tables))];
  const counts = await Promise.all(
    names.map(async (t) => {
      const { count } = await db.from(t).select("*", { count: "exact", head: true });
      return [t, count ?? 0] as const;
    }),
  );
  return new Map(counts);
}

/** Identifiants de tous les comptes, avec garde-fou : sans liste, tout paraîtrait orphelin */
export async function knownAccountIds(): Promise<string[]> {
  const users = await listAllUsers();
  if (users.length === 0) throw new Error("aucun compte listé");
  return users.map((u) => u.id);
}

/**
 * Lignes dont le propriétaire n'existe plus, par table (comptes supprimés sans
 * purge). Filtre `owner_id not in (comptes)` côté base : pas de pagination.
 * La liste tient dans l'URL jusqu'à quelques centaines de comptes.
 */
export async function findOrphans(): Promise<{ table: string; rows: number }[]> {
  const db = createAdminClient();
  const ids = await knownAccountIds();
  const list = `(${ids.join(",")})`;
  const out: { table: string; rows: number }[] = [];
  for (const t of OWNED_TABLES) {
    const { count, error } = await db.from(t).select("*", { count: "exact", head: true }).not("owner_id", "in", list);
    if (error) throw new Error(`${t}: ${error.message}`);
    if (count) out.push({ table: t, rows: count });
  }
  return out;
}
