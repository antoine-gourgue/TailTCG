"use client";

import { useRouter } from "next/navigation";
import { Toast } from "@/components/toast";

// Confirmation après un ajout (retour sur la collection), puis nettoie l'URL.
// `complete` : ajout en lot déjà renseigné (prix, état…), rien à compléter.
export function AddedToast({ count, complete = false }: { count: number; complete?: boolean }) {
  const router = useRouter();
  return (
    <Toast
      message={`${count} carte${count > 1 ? "s" : ""} ajoutée${count > 1 ? "s" : ""} ${complete ? "à ta collection" : "— à compléter"}`}
      onDone={() => router.replace("/cartes", { scroll: false })}
    />
  );
}
