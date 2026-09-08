"use client";

import { useState, useTransition } from "react";
import { NotebookTabs } from "lucide-react";
import { createBinderFromSet } from "@/app/classeurs/actions";
import { Toast } from "@/components/toast";

// Crée un classeur reprenant tout le set (redirection gérée par l'action)
export function BinderFromSetButton({
  setId,
  lang,
}: {
  setId: string;
  lang: "fr" | "ja";
}) {
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error";
  } | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await createBinderFromSet(setId, lang);
            if (res?.error) setToast({ message: res.error, tone: "error" });
          })
        }
        className="btn btn-ghost"
        title="Créer un classeur reprenant tout ce set"
      >
        <NotebookTabs size={15} aria-hidden />
        {pending ? "Création…" : "Classeur du set"}
      </button>
      {toast && (
        <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />
      )}
    </>
  );
}
