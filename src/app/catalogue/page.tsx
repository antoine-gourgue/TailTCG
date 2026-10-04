import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { CatalogLang } from "@/lib/tcgdex";
import { catalogSeries } from "@/lib/catalog";
import { MERGED_INTO } from "@/lib/set-merge";
import { AppShell } from "@/components/app-shell";
import { PageHead } from "@/components/page-head";
import { PhoneCaptureButton } from "@/components/capture/phone-capture-button";
import { SearchClient, type RecentCard, type SetProgress } from "./search-client";

export const metadata = {
  title: "Catalogue — TailTCG",
};

const SETS_SHOWN = 4;
const RECENT_SHOWN = 6;

export default async function RecherchePage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/connexion");

  const { lang: langParam } = await searchParams;
  const lang: CatalogLang = langParam === "ja" ? "ja" : "fr";

  // Les deux catalogues : « Tes sets en cours » ne dépend pas de l'onglet affiché
  const [seriesFr, seriesJa, { count: customCount }, { count: pokedexCount }, { data: owned }] = await Promise.all([
    catalogSeries("fr"),
    catalogSeries("ja"),
    supabase.from("custom_cards").select("id", { count: "exact", head: true }),
    supabase.from("pokedex").select("id", { count: "exact", head: true }),
    // Toute la collection active : repères « déjà possédée », sets en cours, dernières ajoutées
    supabase
      .from("collection_value")
      .select("id, tcgdex_id, quantity, set_id, set_name, card_name, local_id, image_url, rarity, language, created_at")
      .is("sold_at", null)
      .order("created_at", { ascending: false }),
  ]);

  const series = lang === "ja" ? seriesJa : seriesFr;
  const frIndex = new Map(seriesFr.flatMap((s) => s.sets.map((x) => [x.id, x] as const)));
  const jaIndex = new Map(seriesJa.flatMap((s) => s.sets.map((x) => [x.id, x] as const)));

  const ownedQty: Record<string, number> = {};
  const ownedBySet: Record<string, Set<string>> = {};
  const setMeta = new Map<string, { name: string; lastAt: string; ja: boolean; cover: string | null }>();
  for (const o of owned ?? []) {
    if (!o.tcgdex_id || !o.set_id) continue;
    ownedQty[o.tcgdex_id] = (ownedQty[o.tcgdex_id] ?? 0) + (o.quantity ?? 1);
    // Set présenté au sein d'un autre (Collection Classique → 30ᵉ Anniversaire) : compté avec lui
    const sid = MERGED_INTO[o.set_id] ?? o.set_id;
    (ownedBySet[sid] ??= new Set()).add(o.tcgdex_id);
    const m = setMeta.get(sid);
    const at = o.created_at ?? "";
    if (!m) setMeta.set(sid, { name: o.set_name ?? sid, lastAt: at, ja: o.language === "JP", cover: o.image_url });
    else if (at > m.lastAt) m.lastAt = at;
  }
  const ownedCountBySet: Record<string, number> = Object.fromEntries(Object.entries(ownedBySet).map(([k, v]) => [k, v.size]));

  // Sets en cours : les derniers touchés, avec leur avancement (total connu par le catalogue)
  const setsInProgress: SetProgress[] = [...setMeta.entries()]
    .sort((a, b) => b[1].lastAt.localeCompare(a[1].lastAt))
    .map(([id, m]) => {
      // Le set vient du catalogue FR ou JA, quel que soit l'onglet affiché
      const fr = frIndex.get(id);
      const cat = fr ?? jaIndex.get(id);
      const ja = !fr && (jaIndex.has(id) || m.ja);
      const total = cat?.cardCount?.total ?? cat?.cardCount?.official ?? null;
      return { id, name: cat?.name ?? m.name, logo: cat?.logo ?? null, symbol: cat?.symbol ?? null, cover: cat?.logo ? null : m.cover, ja, owned: ownedBySet[id].size, total, releaseDate: cat?.releaseDate ?? null };
    })
    .filter((s) => s.total == null || s.owned < s.total)
    .slice(0, SETS_SHOWN);

  const recent: RecentCard[] = (owned ?? [])
    .filter((o) => o.id && o.card_name)
    .slice(0, RECENT_SHOWN)
    .map((o) => ({ id: o.id!, tcgdexId: o.tcgdex_id!, name: o.card_name!, setId: o.set_id!, setName: o.set_name ?? "", localId: o.local_id ?? "", image: o.image_url, rarity: o.rarity, qty: o.quantity ?? 1, ja: o.language === "JP" }));

  return (
    <AppShell>
      <main className="relative z-10 page py-8">
        <PageHead kicker="Explorer" title="Catalogue" sub="Cherche, scanne ou feuillette : tout le catalogue FR et JA, plus tes cartes hors catalogue.">
          <Link href="/ajouter/manuel" className="btn btn-ghost shrink-0">
            <FilePlus size={15} aria-hidden />
            <span className="hidden sm:inline">Hors catalogue</span>
            <span className="sm:hidden">Hors catalogue</span>
          </Link>
          <PhoneCaptureButton kind="detect" label="Scanner" icon="scan" directHref="/scanner" className="btn btn-primary shrink-0 shadow-lg shadow-accent/30" />
        </PageHead>
        <SearchClient
          series={series}
          lang={lang}
          customCount={customCount ?? 0}
          pokedexCount={pokedexCount ?? 0}
          ownedQty={ownedQty}
          ownedCountBySet={ownedCountBySet}
          setsInProgress={setsInProgress}
          recent={recent}
        />
      </main>
    </AppShell>
  );
}
