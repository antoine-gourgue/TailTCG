"use client";

import Link from "next/link";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { Book, ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { CardImage } from "@/components/card-image";
import { BinderCover, type CoverItem } from "@/components/binder-cover";
import { Toast } from "@/components/toast";
import {
  movePocket,
  placeItemInPocket,
  placeWantedInPocket,
  removeFromPocket,
  updateBinderPageGrid,
} from "@/app/classeurs/actions";
import {
  PAGE_GRIDS,
  layoutPockets,
  pageGrid,
  pocketsPerPage,
} from "@/lib/binder-pages";
import type { CardSearchResult } from "@/lib/tcgdex";

// Classeur simulé : couverture fermée à la taille exacte des pages, puis
// pages perforées sur des anneaux (une feuille vierge face à la page 1,
// ensuite deux par deux). On tourne les pages par les bords, les onglets,
// le clavier ou un balayage ; on glisse une carte vers une pochette, un
// onglet ou un bord ; une pochette vide ouvre un tiroir pour y ranger une
// carte de la collection, ou une carte du catalogue qu'on ne possède pas.

/** Une carte rangée : exemplaire possédé (`i:<item>`) ou hors collection (`w:<id>`) */
export type PocketItem = {
  id: string;
  kind: "owned" | "wanted";
  card_name: string;
  set_name?: string;
  local_id?: string;
  tcgdex_id?: string;
  image_url: string;
  photo_fallback?: string | null;
  quantity: number;
  position: number | null;
  created_at: string;
};

/** Carte de la collection proposée pour remplir une pochette vide */
export type CandidateItem = {
  id: string;
  tcgdex_id: string;
  card_name: string;
  set_name: string;
  local_id: string;
  image_url: string;
  photo_fallback?: string | null;
  quantity: number;
};

/** Identifiant de la ligne derrière une clé de pochette */
const refIdOf = (key: string) => key.slice(2);

/** Déplacement souris avant de « soulever » la carte */
const DRAG_THRESHOLD = 6;
/** Appui long au doigt — en deçà, le geste reste un défilement */
const TOUCH_HOLD_MS = 220;
/** Survol d'un bord ou d'un onglet en glissant : délai avant de tourner */
const HOVER_FLIP_MS = 450;
/** Balayage horizontal minimal pour tourner une page au doigt */
const SWIPE_MIN = 60;
/** Si l'animation d'ouverture ne se termine pas, on ouvre quand même */
const OPEN_FALLBACK_MS = 700;
/** Hauteur relative des anneaux (et des perforations en face) */
const RINGS = [0.13, 0.37, 0.63, 0.87];
/** Cartes affichées au plus dans le tiroir */
const PICKER_MAX = 80;
/** Attente après la frappe avant d'interroger le catalogue */
const SEARCH_DEBOUNCE_MS = 350;

/** Deux pages face à face dès md, une seule en dessous */
const SPREAD_QUERY = "(min-width: 768px)";
function subscribeSpread(onChange: () => void) {
  const mq = window.matchMedia(SPREAD_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const getSpread = () => (window.matchMedia(SPREAD_QUERY).matches ? 2 : 1);
const getSpreadOnServer = () => 2;

/** Largeur d'une page : la moitié de la double page, moins la demi-tranche */
const PAGE_W = "w-full md:w-[calc(50%-1.125rem)] md:flex-none";

type Dir = "next" | "prev";
type Role = "left" | "right" | "single";
type Drag = { id: string; w: number; h: number };
type Pointer = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  offX: number;
  offY: number;
  w: number;
  h: number;
  active: boolean;
  holdTimer: number | null;
};
/**
 * Surcharges optimistes du rangement, valables pour un état serveur donné :
 * dès que le serveur renvoie de nouvelles positions, elles sont oubliées.
 */
type Overrides = {
  key: string;
  map: Map<string, number>;
  extra: Map<string, PocketItem>;
  removed: Set<string>;
};
type Catalog = { q: string; cards: CardSearchResult[]; error: boolean };

/** minuscules sans accents, pour la recherche texte */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Dos du classeur et anneaux métalliques qui traversent les pages */
function Spine({ colorHex }: { colorHex: string | null }) {
  return (
    <div className="relative z-20 w-9 shrink-0 self-stretch" aria-hidden>
      <div
        className="absolute inset-x-0 -inset-y-1.5 rounded-md bg-raised"
        style={colorHex ? { backgroundColor: colorHex } : undefined}
      >
        <div className="absolute inset-0 rounded-md bg-gradient-to-r from-black/40 via-white/10 to-black/45" />
      </div>
      {RINGS.map((t) => (
        <span
          key={t}
          className="absolute left-1/2 h-4 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-zinc-300 shadow-[0_1px_2px_rgba(0,0,0,.7),inset_0_1px_1px_rgba(255,255,255,.6)]"
          style={{ top: `${t * 100}%` }}
        />
      ))}
    </div>
  );
}

function Holes({ side }: { side: "left" | "right" }) {
  return (
    <>
      {RINGS.map((t) => (
        <span
          key={t}
          aria-hidden
          className={`absolute h-3 w-3 -translate-y-1/2 rounded-full bg-black/70 shadow-[inset_0_1px_2px_rgba(0,0,0,.9),0_0_0_1px_rgba(255,255,255,.06)] ${
            side === "left" ? "left-2" : "right-2"
          }`}
          style={{ top: `${t * 100}%` }}
        />
      ))}
    </>
  );
}

export function BinderPages({
  binderId,
  name,
  items,
  candidates = [],
  gridCode,
  colorHex,
  cover,
  readOnly = false,
  hrefBase,
}: {
  binderId: string;
  name: string;
  items: PocketItem[];
  /** Collection complète, pour remplir une pochette vide (propriétaire) */
  candidates?: CandidateItem[];
  gridCode: string | null;
  colorHex: string | null;
  cover: { style: string | null; covers: CoverItem[] };
  readOnly?: boolean;
  /** Préfixe du lien de la fiche d'un exemplaire (`/carte/`) — absent en vitrine */
  hrefBase?: string;
}) {
  const router = useRouter();
  const perView = useSyncExternalStore(
    subscribeSpread,
    getSpread,
    getSpreadOnServer
  );

  const [code, setCode] = useState<string>(pageGrid(gridCode).code);
  const grid = pageGrid(code);
  const perPage = pocketsPerPage(grid);

  // Rangement : base serveur + surcharges optimistes liées à cet état serveur
  const serverKey = items.map((i) => `${i.id}:${i.position ?? ""}`).join("|");
  const base = useMemo(() => layoutPockets(items), [items]);
  const [ov, setOv] = useState<Overrides>({
    key: "",
    map: new Map(),
    extra: new Map(),
    removed: new Set(),
  });
  const live = ov.key === serverKey ? ov : null;
  const pockets = new Map(base);
  if (live) {
    for (const id of live.removed) pockets.delete(id);
    for (const [id, p] of live.map) if (!live.removed.has(id)) pockets.set(id, p);
  }

  const [opened, setOpened] = useState(false);
  const [opening, setOpening] = useState(false);
  const [nav, setNav] = useState<{ view: number; dir: Dir | null }>({
    view: 0,
    dir: null,
  });
  const [drag, setDrag] = useState<Drag | null>(null);
  /** Cible survolée en glissant : `pocket:12` ou `tab:2` */
  const [over, setOver] = useState<string | null>(null);
  /** Pochette en cours de remplissage (tiroir ouvert) */
  const [picker, setPicker] = useState<number | null>(null);
  const [mode, setMode] = useState<"collection" | "catalogue">("collection");
  const [q, setQ] = useState("");
  const [fSet, setFSet] = useState("");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [savingGrid, setSavingGrid] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error";
  } | null>(null);

  const ghostRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<Pointer | null>(null);
  const hoverKey = useRef<string | null>(null);
  const hoverTimer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const itemById = new Map<string, PocketItem>(items.map((i) => [i.id, i]));
  if (live) for (const [id, it] of live.extra) itemById.set(id, it);
  const byPocket = new Map<number, PocketItem>();
  for (const [id, p] of pockets) {
    const item = itemById.get(id);
    if (item) byPocket.set(p, item);
  }
  const count = byPocket.size;
  const maxPocket = Math.max(-1, ...Array.from(pockets.values()));
  const usedPages = Math.max(1, Math.ceil((maxPocket + 1) / perPage));
  // Propriétaire : toujours une page vide à la suite pour y ranger des cartes
  let totalPages = readOnly ? usedPages : usedPages + 1;
  // Après la première page (face à une feuille vierge), les pages vont par
  // deux : total impair
  if (perView === 2 && (totalPages - 1) % 2 === 1) totalPages += 1;
  const totalViews = perView === 2 ? 1 + (totalPages - 1) / 2 : totalPages;
  const view = Math.min(nav.view, totalViews - 1);

  /** Pages d'une vue : la première fait face à une feuille vierge */
  function pagesOf(v: number): (number | "blank")[] {
    if (perView === 1) return [v];
    return v === 0 ? ["blank", 0] : [2 * v - 1, 2 * v];
  }
  function labelOf(v: number): string {
    const ps = pagesOf(v).filter((p): p is number => p !== "blank");
    return ps.length === 2 ? `${ps[0] + 1}–${ps[1] + 1}` : `${ps[0] + 1}`;
  }
  const visible = pagesOf(view);
  const dragItem = drag ? itemById.get(drag.id) : null;
  const dragging = drag != null;
  const pickerOpen = picker != null;

  function go(v: number) {
    const target = Math.max(0, Math.min(totalViews - 1, v));
    setNav((n) => ({ view: target, dir: target >= n.view ? "next" : "prev" }));
  }
  const goNext = () => go(view + 1);
  const goPrev = () => go(view - 1);
  function finishOpening() {
    setOpening(false);
    setOpened(true);
    setNav({ view: 0, dir: "next" });
  }
  function closeBinder() {
    setPicker(null);
    setOpened(false);
    setNav({ view: 0, dir: null });
  }

  // Ouverture : l'animation de la couverture, ou le repli si elle n'aboutit pas
  useEffect(() => {
    if (!opening) return;
    const t = window.setTimeout(finishOpening, OPEN_FALLBACK_MS);
    return () => window.clearTimeout(t);
  }, [opening]);

  // Catalogue TCGdex : recherche différée pendant la frappe
  useEffect(() => {
    if (!pickerOpen || mode !== "catalogue") return;
    const query = q.trim();
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = window.setTimeout(async () => {
      setCatalogLoading(true);
      try {
        const r = await fetch(`/api/tcgdex/search?q=${encodeURIComponent(query)}`, {
          signal: ctrl.signal,
        });
        const d = (await r.json()) as { cards?: CardSearchResult[] };
        setCatalog({
          q: query,
          // Les cartes perso ont déjà leur place dans la collection
          cards: (d.cards ?? []).filter((c) => !c.id.startsWith("custom:")),
          error: !r.ok,
        });
      } catch {
        if (!ctrl.signal.aborted) setCatalog({ q: query, cards: [], error: true });
      } finally {
        if (!ctrl.signal.aborted) setCatalogLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [pickerOpen, mode, q]);

  function patchOv(
    entries: [string, number][],
    extra?: PocketItem,
    removedKey?: string
  ) {
    setOv((cur) => {
      const same = cur.key === serverKey;
      const map = new Map(same ? cur.map : []);
      const ex = new Map(same ? cur.extra : []);
      const removed = new Set(same ? cur.removed : []);
      for (const [k, v] of entries) {
        map.set(k, v);
        removed.delete(k);
      }
      if (extra) ex.set(extra.id, extra);
      if (removedKey) removed.add(removedKey);
      return { key: serverKey, map, extra: ex, removed };
    });
  }

  async function commitMove(id: string, to: number) {
    const before = ov;
    const from = pockets.get(id);
    const occupant = byPocket.get(to);
    const entries: [string, number][] = [[id, to]];
    if (occupant && from != null) entries.push([occupant.id, from]);
    patchOv(entries);

    const { error } = await movePocket(binderId, id, to);
    if (error) {
      setOv(before);
      setToast({ message: "Déplacement non enregistré", tone: "error" });
      return;
    }
    router.refresh();
  }

  function firstFreeIn(v: number, after = -1): number | null {
    for (const pg of pagesOf(v)) {
      if (pg === "blank") continue;
      for (let k = 0; k < perPage; k++) {
        const pocket = pg * perPage + k;
        if (pocket > after && !byPocket.has(pocket)) return pocket;
      }
    }
    return null;
  }

  async function commitMoveToView(id: string, v: number) {
    const pocket = firstFreeIn(v);
    if (pocket == null) {
      setToast({ message: "Ces pages sont pleines", tone: "error" });
      return;
    }
    go(v);
    await commitMove(id, pocket);
  }

  /** Vise la pochette vide suivante pour enchaîner les rangements */
  function advancePicker(fromPocket: number) {
    setPicker(firstFreeIn(view, fromPocket) ?? firstFreeIn(view));
  }

  /** Range un exemplaire de la collection dans la pochette ciblée */
  async function place(c: CandidateItem, pocket: number) {
    advancePicker(pocket);
    const key = `i:${c.id}`;
    if (pockets.has(key)) {
      await commitMove(key, pocket);
      return;
    }
    const before = ov;
    patchOv([[key, pocket]], {
      id: key,
      kind: "owned",
      card_name: c.card_name,
      set_name: c.set_name,
      local_id: c.local_id,
      tcgdex_id: c.tcgdex_id,
      image_url: c.image_url,
      photo_fallback: c.photo_fallback ?? null,
      quantity: c.quantity,
      position: pocket,
      created_at: "",
    });
    const { error } = await placeItemInPocket(binderId, c.id, pocket);
    if (error) {
      setOv(before);
      setToast({ message: "Carte non rangée", tone: "error" });
      return;
    }
    router.refresh();
  }

  /** Range une carte du catalogue qu'on ne possède pas (hors collection) */
  async function placeWanted(c: CardSearchResult, pocket: number) {
    advancePicker(pocket);
    const id = crypto.randomUUID();
    const key = `w:${id}`;
    const before = ov;
    patchOv([[key, pocket]], {
      id: key,
      kind: "wanted",
      card_name: c.name,
      set_name: c.setName,
      local_id: c.localId,
      tcgdex_id: c.id,
      image_url: c.image ?? "",
      quantity: 1,
      position: pocket,
      created_at: "",
    });
    const { error } = await placeWantedInPocket(
      binderId,
      {
        id,
        tcgdex_id: c.id,
        card_name: c.name,
        set_name: c.setName,
        local_id: c.localId,
        image_url: c.image,
      },
      pocket
    );
    if (error) {
      setOv(before);
      setToast({ message: "Carte non rangée", tone: "error" });
      return;
    }
    router.refresh();
  }

  /** Retire une carte de CE classeur — un exemplaire reste dans la collection */
  async function remove(key: string) {
    const item = itemById.get(key);
    const before = ov;
    patchOv([], undefined, key);
    const { error } = await removeFromPocket(binderId, key);
    if (error) {
      setOv(before);
      setToast({ message: "Retrait impossible", tone: "error" });
      return;
    }
    setToast({
      message:
        item?.kind === "wanted"
          ? "Carte hors collection retirée du classeur"
          : "Retirée du classeur — elle reste dans ta collection",
    });
    router.refresh();
  }

  async function changeGrid(nextCode: string) {
    const previous = code;
    setCode(nextCode);
    setSavingGrid(true);
    const { error } = await updateBinderPageGrid(binderId, nextCode);
    setSavingGrid(false);
    if (error) {
      setCode(previous);
      setToast({ message: "Format non enregistré", tone: "error" });
      return;
    }
    router.refresh();
  }

  // ---- Glisser-déposer -----------------------------------------------------

  function placeGhost(x: number, y: number) {
    const p = pointer.current;
    const el = ghostRef.current;
    if (!p || !el) return;
    el.style.transform = `translate3d(${x - p.offX}px, ${y - p.offY}px, 0)`;
  }

  function setHover(key: string | null) {
    if (hoverKey.current === key) return;
    hoverKey.current = key;
    if (hoverTimer.current != null) {
      window.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
    if (!key) return;
    hoverTimer.current = window.setTimeout(() => {
      hoverTimer.current = null;
      const [kind, value] = key.split(":");
      if (kind === "tab") go(Number(value));
      else if (value === "next") goNext();
      else if (value === "prev") goPrev();
    }, HOVER_FLIP_MS);
  }

  function clearPointer() {
    const p = pointer.current;
    if (p?.holdTimer != null) window.clearTimeout(p.holdTimer);
    pointer.current = null;
    setHover(null);
    setDrag(null);
    setOver(null);
  }

  function activate() {
    const p = pointer.current;
    if (!p || p.active) return;
    p.active = true;
    if (p.holdTimer != null) {
      window.clearTimeout(p.holdTimer);
      p.holdTimer = null;
    }
    setPicker(null);
    setDrag({ id: p.id, w: p.w, h: p.h });
  }

  function onCardDown(e: React.PointerEvent<HTMLElement>, id: string) {
    if (readOnly || e.button !== 0 || pointer.current) return;
    suppressClick.current = false;
    const rect = e.currentTarget.getBoundingClientRect();
    const p: Pointer = {
      id,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      offX: e.clientX - rect.left,
      offY: e.clientY - rect.top,
      w: rect.width,
      h: rect.height,
      active: false,
      holdTimer: null,
    };
    pointer.current = p;
    if (e.pointerType !== "mouse") {
      p.holdTimer = window.setTimeout(activate, TOUCH_HOLD_MS);
    }
  }

  /** Avant l'activation : seuil souris, ou annulation si le doigt défile */
  function onCardMove(e: React.PointerEvent<HTMLElement>) {
    const p = pointer.current;
    if (!p || p.active || p.pointerId !== e.pointerId) return;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY);
    if (e.pointerType === "mouse") {
      if (dist > DRAG_THRESHOLD) activate();
    } else if (dist > DRAG_THRESHOLD + 2) {
      clearPointer();
    }
  }

  function onCardUp(e: React.PointerEvent<HTMLElement>) {
    const p = pointer.current;
    if (!p || p.active || p.pointerId !== e.pointerId) return;
    clearPointer();
  }

  function onCardCancel() {
    if (pointer.current && !pointer.current.active) clearPointer();
  }

  // Un glisser actif écoute la fenêtre : il survit au changement de pages
  // (la carte d'origine peut disparaître de l'écran)
  const onWindowMove = useEffectEvent((e: PointerEvent) => {
    const p = pointer.current;
    if (!p || !p.active || p.pointerId !== e.pointerId) return;
    p.lastX = e.clientX;
    p.lastY = e.clientY;
    placeGhost(e.clientX, e.clientY);
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const pocketEl = under?.closest<HTMLElement>("[data-pocket]");
    const tabEl = under?.closest<HTMLElement>("[data-tab]");
    const flipEl = under?.closest<HTMLElement>("[data-flip]");
    const key = pocketEl
      ? `pocket:${pocketEl.dataset.pocket}`
      : tabEl
        ? `tab:${tabEl.dataset.tab}`
        : null;
    setOver((cur) => (cur === key ? cur : key));
    setHover(
      tabEl ? `tab:${tabEl.dataset.tab}` : flipEl ? `flip:${flipEl.dataset.flip}` : null
    );
  });

  const onWindowUp = useEffectEvent((e: PointerEvent) => {
    const p = pointer.current;
    if (!p || p.pointerId !== e.pointerId) return;
    if (!p.active) {
      clearPointer();
      return;
    }
    suppressClick.current = true;
    const under = document.elementFromPoint(e.clientX, e.clientY);
    const pocketEl = under?.closest<HTMLElement>("[data-pocket]");
    const tabEl = under?.closest<HTMLElement>("[data-tab]");
    const id = p.id;
    clearPointer();
    if (pocketEl) {
      const to = Number(pocketEl.dataset.pocket);
      if (to !== pockets.get(id)) void commitMove(id, to);
    } else if (tabEl) {
      void commitMoveToView(id, Number(tabEl.dataset.tab));
    }
  });

  const onWindowCancel = useEffectEvent(() => clearPointer());

  useEffect(() => {
    if (!dragging) return;
    const block = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowCancel);
    // Pendant un glisser tactile, empêcher la page de défiler sous le doigt
    document.addEventListener("touchmove", block, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onWindowMove);
      window.removeEventListener("pointerup", onWindowUp);
      window.removeEventListener("pointercancel", onWindowCancel);
      document.removeEventListener("touchmove", block);
    };
  }, [dragging]);

  // Le fantôme apparaît sous le pointeur dès qu'il est monté
  useEffect(() => {
    if (!dragging) return;
    const p = pointer.current;
    if (p) placeGhost(p.lastX, p.lastY);
  }, [dragging]);

  /** Un clic qui suit un dépôt ne doit ni naviguer ni ouvrir le tiroir */
  function swallowClick(): boolean {
    if (!suppressClick.current) return false;
    suppressClick.current = false;
    return true;
  }

  // ---- Balayage tactile et clavier ----------------------------------------

  function onSpreadDown(e: React.PointerEvent) {
    if (e.pointerType === "mouse") return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  }
  function onSpreadUp(e: React.PointerEvent) {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId || pointer.current?.active) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > 50) return;
    if (dx < 0) goNext();
    else if (view === 0) closeBinder();
    else goPrev();
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape" && pickerOpen) {
      e.preventDefault();
      setPicker(null);
      return;
    }
    if (!opened || pickerOpen) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      goNext();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (view === 0) closeBinder();
      else goPrev();
    }
  }

  /** Animation d'entrée d'une page selon le sens du changement */
  function turnClass(role: Role): string {
    if (!nav.dir) return "";
    // À l'ouverture, la page 1 se rabat depuis les anneaux
    if (perView === 2 && view === 0) return role === "right" ? "page-turn-right" : "page-fade";
    if (nav.dir === "next") return role === "right" ? "page-fade" : "page-turn-left";
    return role === "left" ? "page-fade" : "page-turn-right";
  }

  // ---- Tiroir de choix d'une carte ----------------------------------------

  const sets = useMemo(
    () =>
      [...new Set(candidates.map((c) => c.set_name))].sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [candidates]
  );
  const needle = normalize(q.trim());
  const results =
    !pickerOpen || mode !== "collection"
      ? []
      : candidates
          .filter(
            (c) =>
              (!fSet || c.set_name === fSet) &&
              (!needle ||
                normalize(`${c.card_name} ${c.set_name} ${c.local_id}`).includes(
                  needle
                ))
          )
          // Les cartes pas encore dans ce classeur d'abord
          .sort(
            (a, b) =>
              (pockets.has(`i:${a.id}`) ? 1 : 0) - (pockets.has(`i:${b.id}`) ? 1 : 0)
          )
          .slice(0, PICKER_MAX);
  /** Exemplaire possédé et carte hors collection déjà rangée, par carte TCGdex */
  const ownedByTcgdex = new Map<string, CandidateItem>();
  for (const c of candidates) if (!ownedByTcgdex.has(c.tcgdex_id)) ownedByTcgdex.set(c.tcgdex_id, c);
  const wantedByTcgdex = new Map<string, PocketItem>();
  for (const it of itemById.values()) {
    if (it.kind === "wanted" && it.tcgdex_id && pockets.has(it.id)) wantedByTcgdex.set(it.tcgdex_id, it);
  }
  const catalogFresh = catalog != null && catalog.q === q.trim();

  // ---- Rendu ---------------------------------------------------------------

  function renderEdge(dir: Dir, side: "left" | "right") {
    // Au bord gauche de la première page, on referme le classeur
    const closes = dir === "prev" && view === 0;
    const enabled = closes || (dir === "next" ? view < totalViews - 1 : true);
    if (!enabled) return null;
    const Icon = dir === "next" ? ChevronRight : ChevronLeft;
    const label = closes
      ? "Fermer le classeur"
      : dir === "next"
        ? "Pages suivantes"
        : "Pages précédentes";
    return (
      <button
        type="button"
        data-flip={closes ? undefined : dir}
        onClick={closes ? closeBinder : dir === "next" ? goNext : goPrev}
        aria-label={label}
        title={label}
        className={`group/edge absolute inset-y-0 z-10 flex w-7 cursor-pointer items-center justify-center text-faint transition hover:text-foreground ${
          side === "left"
            ? "left-0 rounded-l-[inherit] hover:bg-gradient-to-r hover:from-black/25 hover:to-transparent"
            : "right-0 rounded-r-[inherit] hover:bg-gradient-to-l hover:from-black/25 hover:to-transparent"
        }`}
      >
        <Icon size={18} className="opacity-40 transition group-hover/edge:opacity-100" aria-hidden />
      </button>
    );
  }

  /** Feuille vierge face à la page 1 (l'intérieur de la couverture) */
  function renderBlankPage() {
    return (
      <section
        key="blank"
        aria-label="Feuille vierge"
        className={`relative z-0 min-w-0 rounded-l-xl border border-edge bg-surface shadow-[var(--shadow-panel)] ${PAGE_W} ${turnClass("left")}`}
      >
        <span
          aria-hidden
          className="absolute inset-y-2 -left-1 w-1 rounded-sm border border-edge bg-raised"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-12 rounded-r-[inherit] bg-gradient-to-l from-black/30 to-transparent"
        />
        <Holes side="right" />
        {renderEdge("prev", "left")}
      </section>
    );
  }

  function renderPage(pageIdx: number, role: Role, phantom = false) {
    // Perforations côté anneaux ; page seule (mobile) : perforée à gauche
    const holesLeft = role !== "left";
    return (
      <section
        key={pageIdx}
        aria-label={phantom ? undefined : `Page ${pageIdx + 1}`}
        aria-hidden={phantom || undefined}
        className={`relative z-0 min-w-0 border border-edge bg-surface shadow-[var(--shadow-panel)] [backface-visibility:hidden] ${
          // Fantôme : il remplit le conteneur qui a déjà la largeur d'une page
          phantom ? "invisible w-full" : PAGE_W
        } ${
          role === "left" ? "rounded-l-xl" : role === "right" ? "rounded-r-xl" : "rounded-xl"
        } ${phantom ? "" : turnClass(role)}`}
      >
        {/* Feuilles empilées derrière, côté extérieur */}
        <span
          aria-hidden
          className={`absolute inset-y-2 w-1 rounded-sm border border-edge bg-raised ${
            holesLeft ? "-right-1" : "-left-1"
          }`}
        />
        <span
          aria-hidden
          className={`absolute inset-y-4 w-1 rounded-sm border border-edge bg-raised/60 ${
            holesLeft ? "-right-2" : "-left-2"
          }`}
        />
        {/* Ombre de gouttière et perforations */}
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-y-0 w-12 ${
            holesLeft
              ? "left-0 rounded-l-[inherit] bg-gradient-to-r from-black/30 to-transparent"
              : "right-0 rounded-r-[inherit] bg-gradient-to-l from-black/30 to-transparent"
          }`}
        />
        <Holes side={holesLeft ? "left" : "right"} />

        {/* Bords cliquables pour tourner (et cibles de survol en glissant) */}
        {!phantom && role === "left" && renderEdge("prev", "left")}
        {!phantom && role === "right" && renderEdge("next", "right")}
        {!phantom && role === "single" && renderEdge("prev", "left")}
        {!phantom && role === "single" && renderEdge("next", "right")}

        <div
          className={`grid gap-2 py-3 pb-6 sm:gap-2.5 sm:py-4 sm:pb-7 ${
            role === "single" ? "px-8" : holesLeft ? "pl-7 pr-8 sm:pl-8" : "pl-8 pr-7 sm:pr-8"
          }`}
          style={{
            gridTemplateColumns: `repeat(${grid.cols}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: perPage }, (_, k) => {
            const pocket = pageIdx * perPage + k;
            const item = phantom ? undefined : byPocket.get(pocket);
            const isSource = drag?.id === item?.id;
            const isOver =
              dragging && over === `pocket:${pocket}` && pockets.get(drag.id) !== pocket;
            const isTarget = !phantom && picker === pocket;
            const href =
              item && item.kind === "owned" && hrefBase
                ? `${hrefBase}${refIdOf(item.id)}`
                : null;
            const handlers =
              item && !readOnly
                ? {
                    onPointerDown: (e: React.PointerEvent<HTMLElement>) =>
                      onCardDown(e, item.id),
                    onPointerMove: onCardMove,
                    onPointerUp: onCardUp,
                    onPointerCancel: onCardCancel,
                    onDragStart: (e: React.DragEvent) => e.preventDefault(),
                  }
                : {};
            const cardCls = `block h-full w-full select-none [-webkit-touch-callout:none] ${
              readOnly ? "" : "touch-manipulation cursor-grab active:cursor-grabbing"
            }`;
            const wantedLabel =
              item?.kind === "wanted" &&
              (readOnly || !item.tcgdex_id ? (
                <span className="tile-badge bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]">
                  Hors collection
                </span>
              ) : (
                <Link
                  href={`/ajouter?card=${encodeURIComponent(item.tcgdex_id)}`}
                  title="Ajouter cette carte à ma collection"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (swallowClick()) e.preventDefault();
                  }}
                  className="tile-badge bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] transition hover:!bg-accent hover:!text-accent-ink"
                >
                  Hors collection
                </Link>
              ));
            const card = item && (
              <div
                className={`card-tile h-full w-full transition-opacity ${
                  isSource ? "opacity-30" : ""
                } ${item.kind === "wanted" ? "saturate-[.8]" : ""}`}
              >
                <CardImage
                  base={item.image_url || null}
                  alt={item.card_name}
                  fallback={item.photo_fallback ?? null}
                />
                {item.quantity > 1 && (
                  <span className="tile-badge num right-1 top-1">×{item.quantity}</span>
                )}
                {wantedLabel}
              </div>
            );
            const fillable = !phantom && !item && !readOnly;
            return (
              <div
                key={pocket}
                data-pocket={phantom ? undefined : pocket}
                onClick={
                  fillable
                    ? () => {
                        if (!swallowClick()) setPicker(pocket);
                      }
                    : undefined
                }
                className={`group/p relative aspect-[63/88] rounded-md bg-black/25 shadow-[inset_0_2px_8px_rgba(0,0,0,.45)] transition ${
                  isOver || isTarget ? "ring-2 ring-accent" : "ring-1 ring-white/[0.06]"
                } ${fillable ? "cursor-pointer hover:ring-edge-strong" : ""}`}
                title={fillable ? "Ranger une carte ici" : undefined}
              >
                {/* Re-clé par carte : l'image ne doit pas survivre à un échange */}
                {item && (
                  <div key={item.id} className="absolute inset-[3%]">
                    {href ? (
                      <Link
                        href={href}
                        draggable={false}
                        className={cardCls}
                        onClick={(e) => {
                          if (swallowClick()) e.preventDefault();
                        }}
                        {...handlers}
                      >
                        {card}
                      </Link>
                    ) : (
                      <div className={cardCls} {...handlers}>
                        {card}
                      </div>
                    )}
                  </div>
                )}
                {item && !readOnly && (
                  <button
                    type="button"
                    aria-label="Retirer du classeur"
                    title={
                      item.kind === "owned"
                        ? "Retirer de ce classeur (la carte reste dans ta collection)"
                        : "Retirer cette carte hors collection du classeur"
                    }
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!swallowClick()) void remove(item.id);
                    }}
                    className="absolute left-1 top-1 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-white/20 bg-black/65 text-white/90 opacity-0 shadow backdrop-blur-sm transition hover:!bg-loss hover:!text-white group-hover/p:opacity-100 pointer-coarse:opacity-100"
                  >
                    <X size={12} aria-hidden />
                  </button>
                )}
                {fillable && (
                  <Plus
                    size={20}
                    strokeWidth={1.5}
                    aria-hidden
                    className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-faint transition ${
                      isTarget ? "opacity-90 text-accent-strong" : "opacity-0 group-hover/p:opacity-70"
                    }`}
                  />
                )}
                {isTarget && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 animate-pulse rounded-md ring-2 ring-accent"
                  />
                )}
                {/* Pochette plastique : reflet et ouverture en haut */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-md bg-gradient-to-br from-white/[0.09] via-transparent to-black/10"
                />
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-[8%] top-0 h-px bg-white/20"
                />
              </div>
            );
          })}
        </div>
        <span
          className={`num absolute bottom-2 text-[11px] text-faint ${
            holesLeft ? "right-4" : "left-4"
          }`}
        >
          {pageIdx + 1}
        </span>
      </section>
    );
  }

  function renderTabs(orientation: "vertical" | "horizontal") {
    const vertical = orientation === "vertical";
    return (
      <div
        aria-label="Onglets"
        className={
          vertical
            ? "scrollbar-none absolute right-0 top-8 z-30 flex max-h-[calc(100%-4rem)] flex-col gap-1.5 overflow-y-auto pb-1"
            : "scrollbar-none mt-3 flex gap-1.5 overflow-x-auto pb-1"
        }
      >
        {Array.from({ length: totalViews }, (_, v) => {
          const active = v === view;
          const target = dragging && over === `tab:${v}`;
          return (
            <button
              key={v}
              type="button"
              data-tab={v}
              onClick={() => go(v)}
              aria-current={active ? "page" : undefined}
              title={dragging ? "Déposer sur cette page" : `Aller aux pages ${labelOf(v)}`}
              className={`num shrink-0 text-[11px] font-semibold shadow-md transition ${
                vertical
                  ? "h-9 min-w-[2.75rem] rounded-r-lg border border-l-0 px-2"
                  : "h-8 min-w-[2.5rem] rounded-lg border px-2"
              } ${
                active
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-edge bg-raised text-muted hover:text-foreground"
              } ${target ? "ring-2 ring-accent" : ""}`}
            >
              {labelOf(v)}
            </button>
          );
        })}
      </div>
    );
  }

  function renderCatalogResults(pocket: number) {
    const query = q.trim();
    if (query.length < 2) {
      return (
        <p className="text-sm text-muted">
          Tape au moins deux lettres : la carte trouvée occupera la pochette en
          attendant que tu l&apos;aies, marquée « Hors collection ».
        </p>
      );
    }
    if (catalogLoading && !catalogFresh) {
      return <p className="text-sm text-muted">Recherche dans le catalogue…</p>;
    }
    if (!catalog || !catalogFresh) return null;
    if (catalog.error) {
      return (
        <p className="text-sm text-loss">
          TCGdex est injoignable, réessaie dans un instant.
        </p>
      );
    }
    if (catalog.cards.length === 0) {
      return <p className="text-sm text-muted">Aucune carte ne correspond.</p>;
    }
    return (
      <ul className="grid grid-cols-3 gap-3 xl:grid-cols-4">
        {catalog.cards.slice(0, PICKER_MAX).map((c) => {
          const owned = ownedByTcgdex.get(c.id);
          const wanted = wantedByTcgdex.get(c.id);
          const wantedAt = wanted ? pockets.get(wanted.id) : undefined;
          const title = owned
            ? "Tu la possèdes : ranger ton exemplaire ici"
            : wanted
              ? `Déjà page ${Math.floor((wantedAt ?? 0) / perPage) + 1} — déplacer ici`
              : "Ranger ici, hors collection";
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() =>
                  owned
                    ? void place(owned, pocket)
                    : wanted
                      ? void commitMove(wanted.id, pocket)
                      : void placeWanted(c, pocket)
                }
                className="group/c block w-full text-left"
                title={title}
              >
                <div className="card-tile aspect-[63/88]">
                  <CardImage base={c.image} alt={c.name} />
                  {owned ? (
                    <span className="tile-badge left-1.5 top-1.5 !bg-accent !text-accent-ink">
                      Collection
                    </span>
                  ) : wanted ? (
                    <span className="tile-badge num left-1.5 top-1.5">
                      p. {Math.floor((wantedAt ?? 0) / perPage) + 1}
                    </span>
                  ) : (
                    <span className="tile-badge bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px]">
                      Hors collection
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-xs font-medium transition group-hover/c:text-accent-strong">
                  {c.name}
                </p>
                <p className="truncate text-[11px] text-faint">
                  {c.setName} · <span className="num">{c.localId}</span>
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  function renderPicker() {
    if (picker == null) return null;
    const pocket = picker;
    const page = Math.floor(pocket / perPage) + 1;
    const slot = (pocket % perPage) + 1;
    const close = () => setPicker(null);
    const modeBtn = (m: typeof mode, label: string) => (
      <button
        type="button"
        onClick={() => setMode(m)}
        aria-pressed={mode === m}
        className={`rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
          mode === m ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground"
        }`}
      >
        {label}
      </button>
    );
    return (
      <>
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={close} aria-hidden />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Ranger une carte"
          className="drawer-in fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-edge bg-surface shadow-2xl sm:w-[460px] xl:w-[560px]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-edge px-5 py-4">
            <div>
              <p className="display text-base font-semibold">Ranger une carte</p>
              <p className="mt-0.5 text-sm text-muted">
                Page <span className="num">{page}</span>, pochette{" "}
                <span className="num">{slot}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-edge bg-raised text-muted transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>
          </header>

          <div className="flex flex-col gap-2.5 border-b border-edge px-5 py-3">
            <div className="inline-flex self-start rounded-lg border border-edge bg-surface p-0.5">
              {modeBtn("collection", "Ma collection")}
              {modeBtn("catalogue", "Catalogue TCGdex")}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  aria-hidden
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
                />
                <input
                  type="text"
                  autoFocus
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={
                    mode === "collection" ? "Nom, numéro…" : "Nom de la carte, numéro…"
                  }
                  className="field !pl-9 text-[13px]"
                />
              </div>
              {mode === "collection" && sets.length > 1 && (
                <select
                  value={fSet}
                  onChange={(e) => setFSet(e.target.value)}
                  className="field !w-auto max-w-[45%] text-[13px]"
                  aria-label="Extension"
                >
                  <option value="">Toutes les extensions</option>
                  {sets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {mode === "catalogue" ? (
              renderCatalogResults(pocket)
            ) : candidates.length === 0 ? (
              <p className="text-sm text-muted">
                Ta collection est vide — cherche une carte dans le catalogue.
              </p>
            ) : results.length === 0 ? (
              <p className="text-sm text-muted">Aucune carte ne correspond.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-3 xl:grid-cols-4">
                {results.map((c) => {
                  const at = pockets.get(`i:${c.id}`);
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => void place(c, pocket)}
                        className="group/c block w-full text-left"
                        title={
                          at != null
                            ? `Déjà page ${Math.floor(at / perPage) + 1} — déplacer ici`
                            : "Ranger ici"
                        }
                      >
                        <div
                          className={`card-tile aspect-[63/88] ${
                            at != null ? "opacity-60 group-hover/c:opacity-100" : ""
                          }`}
                        >
                          <CardImage
                            base={c.image_url || null}
                            alt={c.card_name}
                            fallback={c.photo_fallback ?? null}
                          />
                          {at != null && (
                            <span className="tile-badge num left-1.5 top-1.5">
                              p. {Math.floor(at / perPage) + 1}
                            </span>
                          )}
                          {c.quantity > 1 && (
                            <span className="tile-badge num right-1.5 top-1.5">
                              ×{c.quantity}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 truncate text-xs font-medium transition group-hover/c:text-accent-strong">
                          {c.card_name}
                        </p>
                        <p className="truncate text-[11px] text-faint">
                          {c.set_name} · <span className="num">{c.local_id}</span>
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {mode === "collection" && results.length >= PICKER_MAX && (
              <p className="mt-3 text-xs text-faint">
                Affine ta recherche pour voir d&apos;autres cartes.
              </p>
            )}
          </div>

          <footer className="border-t border-edge px-5 py-3 text-xs text-faint">
            Après chaque carte rangée, la pochette vide suivante est visée. Échap
            pour fermer.
          </footer>
        </aside>
      </>
    );
  }

  return (
    <div className="outline-none" tabIndex={0} onKeyDown={onKeyDown}>
      {!opened ? (
        <div className="flex flex-col items-center py-2 md:pr-12">
          {/* La page fantôme donne à la couverture la taille exacte des pages */}
          <div className={`relative ${PAGE_W}`}>
            {renderPage(0, perView === 2 ? "right" : "single", true)}
            <button
              type="button"
              onClick={() => !opening && setOpening(true)}
              disabled={opening}
              aria-label="Ouvrir le classeur"
              className="group absolute inset-0 [perspective:2000px]"
            >
              <div
                className={`h-full w-full transition-transform duration-300 [transform-origin:left_center] group-hover:[transform:rotateY(-7deg)] ${
                  opening ? "cover-open" : ""
                }`}
                onAnimationEnd={finishOpening}
              >
                <BinderCover
                  style={cover.style}
                  covers={cover.covers}
                  name={name}
                  colorHex={colorHex}
                  fill
                />
              </div>
            </button>
          </div>
          <p className="mt-5 text-sm text-muted">Clique pour ouvrir le classeur</p>
          <p className="num mt-1 text-xs text-faint">
            {count} carte{count > 1 ? "s" : ""} · {usedPages} page{usedPages > 1 ? "s" : ""} · {grid.cols}×{grid.rows}
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={closeBinder}
                className="btn btn-ghost !px-2.5 text-[13px]"
                title="Fermer le classeur"
              >
                <Book size={14} aria-hidden />
                Couverture
              </button>
              <span className="num text-sm text-muted">
                Page{labelOf(view).includes("–") ? "s" : ""} {labelOf(view)}
                <span className="text-faint"> / {totalPages}</span>
              </span>
            </div>
            {!readOnly && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="hidden text-xs text-faint xl:inline">
                  Glisse une carte vers une pochette, un onglet ou un bord · clique une pochette vide pour y ranger une carte
                </span>
                <select
                  value={code}
                  onChange={(e) => changeGrid(e.target.value)}
                  disabled={savingGrid}
                  className="field !w-auto text-[13px]"
                  aria-label="Format des pages"
                >
                  {PAGE_GRIDS.map((g) => (
                    <option key={g.code} value={g.code}>
                      {g.cols}×{g.rows} · {g.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="relative md:pr-12">
            <div
              className="flex items-stretch justify-center [perspective:2000px]"
              onPointerDown={onSpreadDown}
              onPointerUp={onSpreadUp}
            >
              {visible.map((pg, i) => {
                const role: Role = perView === 1 ? "single" : i === 0 ? "left" : "right";
                return (
                  <Fragment key={pg}>
                    {role === "right" && <Spine colorHex={colorHex} />}
                    {pg === "blank" ? renderBlankPage() : renderPage(pg, role)}
                  </Fragment>
                );
              })}
            </div>
            {perView === 2 && renderTabs("vertical")}
          </div>
          {perView === 1 && renderTabs("horizontal")}
        </>
      )}

      {dragItem && drag && (
        <div
          ref={ghostRef}
          className="pointer-events-none fixed left-0 top-0 z-50 will-change-transform"
          style={{ width: drag.w, height: drag.h }}
          aria-hidden
        >
          <div className="card-tile h-full w-full rotate-2 scale-105 !shadow-2xl">
            <CardImage
              base={dragItem.image_url || null}
              alt=""
              fallback={dragItem.photo_fallback ?? null}
            />
          </div>
        </div>
      )}

      {renderPicker()}

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDone={() => setToast(null)}
        />
      )}
    </div>
  );
}
