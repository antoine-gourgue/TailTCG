import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { type Tier } from "@/lib/game";
import { AppShell } from "@/components/app-shell";
import { GameNav } from "@/components/game/game-nav";
import { TradesClient, type TCard, type TradeView, type MarketCard } from "@/components/game/trades-client";

export const metadata = {
  title: "Échanges — TailTCG",
};

const TIERS_SET = new Set(["common", "uncommon", "rare", "holo", "ultra", "secret"]);
const asTier = (t: string): Tier => (TIERS_SET.has(t) ? (t as Tier) : "common");

type Row = {
  id: string;
  owner_id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string | null;
  tier: string;
  for_trade: boolean | null;
  graded: boolean | null;
  grade_overall: number | null;
};

const toCard = (r: Row): TCard => ({
  id: r.id,
  name: r.card_name,
  setName: r.set_name,
  localId: r.local_id,
  image: r.image_url,
  tier: asTier(r.tier),
  grade: r.graded && r.grade_overall != null ? r.grade_overall : null,
});

const SELECT =
  "id, owner_id, card_name, set_name, local_id, image_url, tier, for_trade, graded, grade_overall";

// Échanges du jeu : place d'échange, propositions reçues/envoyées, mes cartes
export default async function EchangesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const uid = user.id;
  const admin = createAdminClient();

  const [{ data: mine }, { data: market }, { data: trades }] = await Promise.all([
    admin.from("game_cards").select(SELECT).eq("owner_id", uid).order("obtained_at", { ascending: false }).range(0, 4999),
    admin.from("game_cards").select(SELECT).eq("for_trade", true).neq("owner_id", uid).order("obtained_at", { ascending: false }).range(0, 400),
    admin
      .from("game_trades")
      .select("id, from_owner, to_owner, from_card_id, to_card_id, tier, status, created_at")
      .or(`from_owner.eq.${uid},to_owner.eq.${uid}`)
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  const myRows = (mine ?? []) as Row[];
  const marketRows = (market ?? []) as Row[];
  const pending = trades ?? [];

  // Cartes référencées par les échanges (les cartes d'en face ne sont pas dans
  // `mine` ni forcément dans `market`)
  const needIds = new Set<string>();
  for (const t of pending) {
    needIds.add(t.from_card_id);
    needIds.add(t.to_card_id);
  }
  const known = new Map<string, Row>();
  for (const r of [...myRows, ...marketRows]) known.set(r.id, r);
  const missing = [...needIds].filter((id) => !known.has(id));
  if (missing.length > 0) {
    const { data: extra } = await admin.from("game_cards").select(SELECT).in("id", missing);
    for (const r of (extra ?? []) as Row[]) known.set(r.id, r);
  }

  // Pseudos des autres joueurs concernés
  const owners = new Set<string>();
  for (const r of marketRows) owners.add(r.owner_id);
  for (const t of pending) owners.add(t.from_owner === uid ? t.to_owner : t.from_owner);
  const pseudo = new Map<string, string>();
  if (owners.size > 0) {
    const { data: settings } = await admin
      .from("user_settings")
      .select("owner_id, display_name")
      .in("owner_id", [...owners]);
    for (const s of settings ?? []) pseudo.set(s.owner_id, s.display_name ?? "Dresseur");
  }

  const marketplace: MarketCard[] = marketRows.map((r) => ({
    card: toCard(r),
    ownerId: r.owner_id,
    ownerName: pseudo.get(r.owner_id) ?? "Dresseur",
  }));

  const incoming: TradeView[] = [];
  const outgoing: TradeView[] = [];
  for (const t of pending) {
    const from = known.get(t.from_card_id);
    const to = known.get(t.to_card_id);
    if (!from || !to) continue;
    if (t.to_owner === uid) {
      // On me propose : je recevrais `from`, je donnerais `to`
      incoming.push({
        id: t.id,
        tier: asTier(t.tier),
        pseudo: pseudo.get(t.from_owner) ?? "Dresseur",
        theirs: toCard(from),
        mine: toCard(to),
      });
    } else {
      outgoing.push({
        id: t.id,
        tier: asTier(t.tier),
        pseudo: pseudo.get(t.to_owner) ?? "Dresseur",
        mine: toCard(from),
        theirs: toCard(to),
      });
    }
  }

  const myCards = myRows.map(toCard);
  const myForTrade = new Set(myRows.filter((r) => r.for_trade).map((r) => r.id));

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display mb-1 text-3xl font-bold tracking-tight">Échanges</h1>
            <p className="text-sm text-muted">
              Une carte contre une carte de même rareté. Mets tes doubles à échanger et propose aux
              autres dresseurs.
            </p>
          </div>
          <GameNav current="echanges" />
        </div>
        <TradesClient
          marketplace={marketplace}
          incoming={incoming}
          outgoing={outgoing}
          myCards={myCards}
          myForTrade={[...myForTrade]}
        />
      </main>
    </AppShell>
  );
}
