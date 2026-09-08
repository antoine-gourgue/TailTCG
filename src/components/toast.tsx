"use client";

import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, CircleAlert } from "lucide-react";

// Notification éphémère en bas d'écran, se retire toute seule. Rendue dans
// document.body (portail) avec un z élevé pour toujours passer au-dessus des
// dialogues (sinon un <main class="relative z-10"> la piège derrière eux).
const noopSubscribe = () => () => {};

export function Toast({
  message,
  tone = "success",
  onDone,
  duration = 3500,
}: {
  message: string;
  tone?: "success" | "error";
  onDone: () => void;
  duration?: number;
}) {
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="status"
      className="rise-in fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-1/2 z-[100] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full border border-edge bg-raised px-4 py-2.5 text-sm shadow-lg md:bottom-6"
    >
      {tone === "success" ? (
        <CircleCheck size={16} className="shrink-0 text-gain" aria-hidden />
      ) : (
        <CircleAlert size={16} className="shrink-0 text-loss" aria-hidden />
      )}
      {message}
    </div>,
    document.body
  );
}
