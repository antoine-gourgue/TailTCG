"use client";

import { useRouter } from "next/navigation";
import { Toast } from "@/components/toast";

// Confirmation après un ajout (retour sur la collection), puis nettoie l'URL.
export function AddedToast({ count }: { count: number }) {
  const router = useRouter();
  return (
    <Toast
      message={`${count} carte${count > 1 ? "s" : ""} ajoutée${count > 1 ? "s" : ""} — à compléter`}
      onDone={() => router.replace("/", { scroll: false })}
    />
  );
}
