"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Dialogue de l'app, une seule DA : bottom-sheet sur mobile (poignée,
// glisser vers le bas pour fermer, safe-area), dialogue centré dès sm avec
// une croix dans l'en-tête. Sortie animée avant démontage.

type Size = "xs" | "sm" | "md" | "lg" | "xl";
const WIDTH: Record<Size, string> = {
  xs: "sm:max-w-xs",
  sm: "sm:max-w-sm",
  md: "sm:max-w-md",
  lg: "sm:max-w-lg",
  xl: "sm:max-w-2xl",
};

/** Sous sm : sheet par le bas, glisser pour fermer */
const SHEET_QUERY = "(max-width: 639px)";
function subscribeSheet(onChange: () => void) {
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getSheet = () => window.matchMedia(SHEET_QUERY).matches;
const getSheetOnServer = () => false;

// Montage client (pour le portail) sans setState dans un effet
const noopSubscribe = () => () => {};
/** Glissement au-delà duquel la sheet se ferme */
const CLOSE_DY = 90;

export function Sheet({
  open,
  onClose,
  label,
  title,
  description,
  header,
  size = "sm",
  flush = false,
  dismissible = true,
  z = "z-50",
  children,
}: {
  open: boolean;
  /** Appelé après l'animation de sortie (voile, Échap, glisser, croix) */
  onClose: () => void;
  /** Libellé accessible (par défaut : le titre) */
  label?: string;
  title?: ReactNode;
  description?: ReactNode;
  /** En-tête sur mesure, à la place de titre + description */
  header?: ReactNode;
  size?: Size;
  /** Sans marges internes : le contenu gère sa propre mise en page */
  flush?: boolean;
  /** Faux pendant un envoi : voile, Échap et glisser ne ferment plus */
  dismissible?: boolean;
  z?: string;
  children: ReactNode;
}) {
  const [closing, setClosing] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef({ startY: 0, dy: 0, active: false });
  const isSheet = useSyncExternalStore(subscribeSheet, getSheet, getSheetOnServer);
  // Rendu dans document.body : le dialogue échappe à tout contexte
  // d'empilement d'une page (ex. <main class="relative z-10">) et passe donc
  // bien au-dessus du dock mobile
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  function requestClose() {
    if (!dismissible || closing) return;
    setClosing(true);
  }

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") requestClose();
    }
    window.addEventListener("keydown", onKey);
    // Le fond ne défile pas sous le dialogue
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = prev;
    };
    // requestClose lit dismissible/closing au moment de l'appel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Glisser la sheet vers le bas (mobile, tactile)
  function onDown(e: React.PointerEvent) {
    if (!isSheet || !dismissible || e.pointerType === "mouse") return;
    drag.current = { startY: e.clientY, dy: 0, active: true };
    // L'animation d'entrée (fill: both) l'emporterait sur le transform inline
    if (panel.current) panel.current.style.animation = "none";
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture indisponible : le glisser reste suivi par les events suivants
    }
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    if (!d.active) return;
    d.dy = Math.max(0, e.clientY - d.startY);
    if (panel.current) panel.current.style.transform = `translateY(${d.dy}px)`;
  }
  function onUp() {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    const el = panel.current;
    if (d.dy > CLOSE_DY) {
      if (el) el.style.animation = "";
      requestClose();
    } else if (el) {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "";
      window.setTimeout(() => {
        el.style.transition = "";
      }, 220);
    }
    d.dy = 0;
  }

  if (!open || !mounted) return null;

  const hasHeader = header != null || title != null;

  return createPortal(
    <div className={`fixed inset-0 ${z} flex items-end justify-center sm:items-center sm:p-4`}>
      <div
        className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${
          closing ? "fade-out" : "backdrop-in"
        }`}
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        onClick={(e) => e.stopPropagation()}
        onAnimationEnd={(e) => {
          if (e.target !== panel.current) return;
          if (e.animationName === "sheet-out" || e.animationName === "dialog-out") {
            setClosing(false);
            onClose();
          }
        }}
        className={`${closing ? "modal-out" : "modal-in"} relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border-t border-edge bg-surface shadow-2xl sm:max-h-[88vh] sm:rounded-2xl sm:border ${WIDTH[size]}`}
      >
        {/* Zone de préhension : poignée + en-tête */}
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className={`shrink-0 ${isSheet && dismissible ? "cursor-grab select-none active:cursor-grabbing" : ""} ${
            hasHeader && flush ? "border-b border-edge" : ""
          }`}
          style={isSheet ? { touchAction: "none" } : undefined}
        >
          <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
            <span className="h-1 w-9 rounded-full bg-edge-strong" />
          </div>
          {hasHeader ? (
            <div className="flex items-start gap-3 px-5 pb-3 pt-3 sm:pt-5">
              {header ?? (
                <div className="min-w-0 flex-1">
                  <p className="display text-base font-semibold">{title}</p>
                  {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                </div>
              )}
              {dismissible && (
                <button
                  type="button"
                  onClick={requestClose}
                  aria-label="Fermer"
                  className="-mr-2 -mt-1 hidden h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground sm:flex"
                >
                  <X size={16} aria-hidden />
                </button>
              )}
            </div>
          ) : (
            dismissible && (
              <button
                type="button"
                onClick={requestClose}
                aria-label="Fermer"
                className="absolute right-3 top-3 z-10 hidden h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-raised hover:text-foreground sm:flex"
              >
                <X size={16} aria-hidden />
              </button>
            )
          )}
        </div>

        {/* flush : colonne flex sans défilement propre, le contenu gère ses
            zones (corps qui défile + pied fixe) */}
        <div
          className={
            flush
              ? "flex min-h-0 flex-1 flex-col"
              : `min-h-0 flex-1 overflow-y-auto px-5 ${hasHeader ? "pt-1" : "pt-4 sm:pt-5"}`
          }
          style={{
            paddingBottom: flush
              ? "env(safe-area-inset-bottom)"
              : "calc(1.25rem + env(safe-area-inset-bottom))",
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
