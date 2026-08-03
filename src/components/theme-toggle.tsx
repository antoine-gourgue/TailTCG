"use client";

import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";

// Petit store externe : le thème vit sur <html data-theme>, la bascule
// notifie React sans passer par un état dupliqué.
let listeners: Array<() => void> = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

function getTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme, () => "dark" as const);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    listeners.forEach((l) => l());
  }

  return { theme, toggle };
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
      title={theme === "dark" ? "Thème clair" : "Thème sombre"}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
    >
      {theme === "dark" ? (
        <Sun size={15} strokeWidth={2} aria-hidden />
      ) : (
        <Moon size={15} strokeWidth={2} aria-hidden />
      )}
    </button>
  );
}
