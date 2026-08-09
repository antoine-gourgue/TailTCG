import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookTabs } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatEur } from "@/lib/domain";
import { binderColorHex } from "@/lib/binder-colors";
import { signStorageImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import { CardImage } from "@/components/card-image";
import { NewBinderButton } from "@/components/new-binder-button";

export const metadata = {
  title: "Classeurs — TailTCG",
};

type CoverItem = { image_url: string };

// Couverture de classeur : tranche perforée discrète, page de
// pochettes 2×2 légèrement en retrait
function BinderCover({
  covers,
  name,
  colorHex,
}: {
  covers: CoverItem[];
  name: string;
  colorHex: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-l-lg rounded-r-xl border border-edge bg-surface transition-transform duration-300 group-hover:-translate-y-1">
      {/* Tranche perforée, teintée si une couleur est choisie */}
      <div
        className="absolute inset-y-0 left-0 flex w-7 flex-col items-center justify-evenly border-r border-edge bg-raised py-3"
        style={colorHex ? { backgroundColor: colorHex } : undefined}
      >
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full border border-edge-strong bg-surface"
            aria-hidden
          />
        ))}
      </div>
      {/* Page de pochettes */}
      <div className="ml-7 p-2.5">
        <div className="grid grid-cols-2 gap-1.5 rounded-lg bg-raised/40 p-2 ring-1 ring-edge/60">
          {[0, 1, 2, 3].map((i) =>
            covers[i] ? (
              <div key={i} className="card-tile relative aspect-[63/88]">
                <CardImage base={covers[i].image_url || null} alt={name} />
                <span
                  className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/10 via-transparent to-transparent"
                  aria-hidden
                />
              </div>
            ) : (
              <div
                key={i}
                className="aspect-[63/88] rounded-lg border border-dashed border-edge bg-raised/50"
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default async function ClasseursPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: binders }, { data: links }, { data: items }] = await Promise.all([
    supabase
      .from("binders")
      .select("id, name, created_at, color, cover_item_ids")
      .order("created_at"),
    supabase
      .from("binder_items")
      .select("binder_id, item_id, added_at")
      .order("added_at"),
    supabase
      .from("collection_value")
      .select("id, image_url, quantity, current_price"),
  ]);

  const signedItems = await signStorageImages(
    (items ?? []) as { id: string; image_url: string; quantity: number; current_price: number | null }[]
  );
  const itemById = new Map(signedItems.map((i) => [i.id, i]));

  const enriched = (binders ?? []).map((b) => {
    const memberIds = (links ?? [])
      .filter((l) => l.binder_id === b.id)
      .map((l) => l.item_id);
    let count = 0;
    let value = 0;
    let hasValue = false;
    const covers: CoverItem[] = [];
    for (const id of memberIds) {
      const item = itemById.get(id);
      if (!item) continue;
      count += item.quantity;
      if (item.current_price != null) {
        value += item.current_price * item.quantity;
        hasValue = true;
      }
      if (covers.length < 4 && item.image_url) covers.push(item);
    }
    // Couverture choisie par l'utilisateur, sinon les 4 premières
    const chosen = (b.cover_item_ids ?? [])
      .map((id) => itemById.get(id))
      .filter((i): i is NonNullable<typeof i> => i != null && !!i.image_url);
    return {
      ...b,
      count,
      value: hasValue ? value : null,
      covers: chosen.length > 0 ? chosen : covers,
    };
  });

  return (
    <AppShell>
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display text-3xl font-bold tracking-tight">Classeurs</h1>
          <NewBinderButton />
        </div>

        {enriched.length === 0 ? (
          <div className="panel rise-in flex flex-col items-center gap-3 p-12 text-center">
            <NotebookTabs size={48} strokeWidth={1.2} className="text-faint" aria-hidden />
            <p className="display text-xl font-semibold">Aucun classeur</p>
            <p className="max-w-sm text-sm text-muted">
              Crée des sous-collections thématiques — toutes tes Pikachu, tes
              primes, tes gradées — puis sélectionne les cartes de ta collection
              à y ranger.
            </p>
          </div>
        ) : (
          <ul className="rise-in grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {enriched.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/classeurs/${b.id}`}
                  className="panel group block overflow-hidden p-4 transition hover:border-edge-strong"
                >
                  <BinderCover
                    covers={b.covers}
                    name={b.name}
                    colorHex={binderColorHex(b.color)}
                  />
                  <p className="mt-3 truncate text-base font-semibold group-hover:text-accent-strong">
                    {b.name}
                  </p>
                  <p className="mt-0.5 text-sm text-muted">
                    <span className="num">{b.count}</span> carte
                    {b.count > 1 ? "s" : ""}
                    {b.value != null && (
                      <>
                        {" "}
                        · <span className="num">{formatEur(b.value)}</span>
                      </>
                    )}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </AppShell>
  );
}
