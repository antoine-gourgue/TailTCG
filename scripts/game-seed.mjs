// Peuple (ou vide) le jeu Boosters d'un compte de test : profil, ouvertures,
// cartes (rareté TCGdex du set embarqué), gradations, cartes à l'échange.
// node scripts/game-seed.mjs <uid> [--clear]
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdminEnv } from "./lib/env.mjs";

const [uid, flag] = process.argv.slice(2);
if (!uid) throw new Error("uid manquant");
const { url, key } = supabaseAdminEnv();
const db = createClient(url, key);

for (const t of ["game_trades", "game_cards", "game_openings", "game_profiles"]) {
  const col = t === "game_trades" ? "from_owner" : "owner_id";
  await db.from(t).delete().eq(col, uid);
}
if (flag === "--clear") {
  console.log("jeu vidé");
  process.exit(0);
}

const tierOf = (r) => {
  const x = (r ?? "").toLowerCase();
  if (!x || /sans raret|none|promo/.test(x)) return "common";
  if (/hyper|secr|gold|\bor\b/.test(x)) return "secret";
  if (/ultra|sp[ée]ciale|special|magnifique|rainbow|arc-en-ciel|chromatique/.test(x)) return "ultra";
  if (/holo|illustration|double|\bex\b|\bgx\b|\bv\b|vmax|vstar|amazing|radi|prime|l[ée]gend|break|shin|brillant/.test(x)) return "holo";
  if (/peu commune|uncommon/.test(x)) return "uncommon";
  if (/rare/.test(x)) return "rare";
  return "common";
};
const RANK = ["common", "uncommon", "rare", "holo", "ultra", "secret"];
const pick = (arr, n) => Array.from({ length: n }, () => arr[Math.floor(Math.random() * arr.length)]);
const SETS = [["sv03.5", 6], ["me05", 4], ["sv08", 2]];
const rows = [];
const openings = [];
let day = 0;
for (const [setId, packs] of SETS) {
  const pool = JSON.parse(readFileSync(`src/data/sets/${setId}.json`, "utf8"));
  const by = (t) => pool.cards.filter((c) => tierOf(c.rarity) === t);
  for (let p = 0; p < packs; p++) {
    const at = new Date(Date.now() - day * 86_400_000 - p * 3_600_000).toISOString();
    const drawn = [...pick(by("common"), 3), ...pick(by("uncommon").length ? by("uncommon") : by("common"), 1), ...pick([...by("rare"), ...by("holo"), ...by("ultra")].length ? [...by("rare"), ...by("holo"), ...by("ultra"), ...by("secret")] : by("common"), 1)];
    openings.push({ owner_id: uid, set_id: setId, tcgdex_ids: drawn.map((c) => c.id), opened_at: at });
    for (const c of drawn) {
      const overall = [10, 9, 9, 8, 8, 8, 7, 7, 6, 5][Math.floor(Math.random() * 10)];
      const sub = () => Math.min(10, overall + Math.floor(Math.random() * 2));
      const tier = tierOf(c.rarity);
      const graded = RANK.indexOf(tier) >= 2 && Math.random() < 0.5;
      rows.push({ owner_id: uid, tcgdex_id: c.id, set_id: setId, set_name: pool.name, card_name: c.name, local_id: c.localId, image_url: c.image, rarity: c.rarity ?? null, tier, source: "booster", obtained_at: at, grade_centering: sub(), grade_corners: sub(), grade_edges: sub(), grade_surface: sub(), grade_overall: overall, graded, graded_at: graded ? at : null, for_trade: tier === "common" && Math.random() < 0.4 });
    }
    day += p % 2 === 0 ? 1 : 0;
  }
}
await db.from("game_profiles").insert({ owner_id: uid, boosters: 2, refill_at: new Date().toISOString(), opened: openings.length });
const { error: e1 } = await db.from("game_openings").insert(openings);
const { error: e2 } = await db.from("game_cards").insert(rows);
if (e1 || e2) throw new Error((e1 ?? e2).message);
console.log(`jeu peuplé : ${openings.length} ouvertures, ${rows.length} cartes`);
