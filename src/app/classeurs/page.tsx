import Link from "next/link";
import { redirect } from "next/navigation";
import { NotebookTabs } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatEur } from "@/lib/domain";
import { signStorageImages } from "@/lib/images";
import { AppShell } from "@/components/app-shell";
import { CardImage } from "@/components/card-image";
import { NewBinderButton } from "@/components/new-binder-button";

export const metadata = {
  title: "Classeurs — TailTCG",
};

type CoverItem = { image_url: string };

// Jusqu'à trois cartes en éventail sur la tuile
function CoverFan({ covers, name }: { covers: CoverItem[]; name: string }) {
  if (covers.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-faint">
        <NotebookTabs size={40} strokeWidth={1.2} aria-hidden />
      </div>
    );
  }
  const mid = (covers.length - 1) / 2;
  return (
    <div className="relative h-40 overflow-hidden">
      {covers.map((c, i) => (
        <div
          key={i}
          className="card-tile absolute left-1/2 top-3 aspect-[63/88] w-24 transition-transform duration-300 group-hover:-translate-y-1"
          style={{
            transform: `translateX(-50%) translateX(${(i - mid) * 42}px) rotate(${
              (i - mid) * 9
            }deg)`,
            transformOrigin: "bottom center",
            zIndex: i === Math.floor(mid + 0.5) ? 3 : 1,
          }}
        >
          <CardImage base={c.image_url || null} alt={name} />
        </div>
      ))}
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
    supabase.from("binders").select("id, name, created_at").order("created_at"),
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
      if (covers.length < 3 && item.image_url) covers.push(item);
    }
    return { ...b, count, value: hasValue ? value : null, covers };
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
                  <CoverFan covers={b.covers} name={b.name} />
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
