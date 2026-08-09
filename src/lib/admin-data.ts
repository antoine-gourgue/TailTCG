import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type PerUser = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string | null;
  lastSignIn: string | null;
  shared: boolean;
  showValues: boolean;
  cards: number;
  value: number;
  invested: number;
  sold: number;
  deleted: number;
  gradings: number;
  binders: number;
  sources: number;
  wishlist: number;
  customCards: number;
  photos: number;
  lastActivity: string | null;
};

export type AdminBundle = {
  users: PerUser[];
  totals: {
    users: number;
    cards: number;
    value: number;
    invested: number;
    sold: number;
    deleted: number;
    gradings: number;
    binders: number;
    sources: number;
    wishlist: number;
    customCards: number;
    photos: number;
    activeShares: number;
    valuesShared: number;
  };
  items: ItemRow[];
  gradings: GradingRow[];
  sources: SourceRow[];
  customCards: CustomCardRow[];
  snapshots: { captured_at: string }[];
  snapshotCount: number;
};

type ItemRow = {
  owner_id: string;
  card_name: string;
  set_name: string;
  set_id: string;
  language: string | null;
  condition: string;
  manual_price: number | null;
  purchase_price: number | null;
  quantity: number | null;
  graded: boolean | null;
  sold_at: string | null;
  deleted_at: string | null;
  created_at: string | null;
};
type GradingRow = { owner_id: string; item_id: string; grade: number; created_at: string | null };
type SourceRow = { owner_id: string; name: string; kind: string; city: string | null };
type CustomCardRow = { owner_id: string; name: string; created_at: string | null };

export async function loadAdminBundle(): Promise<AdminBundle> {
  const db = createAdminClient();
  const [
    authData,
    settingsRes,
    itemsRes,
    gradingsRes,
    bindersRes,
    sourcesRes,
    wishlistRes,
    customRes,
    photosRes,
    snapRecentRes,
    snapCountRes,
  ] = await Promise.all([
    db.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    db.from("user_settings").select("owner_id, display_name, share_token, share_show_values"),
    db.from("items").select("owner_id, card_name, set_name, set_id, language, condition, manual_price, purchase_price, quantity, graded, sold_at, deleted_at, created_at"),
    db.from("item_gradings").select("owner_id, item_id, grade, created_at").order("created_at", { ascending: false }),
    db.from("binders").select("owner_id"),
    db.from("sources").select("owner_id, name, kind, city"),
    db.from("wishlist").select("owner_id"),
    db.from("custom_cards").select("owner_id, name, created_at"),
    db.from("item_photos").select("owner_id"),
    db.from("price_snapshots").select("captured_at").order("captured_at", { ascending: false }).limit(30),
    db.from("price_snapshots").select("*", { count: "exact", head: true }),
  ]);

  const items = (itemsRes.data ?? []) as ItemRow[];
  const gradings = (gradingsRes.data ?? []) as GradingRow[];
  const sources = (sourcesRes.data ?? []) as SourceRow[];
  const customCards = (customRes.data ?? []) as CustomCardRow[];
  const settings = settingsRes.data ?? [];
  const binders = bindersRes.data ?? [];
  const wishlist = wishlistRes.data ?? [];
  const photos = photosRes.data ?? [];

  const settingsByOwner = new Map(settings.map((s) => [s.owner_id, s]));

  const blank = (): Omit<PerUser, "id" | "email" | "name" | "createdAt" | "lastSignIn" | "shared" | "showValues"> => ({
    cards: 0, value: 0, invested: 0, sold: 0, deleted: 0, gradings: 0,
    binders: 0, sources: 0, wishlist: 0, customCards: 0, photos: 0, lastActivity: null,
  });
  const agg = new Map<string, ReturnType<typeof blank>>();
  const get = (id: string) => {
    let a = agg.get(id);
    if (!a) { a = blank(); agg.set(id, a); }
    return a;
  };

  const totals = {
    users: 0, cards: 0, value: 0, invested: 0, sold: 0, deleted: 0,
    gradings: 0, binders: 0, sources: 0, wishlist: 0, customCards: 0, photos: 0,
    activeShares: 0, valuesShared: 0,
  };

  for (const i of items) {
    const a = get(i.owner_id);
    const created = i.created_at ?? null;
    if (created && (!a.lastActivity || created > a.lastActivity)) a.lastActivity = created;
    if (i.deleted_at != null) { a.deleted += 1; totals.deleted += 1; continue; }
    const qty = i.quantity ?? 1;
    if (i.sold_at != null) { a.sold += 1; totals.sold += 1; }
    a.cards += qty; totals.cards += qty;
    if (i.purchase_price != null) { a.invested += i.purchase_price * qty; totals.invested += i.purchase_price * qty; }
    if (i.manual_price != null && i.sold_at == null) { a.value += i.manual_price * qty; totals.value += i.manual_price * qty; }
  }
  // Compter les cartes pré-gradées distinctes (pas chaque réévaluation)
  const gradedSeen = new Set<string>();
  for (const g of gradings) {
    if (gradedSeen.has(g.item_id)) continue;
    gradedSeen.add(g.item_id);
    get(g.owner_id).gradings += 1;
    totals.gradings += 1;
  }
  for (const b of binders) { get(b.owner_id).binders += 1; totals.binders += 1; }
  for (const s of sources) { get(s.owner_id).sources += 1; totals.sources += 1; }
  for (const w of wishlist) { get(w.owner_id).wishlist += 1; totals.wishlist += 1; }
  for (const c of customCards) { get(c.owner_id).customCards += 1; totals.customCards += 1; }
  for (const p of photos) { get(p.owner_id).photos += 1; totals.photos += 1; }
  for (const s of settings) {
    if (s.share_token != null) totals.activeShares += 1;
    if (s.share_show_values) totals.valuesShared += 1;
  }

  const authUsers = authData.data?.users ?? [];
  totals.users = authUsers.length;

  const users: PerUser[] = authUsers.map((u) => {
    const a = agg.get(u.id) ?? blank();
    const s = settingsByOwner.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "—",
      name: s?.display_name ?? null,
      createdAt: u.created_at ?? null,
      lastSignIn: u.last_sign_in_at ?? null,
      shared: s?.share_token != null,
      showValues: s?.share_show_values ?? false,
      ...a,
    };
  });

  return {
    users,
    totals,
    items,
    gradings,
    sources,
    customCards,
    snapshots: (snapRecentRes.data ?? []) as { captured_at: string }[],
    snapshotCount: snapCountRes.count ?? 0,
  };
}

/** Date du jour (ISO court). Isolé ici : interdit dans un rendu de composant. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** { hier, aujourd'hui } en ISO court */
export function dayWindow(): { today: string; yesterday: string } {
  const now = Date.now();
  return {
    today: new Date(now).toISOString().slice(0, 10),
    yesterday: new Date(now - 86400000).toISOString().slice(0, 10),
  };
}

/** Comptes par jour sur les N derniers jours, à partir de dates ISO */
export function dailyCounts(dates: (string | null)[], days: number, today: string) {
  const end = new Date(`${today}T00:00:00Z`);
  const buckets: { label: string; key: string; value: number }[] = [];
  const index = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    index.set(key, buckets.length);
    buckets.push({
      key,
      label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      value: 0,
    });
  }
  for (const raw of dates) {
    if (!raw) continue;
    const key = raw.slice(0, 10);
    const idx = index.get(key);
    if (idx != null) buckets[idx].value += 1;
  }
  return buckets;
}
