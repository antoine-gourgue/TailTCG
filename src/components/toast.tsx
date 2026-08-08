"use client";

import { useEffect } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";

// Notification éphémère en bas d'écran, se retire toute seule
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
  useEffect(() => {
    const t = setTimeout(onDone, duration);
    return () => clearTimeout(t);
  }, [onDone, duration]);

  return (
    <div
      role="status"
      className="rise-in fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-edge bg-raised px-4 py-2.5 text-sm shadow-lg"
    >
      {tone === "success" ? (
        <CircleCheck size={16} className="shrink-0 text-gain" aria-hidden />
      ) : (
        <CircleAlert size={16} className="shrink-0 text-loss" aria-hidden />
      )}
      {message}
    </div>
  );
}
