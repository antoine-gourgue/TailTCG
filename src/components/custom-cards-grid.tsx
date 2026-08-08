"use client";

import Link from "next/link";
import { Trash2 } from "lucide-react";
import { deleteCustomCard } from "@/app/ajouter/manuel/actions";
import { CardImage } from "@/components/card-image";
import { ConfirmAction } from "@/components/confirm-action";

export type CustomCardTile = {
  id: string;
  name: string;
  setName: string;
  localId: string;
  image: string | null;
};

export function CustomCardsGrid({ tiles }: { tiles: CustomCardTile[] }) {
  if (tiles.length === 0) {
    return (
      <p className="text-sm text-muted">
        Aucune carte hors catalogue pour l&apos;instant.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {tiles.map((card) => (
        <li key={card.id} className="group relative">
          <Link href={`/ajouter?card=custom:${card.id}`} className="block">
            <div className="card-tile aspect-[63/88]">
              <CardImage base={card.image} alt={card.name} direct />
            </div>
            <div className="mt-2.5 px-0.5">
              <p className="truncate text-sm font-medium leading-tight group-hover:text-accent-strong">
                {card.name}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {card.setName}{" "}
                <span className="num text-faint">· {card.localId}</span>
              </p>
            </div>
          </Link>
          <div className="absolute right-2 top-2 z-20 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            <ConfirmAction
              action={deleteCustomCard}
              fields={{ card_id: card.id }}
              title={`Supprimer « ${card.name} » ?`}
              message="La carte, sa photo ET tes exemplaires en collection (avec leurs photos) seront supprimés définitivement."
              trigger={<Trash2 size={13} aria-hidden />}
              triggerAriaLabel="Supprimer la carte hors catalogue"
              triggerClassName="flex h-7 w-7 items-center justify-center rounded-lg bg-black/70 text-white backdrop-blur-sm transition hover:bg-loss"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
