"use client";

import { useEffect, useState } from "react";
import { Logo } from "@/components/logo";

// Voile de chargement : le logo animé reste affiché tant que les images
// visibles à l'écran ne sont pas toutes arrivées, puis fondu de sortie.
export function ImageGate() {
  const [state, setState] = useState<"waiting" | "fading" | "done">("waiting");

  useEffect(() => {
    let cancelled = false;

    function reveal() {
      if (cancelled) return;
      setState("fading");
      setTimeout(() => {
        if (!cancelled) setState("done");
      }, 350);
    }

    function pendingVisibleImages(): HTMLImageElement[] {
      const vh = window.innerHeight;
      return Array.from(document.querySelectorAll("img")).filter((img) => {
        if (img.complete) return false;
        const r = img.getBoundingClientRect();
        return r.bottom > 0 && r.top < vh + 100;
      });
    }

    // Un tick pour laisser le DOM se poser, puis on attend les images du
    // premier écran (garde-fou à 6 s pour ne jamais bloquer)
    const start = setTimeout(() => {
      const pending = pendingVisibleImages();
      if (pending.length === 0) {
        reveal();
        return;
      }
      let left = pending.length;
      const onSettle = () => {
        left -= 1;
        if (left <= 0) reveal();
      };
      for (const img of pending) {
        img.addEventListener("load", onSettle, { once: true });
        img.addEventListener("error", onSettle, { once: true });
      }
    }, 80);

    const failsafe = setTimeout(reveal, 6000);

    return () => {
      cancelled = true;
      clearTimeout(start);
      clearTimeout(failsafe);
    };
  }, []);

  if (state === "done") return null;

  return (
    <div
      aria-hidden
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-5 bg-background transition-opacity duration-300 ${
        state === "fading" ? "pointer-events-none opacity-0" : "opacity-100"
      }`}
    >
      <span className="logo-loader">
        <Logo variant="mark" size={76} interactive={false} />
      </span>
      <span className="flex items-center gap-1">
        <span className="loader-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="loader-dot h-1.5 w-1.5 rounded-full bg-accent" />
        <span className="loader-dot h-1.5 w-1.5 rounded-full bg-accent" />
      </span>
    </div>
  );
}
