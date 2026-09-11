"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

// Dialogue de l'app, une seule DA : bottom-sheet sur mobile (poignée, croix,
// glisser vers le bas pour fermer depuis n'importe où quand le contenu est en
// haut, safe-area), dialogue centré dès sm avec une croix dans l'en-tête.
// Sortie animée avant démontage.

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
/** Un geste vif ferme même court (px/ms) */
const FLICK = 0.5;
/** Déplacement avant de trancher entre glisser la sheet et défiler */
const SLOP = 6;

/** Le conteneur qui défile sous le doigt (dans la sheet), s'il y en a un */
function scrollerOf(target: EventTarget | null, root: HTMLElement): HTMLElement | null {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== root) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
    el = el.parentElement;
  }
  return null;
}

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
  const closingRef = useRef(false);
  const panel = useRef<HTMLDivElement>(null);
  const isSheet = useSyncExternalStore(subscribeSheet, getSheet, getSheetOnServer);
  // Rendu dans document.body : le dialogue échappe à tout contexte
  // d'empilement d'une page (ex. <main class="relative z-10">) et passe donc
  // bien au-dessus du dock mobile
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  function requestClose() {
    if (!dismissible || closingRef.current) return;
    closingRef.current = true;
    // Un glisser a pu poser `animation: none` en inline : sans le retirer, la
    // classe de sortie n'animerait jamais et la sheet resterait bloquée
    if (panel.current) panel.current.style.animation = "";
    setClosing(true);
  }
  function finishClose() {
    if (!closingRef.current) return;
    closingRef.current = false;
    setClosing(false);
    onClose();
  }

  // Filet : si l'animation de sortie ne se termine pas (onglet masqué,
  // animation coupée), on ferme quand même
  useEffect(() => {
    if (!closing) return;
    const id = window.setTimeout(finishClose, 450);
    return () => window.clearTimeout(id);
    // finishClose lit closingRef au moment de l'appel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

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

  // Glisser la sheet vers le bas (mobile, tactile) depuis n'importe où : la
  // poignée, l'en-tête, ou le contenu quand il est déjà défilé tout en haut.
  // Écouteurs natifs non passifs : React rend touchmove passif, impossible
  // alors d'empêcher le défilement pendant le geste.
  useEffect(() => {
    const el = panel.current;
    if (!open || !isSheet || !dismissible || !el) return;
    let startX = 0;
    let startY = 0;
    let t0 = 0;
    let dy = 0;
    let armed = false;
    let dragging = false;
    let scroller: HTMLElement | null = null;

    const settle = () => {
      el.style.transition = "transform 0.2s ease";
      el.style.transform = "";
      window.setTimeout(() => {
        el.style.transition = "";
      }, 220);
    };
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      t0 = performance.now();
      dy = 0;
      dragging = false;
      scroller = scrollerOf(e.target, el);
      armed = !scroller || scroller.scrollTop <= 0;
    };
    const onMove = (e: TouchEvent) => {
      if (!armed || closingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const d = t.clientY - startY;
      if (!dragging) {
        if (Math.abs(d) < SLOP && Math.abs(dx) < SLOP) return;
        // Vers le haut ou surtout latéral : on laisse le contenu faire
        if (d < 0 || Math.abs(dx) > Math.abs(d)) {
          armed = false;
          return;
        }
        dragging = true;
        // L'animation d'entrée (fill: both) l'emporterait sur le transform inline
        el.style.animation = "none";
      }
      if (scroller && scroller.scrollTop > 0) {
        armed = false;
        dragging = false;
        settle();
        return;
      }
      dy = Math.max(0, d);
      e.preventDefault();
      el.style.transform = `translateY(${dy}px)`;
    };
    const onEnd = () => {
      if (!armed || !dragging) return;
      armed = false;
      dragging = false;
      const speed = dy / Math.max(1, performance.now() - t0);
      if (dy > CLOSE_DY || (dy > 24 && speed > FLICK)) {
        // sheet-out part de la position courante (pas de « from »)
        requestClose();
      } else {
        settle();
      }
      dy = 0;
    };
    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
    // requestClose lit dismissible/closing au moment de l'appel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isSheet, dismissible]);

  if (!open || !mounted) return null;

  const hasHeader = header != null || title != null;
  const closeBtn = dismissible && (
    <button
      type="button"
      onClick={requestClose}
      aria-label="Fermer"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised/80 text-muted transition hover:bg-raised hover:text-foreground sm:h-8 sm:w-8 sm:bg-transparent"
    >
      <X size={17} aria-hidden />
    </button>
  );

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
          if (e.animationName === "sheet-out" || e.animationName === "dialog-out") finishClose();
        }}
        className={`${closing ? "modal-out" : "modal-in"} relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border-t border-edge bg-surface shadow-2xl sm:max-h-[88vh] sm:rounded-2xl sm:border ${WIDTH[size]}`}
      >
        {/* Poignée + en-tête : zone où le glisser n'est jamais un défilement */}
        <div
          className={`shrink-0 ${isSheet && dismissible ? "select-none" : ""} ${
            hasHeader && flush ? "border-b border-edge" : ""
          }`}
          style={isSheet ? { touchAction: "none" } : undefined}
        >
          <div className="flex justify-center pb-1 pt-2.5 sm:hidden" aria-hidden>
            <span className="h-1 w-10 rounded-full bg-edge-strong" />
          </div>
          {hasHeader ? (
            <div className="flex items-start gap-3 px-5 pb-3 pt-2 sm:pt-5">
              {header ?? (
                <div className="min-w-0 flex-1">
                  <p className="display text-base font-semibold">{title}</p>
                  {description && <p className="mt-1 text-sm text-muted">{description}</p>}
                </div>
              )}
              <div className="-mr-2 -mt-1">{closeBtn}</div>
            </div>
          ) : (
            dismissible && <div className="absolute right-3 top-3 z-10">{closeBtn}</div>
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
