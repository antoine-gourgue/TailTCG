import Link from "next/link";
import { redirect } from "next/navigation";
import { Trash2, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { signStorageImages } from "@/lib/images";
import { formatEur } from "@/lib/domain";
import { getCard } from "@/lib/tcgdex";
import { overrideCardmarketId } from "@/lib/cardmarket-overrides";
import { resolveCardmarketPrice } from "@/lib/cardmarket";
import { AppShell } from "@/components/app-shell";
import { CardImage } from "@/components/card-image";
import { removeFromWishlist } from "./actions";

export const metadata = {
  title: "Recherchées — TailTCG",
};

export default async function WishlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows } = await supabase
    .from("wishlist")
    .select("id, tcgdex_id, card_name, set_name, local_id, image_url")
    .order("created_at", { ascending: false });

  const wishes = await signStorageImages(rows ?? [], user.id);

  // Cote Cardmarket de chaque carte recherchée : fiche TCGdex (cache 24 h) puis guide local
  const prices = new Map<string, number>();
  await Promise.all(
    wishes
      .filter((w) => !w.tcgdex_id.startsWith("custom:"))
      .slice(0, 80)
      .map(async (w) => {
        const card = await getCard(w.tcgdex_id).catch(() => null);
        if (!card) return;
        const price = await resolveCardmarketPrice(overrideCardmarketId(card.id, card.pricing?.cardmarket?.idProduct), card.pricing?.cardmarket);
        if (price != null) prices.set(w.tcgdex_id, price);
      })
  );
  const total = [...prices.values()].reduce((a, v) => a + v, 0);

  return (
    <AppShell>
      <main className="page py-8">
        <h1 className="display mb-1 text-3xl font-bold tracking-tight">
          Recherchées
        </h1>
        <p className="mb-6 text-sm text-muted">
          Ton carnet de chasse : ces cartes sortent automatiquement de la liste
          quand tu les ajoutes à ta collection.
          {prices.size > 0 && (
            <>
              {" "}
              Au cours Cardmarket, il te manque <span className="num text-foreground">≈ {formatEur(total)}</span>
              {prices.size < wishes.length ? ` (${prices.size} carte${prices.size > 1 ? "s" : ""} cotée${prices.size > 1 ? "s" : ""} sur ${wishes.length})` : ""}.
            </>
          )}
        </p>

        {wishes.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <Star size={32} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">
              Aucune carte recherchée
            </p>
            <p className="max-w-sm text-sm text-muted">
              Sur la page d&apos;ajout d&apos;une carte, clique sur « Je la
              cherche » pour la garder à l&apos;œil.
            </p>
            <Link href="/recherche" className="btn btn-primary mt-2">
              Parcourir le catalogue
            </Link>
          </div>
        ) : (
          <ul className="rise-in grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {wishes.map((wish) => (
              <li key={wish.id} className="group relative">
                <Link
                  href={`/ajouter?card=${encodeURIComponent(wish.tcgdex_id)}`}
                  className="block"
                >
                  <div className="card-tile aspect-[63/88]">
                    <CardImage base={wish.image_url || null} alt={wish.card_name} />
                  </div>
                  <div className="mt-2.5 px-0.5">
                    <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                      {wish.card_name}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {wish.set_name}{" "}
                      <span className="num text-faint">· {wish.local_id}</span>
                    </p>
                    <p className="mt-1 flex items-baseline justify-between gap-2 text-xs">
                      <span className="text-accent">Je l&apos;ai trouvée →</span>
                      {prices.has(wish.tcgdex_id) && (
                        <span className="num shrink-0 text-muted" title="Cote Cardmarket">
                          {formatEur(prices.get(wish.tcgdex_id)!)}
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
                <form
                  action={removeFromWishlist}
                  className="absolute right-2 top-2 z-20 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100"
                >
                  <input type="hidden" name="wish_id" value={wish.id} />
                  <button
                    type="submit"
                    title="Retirer des recherchées"
                    aria-label="Retirer des recherchées"
                    className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur-sm transition hover:bg-loss"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
