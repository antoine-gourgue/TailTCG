"use client";

import { Trash2 } from "lucide-react";
import { deleteItem } from "@/app/items/actions";
import { ConfirmAction } from "@/components/confirm-action";

export function DeleteItemButton({ itemId }: { itemId: string }) {
  return (
    <ConfirmAction
      action={deleteItem}
      fields={{ item_id: itemId }}
      title="Supprimer cet exemplaire ?"
      message="La carte, ses photos et son historique disparaîtront de ta collection, sans retour possible."
      trigger={
        <>
          <Trash2 size={15} aria-hidden />
          Supprimer cet exemplaire
        </>
      }
      triggerClassName="btn btn-danger"
    />
  );
}
