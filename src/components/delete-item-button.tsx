"use client";

import { deleteItem } from "@/app/items/actions";

export function DeleteItemButton({ itemId }: { itemId: string }) {
  return (
    <form
      action={deleteItem}
      onSubmit={(e) => {
        if (!window.confirm("Supprimer cet exemplaire de la collection ?")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="item_id" value={itemId} />
      <button type="submit" className="btn btn-danger">
        Supprimer cet exemplaire
      </button>
    </form>
  );
}
