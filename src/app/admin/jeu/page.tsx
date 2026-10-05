import Link from "next/link";
import { loadAdminData } from "@/lib/admin-data";
import { fmtInt, packHue, relTime } from "@/lib/admin-format";
import { rarityLabel } from "@/lib/rarity";
import { PLAYABLE_BY_ID } from "@/lib/game-sets";
import { StatCard, StatStrip } from "@/components/stat-card";
import { CardImage } from "@/components/card-image";
import { SetLogo } from "@/components/game/set-logo";
import { Avatar, Badge, DayBars, PanelHead, RankRow } from "@/components/admin/admin-ui";

/** Couleur d'un palier de tirage (sert à teinter la rareté qui y correspond) */
const TIER_COLOR: Record<string, string> = { common: "#71717a", uncommon: "#22c55e", rare: "#3b82f6", holo: "#8b5cf6", ultra: "var(--accent-strong)", secret: "#f4c361" };

export default async function AdminGame() {
  const d = await loadAdminData();
  const byId = new Map(d.accounts.map((a) => [a.id, a]));
  const players = d.accounts.filter((a) => a.openings > 0).sort((a, b) => b.openings - a.openings);
  const graded = d.game.filter((c) => c.graded).length;
  const forTrade = d.game.filter((c) => c.for_trade).length;
  const accepted = d.trades.filter((t) => t.status === "accepted").length;
  const pending = d.trades.filter((t) => t.status === "pending").length;
  const sets = new Set(d.game.map((c) => c.set_id)).size;

  // Sets les plus ouverts
  const setOpen = new Map<string, number>();
  for (const o of d.openings) setOpen.set(o.set_id, (setOpen.get(o.set_id) ?? 0) + 1);
  const setName = new Map(d.game.map((c) => [c.set_id, c.set_name]));
  const topSets = [...setOpen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);

  // Raretés tirées : libellé TCGdex harmonisé, couleur du palier le plus fréquent pour ce libellé
  const rar = new Map<string, { n: number; tiers: Map<string, number> }>();
  for (const c of d.game) {
    const k = rarityLabel(c.rarity);
    const g = rar.get(k) ?? { n: 0, tiers: new Map<string, number>() };
    g.n += 1;
    g.tiers.set(c.tier, (g.tiers.get(c.tier) ?? 0) + 1);
    rar.set(k, g);
  }
  const rarities = [...rar.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 12);
  const tierOf = (tiers: Map<string, number>) => [...tiers.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "common";
  const pulls = d.game.filter((c) => (c.tier === "ultra" || c.tier === "secret") && c.image_url).slice(0, 8);

  return (
    <div className="flex flex-col gap-3.5">
      <StatStrip cols={5}>
        <StatCard label="Joueurs" value={players.length} sub="ont ouvert un booster" />
        <StatCard label="Boosters ouverts" value={fmtInt(d.openings.length)} sub="5 cartes chacun" />
        <StatCard label="Cartes tirées" value={fmtInt(d.game.length)} sub={`${sets} sets`} />
        <StatCard label="Gradées" value={fmtInt(graded)} sub="dans le jeu" />
        <StatCard label="Échanges" value={fmtInt(accepted)} sub={`${forTrade} carte${forTrade > 1 ? "s" : ""} à l'échange${pending ? ` · ${pending} en attente` : ""}`} />
      </StatStrip>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="panel flex flex-col p-5">
          <PanelHead title="Ouvertures · 30 jours" hint="Boosters ouverts par jour · hauteurs adoucies pour garder les petits jours lisibles" />
          <div className="flex flex-1 flex-col justify-end">
            <DayBars series={[{ values: d.daily.openings, color: "var(--game)" }]} days={d.daily.days} height={170} sqrt />
          </div>
        </section>
        <section className="panel p-5">
          <PanelHead title="Joueurs" hint="Classés par boosters ouverts" />
          {players.length === 0 ? (
            <p className="text-sm text-muted">Personne n&apos;a encore joué.</p>
          ) : (
            <ul className="divide-y divide-ring">
              {players.map((a) => (
                <li key={a.id}>
                  <Link href={`/admin/utilisateurs/${a.id}`} className="flex items-center gap-3 py-2.5 transition hover:opacity-90">
                    <Avatar name={a.name ?? a.email} hue={a.hue} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{a.name ?? a.email}</p>
                      <p className="num mt-0.5 text-[11.5px] text-faint">
                        {fmtInt(a.game)} cartes · {fmtInt(a.gameGraded)} gradées
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="num font-bold">{fmtInt(a.openings)}</p>
                      <p className="text-[11px] text-faint">boosters</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>

      <section className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
        <section className="panel p-5">
          <PanelHead title="Sets les plus ouverts" hint={`Sur ${fmtInt(d.openings.length)} boosters`} />
          <ul className="divide-y divide-ring">
            {topSets.map(([id, n]) => {
              const h = packHue(id);
              return (
                <li key={id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span
                    className="relative flex aspect-[236/380] w-9 shrink-0 items-center justify-center overflow-hidden rounded-md shadow-lg ring-1 ring-white/20"
                    style={{ background: `linear-gradient(160deg, hsl(${h} 70% 52%), hsl(${h} 60% 22%) 70%)` }}
                    aria-hidden
                  >
                    <SetLogo logo={PLAYABLE_BY_ID.get(id)?.logo ?? null} className="max-h-[40%] max-w-[82%] object-contain drop-shadow" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{PLAYABLE_BY_ID.get(id)?.name ?? setName.get(id) ?? id}</p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-raised">
                      <i className="block h-full rounded-full bg-game" style={{ width: `${(n / topSets[0][1]) * 100}%` }} />
                    </div>
                  </div>
                  <span className="num w-12 text-right font-bold">{fmtInt(n)}</span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="panel p-5">
          <PanelHead title="Raretés tirées" hint="Rareté TCGdex, libellés harmonisés" />
          {rarities.map(([k, g]) => (
            <RankRow key={k} label={k} value={g.n} max={rarities[0][1].n} color={TIER_COLOR[tierOf(g.tiers)] ?? "var(--faint)"} />
          ))}
        </section>
      </section>

      <section className="panel p-5">
        <PanelHead title="Tirages rares récents" hint="Ultra rares et secrètes, tous joueurs" />
        {pulls.length === 0 ? (
          <p className="text-sm text-muted">Aucun tirage rare pour l&apos;instant.</p>
        ) : (
          <ul className="grid grid-cols-4 gap-2.5 lg:grid-cols-8">
            {pulls.map((c, i) => {
              const a = byId.get(c.owner_id);
              return (
                <li key={i} className={`min-w-0 ${i >= 4 ? "hidden lg:block" : ""}`}>
                  <div className="card-tile aspect-[63/88]">
                    <CardImage base={c.image_url} alt={c.card_name} placeholder="compact" />
                  </div>
                  <div className="mt-1.5">
                    <Badge tone="gold">{rarityLabel(c.rarity)}</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                    {a && <Avatar name={a.name ?? a.email} hue={a.hue} size="sm" />}
                    <span className="truncate">{relTime(c.obtained_at, d.now)}</span>
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
