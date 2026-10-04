import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/paginate";
import { TIERS, type Tier } from "@/lib/game";
import { PageHead } from "@/components/page-head";
import { StatCard, StatStrip } from "@/components/stat-card";
import { GameNav } from "@/components/game/game-nav";
import { TradesClient, type TCard, type TradeView, type MarketCard } from "@/components/game/trades-client";

export const metadata = {
  title: "Échanges — TailTCG",
};

const asTier = (t: string): Tier => (TIERS.includes(t as Tier) ? (t as Tier) : "common");

type Row = {
  id: string;
  owner_id: string;
  tcgdex_id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string | null;
  tier: string;
  rarity: string | null;
  for_trade: boolean | null;
  graded: boolean | null;
  grade_overall: number | null;
  obtained_at: string;
};

const toCard = (r: Row): TCard => ({
  id: r.id,
  name: r.card_name,
  setName: r.set_name,
  localId: r.local_id,
  image: r.image_url,
  tier: asTier(r.tier),
  rarity: r.rarity,
  grade: r.graded && r.grade_overall != null ? r.grade_overall : null,
});

const SELECT = "id, owner_id, tcgdex_id, card_name, set_name, local_id, image_url, tier, rarity, for_trade, graded, grade_overall, obtained_at";

// Échanges du jeu : place d'échange, propositions reçues/envoyées, mes cartes
export default async function EchangesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");
  const uid = user.id;
  const admin = createAdminClient();

  const [mine, market, { data: trades }, { count: realized }] = await Promise.all([
    fetchAll<Row>((from, to) => admin.from("game_cards").select(SELECT).eq("owner_id", uid).order("obtained_at", { ascending: false }).order("id").range(from, to)),
    fetchAll<Row>((from, to) => admin.from("game_cards").select(SELECT).eq("for_trade", true).neq("owner_id", uid).order("obtained_at", { ascending: false }).order("id").range(from, to), { maxPages: 3 }),
    admin
      .from("game_trades")
      .select("id, from_owner, to_owner, from_card_id, to_card_id, tier, status, created_at")
      .or(`from_owner.eq.${uid},to_owner.eq.${uid}`)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    admin.from("game_trades").select("*", { count: "exact", head: true }).or(`from_owner.eq.${uid},to_owner.eq.${uid}`).eq("status", "accepted"),
  ]);

  const pending = trades ?? [];

  // Cartes référencées par les échanges (les cartes d'en face ne sont pas dans `mine` ni forcément dans `market`)
  const needIds = new Set<string>();
  for (const t of pending) {
    needIds.add(t.from_card_id);
    needIds.add(t.to_card_id);
  }
  const known = new Map<string, Row>();
  for (const r of [...mine, ...market]) known.set(r.id, r);
  const missing = [...needIds].filter((id) => !known.has(id));
  if (missing.length > 0) {
    const { data: extra } = await admin.from("game_cards").select(SELECT).in("id", missing);
    for (const r of (extra ?? []) as Row[]) known.set(r.id, r);
  }

  // Pseudos des autres joueurs concernés
  const owners = new Set<string>();
  for (const r of market) owners.add(r.owner_id);
  for (const t of pending) owners.add(t.from_owner === uid ? t.to_owner : t.from_owner);
  const pseudo = new Map<string, string>();
  if (owners.size > 0) {
    const { data: settings } = await admin.from("user_settings").select("owner_id, display_name").in("owner_id", [...owners]);
    for (const s of settings ?? []) pseudo.set(s.owner_id, s.display_name ?? "Dresseur");
  }

  // Mes doubles par palier : les exemplaires au-delà du premier, qu'on peut offrir sans se démunir
  const qty = new Map<string, number>();
  for (const r of mine) qty.set(r.tcgdex_id, (qty.get(r.tcgdex_id) ?? 0) + 1);
  const spareByTier: Record<Tier, number> = { common: 0, uncommon: 0, rare: 0, holo: 0, ultra: 0, secret: 0 };
  const seen = new Set<string>();
  for (const r of mine) {
    if (seen.has(r.tcgdex_id)) spareByTier[asTier(r.tier)] += 1;
    else seen.add(r.tcgdex_id);
  }

  const marketplace: MarketCard[] = market.map((r) => ({ card: toCard(r), ownerId: r.owner_id, ownerName: pseudo.get(r.owner_id) ?? "Dresseur", since: r.obtained_at }));
  const incoming: TradeView[] = [];
  const outgoing: TradeView[] = [];
  for (const t of pending) {
    const from = known.get(t.from_card_id);
    const to = known.get(t.to_card_id);
    if (!from || !to) continue;
    if (t.to_owner === uid) {
      // On me propose : je recevrais `from`, je donnerais `to`
      incoming.push({ id: t.id, tier: asTier(t.tier), pseudo: pseudo.get(t.from_owner) ?? "Dresseur", theirs: toCard(from), mine: toCard(to), createdAt: t.created_at });
    } else {
      outgoing.push({ id: t.id, tier: asTier(t.tier), pseudo: pseudo.get(t.to_owner) ?? "Dresseur", mine: toCard(from), theirs: toCard(to), createdAt: t.created_at });
    }
  }

  const myCards = mine.map((r) => ({ ...toCard(r), double: (qty.get(r.tcgdex_id) ?? 0) > 1 }));
  const myForTrade = new Set(mine.filter((r) => r.for_trade).map((r) => r.id));
  const traders = new Set(market.map((r) => r.owner_id)).size;

  return (
    <main className="page py-8">
      <PageHead kicker="Boosters" title="Échanges" sub="Une carte contre une carte de même rareté. Mets tes doubles à l’échange, propose aux autres dresseurs.">
        <GameNav current="echanges" />
      </PageHead>
      <StatStrip cols={4}>
        <StatCard label="Place d’échange" value={marketplace.length} sub={traders > 0 ? `carte${marketplace.length > 1 ? "s" : ""} proposée${marketplace.length > 1 ? "s" : ""} par ${traders} dresseur${traders > 1 ? "s" : ""}` : "personne ne propose encore"} />
        <StatCard label="Reçues" value={incoming.length} tone={incoming.length > 0 ? "up" : undefined} sub={incoming.length > 0 ? "à répondre" : "aucune proposition"} />
        <StatCard label="Envoyées" value={outgoing.length} sub={outgoing.length > 0 ? "en attente" : "rien en attente"} />
        <StatCard label="Réalisés" value={realized ?? 0} sub={`échange${(realized ?? 0) > 1 ? "s" : ""} conclu${(realized ?? 0) > 1 ? "s" : ""}`} />
      </StatStrip>
      <div className="mt-4">
        <TradesClient marketplace={marketplace} incoming={incoming} outgoing={outgoing} myCards={myCards} myForTrade={[...myForTrade]} spareByTier={spareByTier} />
      </div>
    </main>
  );
}
