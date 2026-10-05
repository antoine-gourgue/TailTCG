import { CardImage } from "@/components/card-image";
import type { AdminItem } from "@/lib/admin-data";

type Top = { name: string; set: string; image: string; qty: number };

/** Cartes les plus possédées, toutes collections : par visuel, quantités cumulées */
export function topOwned(items: AdminItem[], n = 12): Top[] {
  const owned = new Map<string, Top>();
  for (const i of items) {
    if (i.sold_at != null || !i.image_url?.includes("tcgdex")) continue;
    const g = owned.get(i.image_url) ?? { name: i.card_name, set: i.set_name, image: i.image_url, qty: 0 };
    g.qty += i.quantity ?? 1;
    owned.set(i.image_url, g);
  }
  return [...owned.values()].sort((a, b) => b.qty - a.qty).slice(0, n);
}

/** Grille de vignettes avec quantité ; au-delà de 6, desktop seulement */
export function TopCardsGrid({ cards }: { cards: Top[] }) {
  if (cards.length === 0) return <p className="text-sm text-muted">Aucune carte.</p>;
  return (
    <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
      {cards.map((c, i) => (
        <li key={c.image} className={`min-w-0 ${i >= 6 ? "hidden sm:block" : ""}`}>
          <div className="card-tile relative aspect-[63/88]">
            <CardImage base={c.image} alt={c.name} placeholder="compact" />
            <span className="num absolute right-1 top-1 rounded-md bg-black/75 px-1.5 py-px text-[10.5px] font-bold text-white backdrop-blur">×{c.qty}</span>
          </div>
          <p className="mt-1.5 truncate text-[11px]">{c.name}</p>
          <p className="truncate text-[10px] text-faint">{c.set}</p>
        </li>
      ))}
    </ul>
  );
}
