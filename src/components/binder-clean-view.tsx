"use client";

import { createContext, useContext, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

// Vue propre du classeur en pages : masque le grisé et les libellés des
// cartes hors collection. L'état est partagé entre le bouton (dans l'en-tête,
// avec les autres actions) et BinderPages, via ce contexte.

type CleanViewCtx = { clean: boolean; toggle: () => void };

const Ctx = createContext<CleanViewCtx>({ clean: false, toggle: () => {} });

export function useCleanView(): CleanViewCtx {
  return useContext(Ctx);
}

export function CleanViewProvider({ children }: { children: React.ReactNode }) {
  const [clean, setClean] = useState(false);
  return (
    <Ctx.Provider value={{ clean, toggle: () => setClean((v) => !v) }}>
      {children}
    </Ctx.Provider>
  );
}

/** Bouton à placer dans l'en-tête, avec les autres actions du classeur */
export function CleanViewToggle() {
  const { clean, toggle } = useCleanView();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={clean}
      title={
        clean
          ? "Remettre en évidence les cartes manquantes"
          : "Afficher le classeur complet, sans le grisé des manquantes"
      }
      className="btn btn-ghost !px-2.5 text-[13px]"
    >
      {clean ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
      <span className="hidden sm:inline">{clean ? "Voir manquantes" : "Vue propre"}</span>
    </button>
  );
}
