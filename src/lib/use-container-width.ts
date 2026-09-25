"use client";

import { useEffect, useRef, useState } from "react";

/** Largeur courante d'un conteneur (ResizeObserver), pour dessiner un SVG à l'échelle 1 px = 1 unité */
export function useContainerWidth<T extends HTMLElement>(initial = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}
