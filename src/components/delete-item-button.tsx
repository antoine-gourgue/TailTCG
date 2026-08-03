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
      <button
        type="submit"
        className="rounded-lg border border-red-900 px-4 py-2 text-sm text-red-400 transition hover:border-red-700 hover:text-red-300"
      >
        Supprimer
      </button>
    </form>
  );
}
