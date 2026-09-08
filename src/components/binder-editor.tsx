"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Book,
  BookOpen,
  ChevronLeft,
  ImagePlus,
  Search,
  Trash2,
} from "lucide-react";
import {
  BG_COLORS,
  ELEMENT_SIZES,
  FONTS,
  TEXT_COLORS,
  TEXT_MAX,
  TEXT_SIZES,
  ZONES,
  ZONE_LABELS,
  renderCover,
  type CoverElement,
  type CoverLayout,
  type ZoneKey,
} from "@/lib/binder-cover";
import {
  COVER_TEXTURES,
  PAGE_COLORS,
  POCKET_FINISHES,
  RING_COUNTS,
  RING_FINISHES,
  SHEETS,
  coverTextureClass,
  pocketSheen,
  ringHex,
  ringPositions,
  type BinderDesign,
} from "@/lib/binder-design";
import { BINDER_COLORS, binderColorHex } from "@/lib/binder-colors";
import { BINDER_STYLES, binderStyle, binderStyleCovers } from "@/lib/binder-styles";
import { PAGE_GRIDS, pageGrid, pocketsPerPage } from "@/lib/binder-pages";
import {
  deleteCoverImage,
  saveBinderEditor,
  uploadCoverImage,
} from "@/app/classeurs/cover-actions";
import { BinderCover } from "@/components/binder-cover";
import { CardImage } from "@/components/card-image";
import { Toast } from "@/components/toast";

// Éditeur unifié du classeur : aperçu en direct (fermé ou ouvert) à gauche,
// options à droite — couverture (style, couleur, matière, composition sur
// mesure ou cartes de couverture) et intérieur (feuilles, format, pochettes,
// numéros, anneaux). Un seul « Enregistrer » persiste tout.

export type EditorCard = { id: string; name: string; image_url: string };
export type EditorSet = {
  id: string;
  name: string;
  serie: string;
  logo: string | null;
  symbol: string | null;
};

const ELEMENT_KINDS = [
  { code: "none", label: "Vide" },
  { code: "text", label: "Texte" },
  { code: "logo", label: "Logo d'extension" },
  { code: "image", label: "Image" },
  { code: "card", label: "Carte" },
] as const;
type ElementKind = (typeof ELEMENT_KINDS)[number]["code"];
const BG_KINDS = [
  { code: "color", label: "Couleur" },
  { code: "image", label: "Image" },
  { code: "card", label: "Carte" },
] as const;
const STYLE_LABELS = BINDER_STYLES.map((s) => ({ code: s.code, label: s.label }));
const GRID_OPTIONS = PAGE_GRIDS.map((g) => ({ code: g.code, label: `${g.cols}×${g.rows}` }));
const PAGE_COLOR_OPTIONS = PAGE_COLORS.map((p) => ({ code: p.code, label: p.label }));
const NUMBER_OPTIONS = [
  { code: "on", label: "Affichés" },
  { code: "off", label: "Masqués" },
] as const;

/** minuscules sans accents, pour la recherche texte */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/** Rangée de choix exclusifs, en pastilles */
function Chips<T extends string>({
  options,
  value,
  onPick,
  label,
}: {
  options: readonly { code: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((o) => {
        const active = o.code === value;
        return (
          <button
            key={o.code}
            type="button"
            onClick={() => onPick(o.code)}
            aria-pressed={active}
            className={`rounded-lg border px-2.5 py-1.5 text-[12px] font-medium transition ${
              active
                ? "border-accent/50 bg-accent-soft text-accent-strong"
                : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pastilles de couleur + code libre */
function ColorPicker({
  colors,
  value,
  onPick,
  label,
  withNeutral = false,
}: {
  colors: readonly string[];
  value: string | null;
  onPick: (hex: string | null) => void;
  label: string;
  withNeutral?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {withNeutral && (
        <button
          type="button"
          onClick={() => onPick(null)}
          title="Neutre"
          aria-pressed={value == null}
          className={`h-7 w-7 rounded-full border bg-raised text-[10px] text-muted transition ${
            value == null ? "border-accent ring-2 ring-accent/40" : "border-edge hover:scale-110"
          }`}
        >
          ∅
        </button>
      )}
      {colors.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          title={c}
          aria-pressed={value === c}
          className={`h-7 w-7 rounded-full border transition ${
            value === c ? "border-foreground ring-2 ring-accent/40" : "border-black/20 hover:scale-110"
          }`}
          style={{ backgroundColor: c }}
        />
      ))}
      <label
        className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-edge bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]"
        title="Autre couleur"
      >
        <input
          type="color"
          value={value ?? "#ffffff"}
          onChange={(e) => onPick(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Autre couleur"
        />
      </label>
    </div>
  );
}

function CardPicker({
  cards,
  isSelected,
  onPick,
  order,
}: {
  cards: EditorCard[];
  isSelected: (id: string) => boolean;
  onPick: (id: string) => void;
  /** Numéro d'ordre affiché (cartes de couverture) */
  order?: (id: string) => number | null;
}) {
  if (cards.length === 0) {
    return <p className="text-xs text-faint">Range d&apos;abord des cartes dans le classeur.</p>;
  }
  return (
    <div className="grid max-h-52 grid-cols-5 gap-2 overflow-y-auto pr-1">
      {cards.map((c) => {
        const pos = order?.(c.id) ?? null;
        const sel = isSelected(c.id);
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(c.id)}
            title={c.name}
            aria-pressed={sel}
            className="group/cover relative"
          >
            <div
              className={`card-tile aspect-[63/88] transition ${
                sel ? "outline outline-2 outline-offset-2 outline-accent" : "opacity-80 group-hover/cover:opacity-100"
              }`}
            >
              <CardImage base={c.image_url || null} alt={c.name} />
            </div>
            {pos != null && (
              <span className="num absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink shadow">
                {pos + 1}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function BinderEditor({
  binderId,
  name,
  initialStyle,
  initialColor,
  initialCoverIds,
  initialGrid,
  initialDesign,
  initialLayout,
  initialUrls,
  cards,
  sets,
}: {
  binderId: string;
  name: string;
  initialStyle: string | null;
  initialColor: string | null;
  initialCoverIds: string[];
  initialGrid: string | null;
  initialDesign: BinderDesign;
  initialLayout: CoverLayout;
  initialUrls: Record<string, string>;
  cards: EditorCard[];
  sets: EditorSet[];
}) {
  const router = useRouter();
  const [style, setStyle] = useState(binderStyle(initialStyle));
  const [color, setColor] = useState<string | null>(initialColor);
  const [coverIds, setCoverIds] = useState<string[]>(initialCoverIds);
  const [grid, setGrid] = useState(pageGrid(initialGrid).code);
  const [design, setDesign] = useState<BinderDesign>(initialDesign);
  const [layout, setLayout] = useState<CoverLayout>(initialLayout);
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);
  const [preview, setPreview] = useState<"ferme" | "ouvert">("ferme");
  const [zone, setZone] = useState<ZoneKey>("mc");
  const [logoQ, setLogoQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: "success" | "error" } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<"bg" | ZoneKey>("bg");

  const colorHex = binderColorHex(color);
  const cardUrl = (id: string) => cards.find((c) => c.id === id)?.image_url ?? null;
  const render = renderCover(layout, (p) => urls[p] ?? null, cardUrl);
  const el = layout.zones[zone] ?? null;
  const kind: ElementKind = el?.type ?? "none";
  const isCustom = style === "custom";
  const maxCovers = binderStyleCovers(style);
  const setD = (patch: Partial<BinderDesign>) => setDesign((d) => ({ ...d, ...patch }));

  // Aperçu fermé (styles modèles) : cartes choisies, sinon les premières
  const chosen = coverIds
    .map((id) => cards.find((c) => c.id === id))
    .filter((c): c is EditorCard => c != null && !!c.image_url);
  const previewCovers = (chosen.length > 0 ? chosen : cards.filter((c) => c.image_url))
    .slice(0, Math.max(maxCovers, 1))
    .map((c) => ({ image_url: c.image_url }));

  function setBg(patch: Partial<CoverLayout["bg"]>) {
    setLayout((l) => ({ ...l, bg: { ...l.bg, ...patch } }));
  }
  function setZoneEl(key: ZoneKey, next: CoverElement | null) {
    setLayout((l) => {
      const zones = { ...l.zones };
      if (next) zones[key] = next;
      else delete zones[key];
      return { ...l, zones };
    });
  }
  function setKind(k: ElementKind) {
    if (k === "none") return setZoneEl(zone, null);
    if (k === kind) return;
    if (k === "text") {
      setZoneEl(zone, { type: "text", text: name, size: "md", weight: "bold", color: "#ffffff", font: "display" });
    } else if (k === "logo") {
      const s = sets[0];
      if (!s) return setToast({ message: "Catalogue d'extensions indisponible", tone: "error" });
      setZoneEl(zone, { type: "logo", setId: s.id, setName: s.name, url: (s.logo ?? s.symbol)!, size: "md" });
    } else if (k === "card") {
      const c = cards[0];
      if (!c) return setToast({ message: "Range d'abord des cartes dans le classeur", tone: "error" });
      setZoneEl(zone, { type: "card", itemId: c.id, size: "md" });
    } else {
      uploadTarget.current = zone;
      fileInput.current?.click();
    }
  }
  function toggleCover(id: string) {
    setCoverIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxCovers) return prev;
      return [...prev, id];
    });
  }

  /** Compression puis envoi — même chaîne que les photos de cartes */
  async function upload(file: File): Promise<{ path: string; url: string } | null> {
    setBusy(true);
    try {
      const { default: imageCompression } = await import("browser-image-compression");
      let source = file;
      const isHeic =
        /\.hei[cf]$/i.test(file.name) || file.type === "image/heic" || file.type === "image/heif";
      if (isHeic) {
        const { heicTo } = await import("heic-to/next");
        const blob = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
        source = new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), { type: "image/jpeg" });
      }
      const compressed = await imageCompression(source, {
        maxWidthOrHeight: 1600,
        initialQuality: 0.85,
        fileType: "image/webp",
        maxSizeMB: 1.5,
        useWebWorker: true,
      });
      const fd = new FormData();
      fd.set("binder_id", binderId);
      fd.set("image", new File([compressed], "cover.webp", { type: "image/webp" }));
      const res = await uploadCoverImage(fd);
      if (!res.ok) {
        setToast({ message: res.message, tone: "error" });
        return null;
      }
      setUrls((u) => ({ ...u, [res.path]: res.url }));
      return { path: res.path, url: res.url };
    } catch {
      setToast({ message: "Compression impossible sur cette image", tone: "error" });
      return null;
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  async function onFile(file: File | undefined) {
    if (!file) return;
    const target = uploadTarget.current;
    const up = await upload(file);
    if (!up) return;
    if (target === "bg") setBg({ kind: "image", image: up.path });
    else setZoneEl(target, { type: "image", path: up.path, size: "md", round: false });
  }
  function forget(path: string, next: CoverLayout) {
    const stillUsed =
      next.bg.image === path ||
      Object.values(next.zones).some((z) => z?.type === "image" && z.path === path);
    if (!stillUsed) void deleteCoverImage(binderId, path);
  }
  function clearZone() {
    const cur = layout.zones[zone];
    const next: CoverLayout = { ...layout, zones: { ...layout.zones } };
    delete next.zones[zone];
    setLayout(next);
    if (cur?.type === "image") forget(cur.path, next);
  }
  function clearBgImage() {
    const path = layout.bg.image;
    const next: CoverLayout = { ...layout, bg: { ...layout.bg, kind: "color", image: null } };
    setLayout(next);
    if (path) forget(path, next);
  }

  async function save() {
    setSaving(true);
    const { error } = await saveBinderEditor(binderId, {
      style,
      color,
      coverIds,
      pageGrid: grid,
      design,
      cover: layout,
    });
    setSaving(false);
    if (error) {
      setToast({ message: `Enregistrement impossible : ${error}`, tone: "error" });
      return;
    }
    router.push(`/classeurs/${binderId}`);
    router.refresh();
  }

  const needle = normalize(logoQ.trim());
  const logoResults = needle
    ? sets.filter((s) => normalize(`${s.name} ${s.serie} ${s.id}`).includes(needle)).slice(0, 24)
    : sets.slice(0, 24);

  // ---- Aperçu du classeur ouvert (feuilles, anneaux, pochettes, format) ---
  const g = pageGrid(grid);
  const sheet = SHEETS[design.pageColor];
  const ringPos = ringPositions(design.ringCount);
  const ringColor = ringHex(design.ringFinish);
  const textureClass = coverTextureClass(design.coverTexture);
  const sheen = pocketSheen(design.pocketFinish);
  const sampleCards = cards.slice(0, pocketsPerPage(g));

  function openPage(side: "left" | "right", pageNo: number) {
    const holesLeft = side === "right";
    return (
      <div
        className={`relative min-w-0 flex-1 border shadow-[var(--shadow-panel)] ${sheet.page} ${
          side === "left" ? "rounded-l-lg" : "rounded-r-lg"
        }`}
      >
        {ringPos.map((t) => (
          <span
            key={t}
            aria-hidden
            className={`absolute h-2 w-2 -translate-y-1/2 rounded-full ${sheet.holes} ${holesLeft ? "left-1.5" : "right-1.5"}`}
            style={{ top: `${t * 100}%` }}
          />
        ))}
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))`,
            padding: holesLeft ? "8px 8px 14px 16px" : "8px 16px 14px 8px",
          }}
        >
          {Array.from({ length: pocketsPerPage(g) }, (_, k) => {
            const card = side === "left" ? sampleCards[k] : undefined;
            return (
              <div
                key={k}
                className={`relative aspect-[63/88] rounded ${sheet.pocketBg} shadow-[inset_0_2px_6px_rgba(0,0,0,.4)] ring-1 ${sheet.pocketRing}`}
              >
                {card && (
                  <div className="absolute inset-[3%]">
                    <div className="card-tile h-full w-full">
                      <CardImage base={card.image_url || null} alt={card.name} />
                    </div>
                  </div>
                )}
                {sheen && (
                  <span aria-hidden className={`pointer-events-none absolute inset-0 rounded bg-gradient-to-br ${sheen}`} />
                )}
              </div>
            );
          })}
        </div>
        {design.pageNumbers && (
          <span className={`num absolute bottom-1 text-[9px] ${sheet.number} ${holesLeft ? "right-2.5" : "left-2.5"}`}>
            {pageNo}
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileInput}
        type="file"
        accept="image/*,.heic,.heif"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/classeurs/${binderId}`}
            aria-label="Retour au classeur"
            title="Retour au classeur"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-edge text-muted transition hover:border-edge-strong hover:text-foreground"
          >
            <ChevronLeft size={16} aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1 className="display truncate text-2xl font-bold tracking-tight">Personnaliser « {name} »</h1>
            <p className="text-xs text-muted">L&apos;aperçu suit tes choix ; rien n&apos;est enregistré avant « Enregistrer ».</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/classeurs/${binderId}`} className="btn btn-ghost">
            Annuler
          </Link>
          <button type="button" onClick={save} disabled={saving || busy} className="btn btn-primary">
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* Aperçu : bascule fermé / ouvert */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3 inline-flex rounded-lg border border-edge bg-surface p-0.5">
            {(["ferme", "ouvert"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPreview(m)}
                aria-pressed={preview === m}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  preview === m ? "bg-raised text-foreground shadow-sm" : "text-muted hover:text-foreground"
                }`}
              >
                {m === "ferme" ? <Book size={14} aria-hidden /> : <BookOpen size={14} aria-hidden />}
                {m === "ferme" ? "Fermé" : "Ouvert"}
              </button>
            ))}
          </div>

          <p className="mb-3 text-xs text-faint">
            {preview === "ferme"
              ? "Tu personnalises la couverture."
              : "Tu personnalises les pages et les anneaux."}
          </p>

          <div className="panel flex items-start justify-center p-6">
            {preview === "ferme" ? (
              <div className="relative w-full max-w-sm">
                <BinderCover
                  style={style}
                  covers={previewCovers}
                  name={name}
                  colorHex={colorHex}
                  texture={design.coverTexture}
                  layout={render}
                />
                {isCustom && (
                  <div
                    className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-[2%] p-[5%]"
                    role="group"
                    aria-label="Zones de la couverture"
                  >
                    {ZONES.map((z) => {
                      const filled = layout.zones[z] != null;
                      const active = z === zone;
                      return (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setZone(z)}
                          title={ZONE_LABELS[z]}
                          aria-pressed={active}
                          className={`rounded-md border transition ${
                            active
                              ? "border-accent bg-accent/10 ring-2 ring-accent/60"
                              : filled
                                ? "border-white/25 hover:border-white/60"
                                : "border-dashed border-white/20 hover:border-white/60 hover:bg-white/5"
                          }`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="w-full max-w-md">
                <div className="flex items-stretch justify-center">
                  {openPage("left", 1)}
                  {/* Tranche + anneaux */}
                  <div className="relative z-10 -mx-px w-5 shrink-0 self-stretch">
                    <div
                      className="absolute inset-x-0 -inset-y-1 overflow-hidden rounded bg-raised"
                      style={colorHex ? { backgroundColor: colorHex } : undefined}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-white/10 to-black/45" />
                      {textureClass && <span className={`absolute inset-0 ${textureClass}`} />}
                    </div>
                    {ringPos.map((t) => (
                      <span
                        key={t}
                        aria-hidden
                        className="absolute left-1/2 h-2.5 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-[0_1px_2px_rgba(0,0,0,.6)]"
                        style={{ top: `${t * 100}%`, borderColor: ringColor }}
                      />
                    ))}
                  </div>
                  {openPage("right", 2)}
                </div>
                <p className="mt-3 text-center text-xs text-faint">
                  Aperçu d&apos;une double page · {g.cols}×{g.rows}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          {preview === "ferme" ? (
            <>
          {/* ---- Couverture ---- */}
          <section className="panel p-5">
            <p className="label-xs mb-2">Style de couverture</p>
            <Chips
              label="Style de couverture"
              options={STYLE_LABELS}
              value={style}
              onPick={(code) => {
                setStyle(code);
                setCoverIds((prev) => prev.slice(0, binderStyleCovers(code)));
              }}
            />
            <p className="mb-4 mt-1.5 min-h-4 text-xs text-faint">
              {BINDER_STYLES.find((s) => s.code === style)?.description}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs text-muted">Couleur</p>
                <ColorPicker label="Couleur de tranche" colors={BINDER_COLORS.map((c) => c.hex)} value={colorHex} onPick={(hex) => setColor(BINDER_COLORS.find((c) => c.hex === hex)?.code ?? null)} withNeutral />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">Matière</p>
                <Chips label="Matière" options={COVER_TEXTURES} value={design.coverTexture} onPick={(coverTexture) => setD({ coverTexture })} />
              </div>
            </div>
          </section>

          {isCustom ? (
            <>
              <section className="panel p-5">
                <p className="label-xs mb-3">Fond de la couverture</p>
                <Chips
                  label="Type de fond"
                  options={BG_KINDS}
                  value={layout.bg.kind}
                  onPick={(k) => {
                    if (k === "image") {
                      if (layout.bg.image) setBg({ kind: "image" });
                      else {
                        uploadTarget.current = "bg";
                        fileInput.current?.click();
                      }
                    } else if (k === "card") {
                      const c = cards[0];
                      if (!c) return setToast({ message: "Range d'abord des cartes dans le classeur", tone: "error" });
                      setBg({ kind: "card", card: layout.bg.card ?? c.id });
                    } else setBg({ kind: "color" });
                  }}
                />
                <div className="mt-3 flex flex-col gap-3">
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Couleur (visible aussi sous une image)</p>
                    <ColorPicker label="Couleur de fond" colors={BG_COLORS} value={layout.bg.color} onPick={(hex) => setBg({ color: hex })} />
                  </div>
                  {layout.bg.kind === "image" && (
                    <div className="flex items-center gap-3">
                      {layout.bg.image && urls[layout.bg.image] && (
                        <div className="h-14 w-14 overflow-hidden rounded-md border border-edge">
                          <CardImage base={urls[layout.bg.image]} alt="" direct />
                        </div>
                      )}
                      <button type="button" disabled={busy} onClick={() => { uploadTarget.current = "bg"; fileInput.current?.click(); }} className="btn btn-ghost !px-2.5 text-[13px]">
                        <ImagePlus size={14} aria-hidden />
                        {busy ? "Envoi…" : "Changer l'image"}
                      </button>
                      <button type="button" onClick={clearBgImage} className="btn btn-ghost !px-2.5 text-[13px] text-muted">
                        <Trash2 size={14} aria-hidden />
                        Retirer
                      </button>
                    </div>
                  )}
                  {layout.bg.kind === "card" && (
                    <CardPicker cards={cards} isSelected={(id) => layout.bg.card === id} onPick={(id) => setBg({ card: id })} />
                  )}
                  {layout.bg.kind !== "color" && (
                    <label className="flex items-center gap-3 text-xs text-muted">
                      Voile sombre
                      <input type="range" min={0} max={85} value={layout.bg.dim} onChange={(e) => setBg({ dim: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
                      <span className="num w-8 text-right">{layout.bg.dim}%</span>
                    </label>
                  )}
                </div>
              </section>

              <section className="panel p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="label-xs">Zone · {ZONE_LABELS[zone]}</p>
                  <div className="grid grid-cols-3 gap-0.5" role="group" aria-label="Choisir une zone">
                    {ZONES.map((z) => (
                      <button
                        key={z}
                        type="button"
                        onClick={() => setZone(z)}
                        title={ZONE_LABELS[z]}
                        aria-pressed={z === zone}
                        className={`flex h-5 w-5 items-center justify-center rounded-sm border transition ${
                          z === zone ? "border-accent bg-accent-soft" : "border-edge hover:border-edge-strong"
                        }`}
                      >
                        {layout.zones[z] && <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" aria-hidden />}
                      </button>
                    ))}
                  </div>
                </div>
                <Chips label="Contenu de la zone" options={ELEMENT_KINDS} value={kind} onPick={setKind} />

                {el?.type === "text" && (
                  <div className="mt-4 flex flex-col gap-3">
                    <input type="text" value={el.text} maxLength={TEXT_MAX} onChange={(e) => setZoneEl(zone, { ...el, text: e.target.value })} placeholder="Ton texte…" className="field text-[13px]" aria-label="Texte" />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Taille</p>
                        <Chips label="Taille du texte" options={TEXT_SIZES} value={el.size} onPick={(size) => setZoneEl(zone, { ...el, size })} />
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Police</p>
                        <Chips label="Police" options={FONTS} value={el.font} onPick={(font) => setZoneEl(zone, { ...el, font })} />
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Graisse</p>
                        <Chips label="Graisse" options={[{ code: "bold", label: "Gras" }, { code: "normal", label: "Normal" }] as const} value={el.weight} onPick={(weight) => setZoneEl(zone, { ...el, weight })} />
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Couleur</p>
                        <ColorPicker label="Couleur du texte" colors={TEXT_COLORS} value={el.color} onPick={(hex) => hex && setZoneEl(zone, { ...el, color: hex })} />
                      </div>
                    </div>
                  </div>
                )}

                {el?.type === "logo" && (
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="relative">
                      <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                      <input type="text" value={logoQ} onChange={(e) => setLogoQ(e.target.value)} placeholder="Nom de l'extension…" className="field !pl-9 text-[13px]" aria-label="Rechercher une extension" />
                    </div>
                    <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1">
                      {logoResults.map((s) => {
                        const active = s.id === el.setId;
                        const thumb = s.logo ?? s.symbol;
                        return (
                          <button key={s.id} type="button" onClick={() => setZoneEl(zone, { ...el, setId: s.id, setName: s.name, url: (s.logo ?? s.symbol)! })} title={`${s.name} · ${s.serie}`} aria-pressed={active} className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${active ? "border-accent/50 bg-accent-soft" : "border-edge hover:border-edge-strong"}`}>
                            <div className="flex h-10 w-full items-center justify-center">
                              {thumb && <CardImage base={`${thumb}.png`} alt="" direct className="max-h-10 max-w-full object-contain" />}
                            </div>
                            <span className="w-full truncate text-center text-[11px] text-muted">{s.name}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Visuel</p>
                        <Chips
                          label="Logo ou symbole"
                          options={[{ code: "logo", label: "Logo" }, { code: "symbol", label: "Symbole" }] as const}
                          value={sets.find((s) => s.id === el.setId)?.symbol === el.url ? "symbol" : "logo"}
                          onPick={(v) => {
                            const s = sets.find((x) => x.id === el.setId);
                            const url = v === "symbol" ? s?.symbol : s?.logo;
                            if (url) setZoneEl(zone, { ...el, url });
                            else setToast({ message: "Pas de visuel de ce type pour cette extension", tone: "error" });
                          }}
                        />
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Taille</p>
                        <Chips label="Taille du logo" options={ELEMENT_SIZES} value={el.size} onPick={(size) => setZoneEl(zone, { ...el, size })} />
                      </div>
                    </div>
                  </div>
                )}

                {el?.type === "image" && (
                  <div className="mt-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      {urls[el.path] && (
                        <div className={`h-14 w-14 overflow-hidden border border-edge ${el.round ? "rounded-full" : "rounded-md"}`}>
                          <CardImage base={urls[el.path]} alt="" direct />
                        </div>
                      )}
                      <button type="button" disabled={busy} onClick={() => { uploadTarget.current = zone; fileInput.current?.click(); }} className="btn btn-ghost !px-2.5 text-[13px]">
                        <ImagePlus size={14} aria-hidden />
                        {busy ? "Envoi…" : "Changer l'image"}
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Taille</p>
                        <Chips label="Taille de l'image" options={ELEMENT_SIZES} value={el.size} onPick={(size) => setZoneEl(zone, { ...el, size })} />
                      </div>
                      <div>
                        <p className="mb-1.5 text-xs text-muted">Forme</p>
                        <Chips label="Forme" options={[{ code: "square", label: "Carrée" }, { code: "round", label: "Ronde" }] as const} value={el.round ? "round" : "square"} onPick={(v) => setZoneEl(zone, { ...el, round: v === "round" })} />
                      </div>
                    </div>
                  </div>
                )}

                {el?.type === "card" && (
                  <div className="mt-4 flex flex-col gap-3">
                    <CardPicker cards={cards} isSelected={(id) => el.itemId === id} onPick={(itemId) => setZoneEl(zone, { ...el, itemId })} />
                    <div>
                      <p className="mb-1.5 text-xs text-muted">Taille</p>
                      <Chips label="Taille de la carte" options={ELEMENT_SIZES} value={el.size} onPick={(size) => setZoneEl(zone, { ...el, size })} />
                    </div>
                  </div>
                )}

                {el && (
                  <button type="button" onClick={clearZone} className="btn btn-ghost mt-4 !px-2.5 text-[13px] text-muted">
                    <Trash2 size={14} aria-hidden />
                    Vider cette zone
                  </button>
                )}
              </section>
            </>
          ) : maxCovers > 0 ? (
            <section className="panel p-5">
              <div className="mb-2 flex items-baseline justify-between">
                <p className="label-xs">Carte{maxCovers > 1 ? "s" : ""} de couverture</p>
                <span className="num text-xs text-faint">{coverIds.length}/{maxCovers}</span>
              </div>
              <p className="mb-3 text-xs text-muted">
                {maxCovers > 1
                  ? "L'ordre de sélection définit leur place. Aucune sélection = les premières cartes du classeur."
                  : "Aucune sélection = la première carte du classeur."}
              </p>
              <CardPicker cards={cards} isSelected={(id) => coverIds.includes(id)} order={(id) => { const i = coverIds.indexOf(id); return i === -1 ? null : i; }} onPick={toggleCover} />
            </section>
          ) : null}
            </>
          ) : (
            <>
          {/* ---- Intérieur ---- */}
          <section className="panel p-5">
            <p className="label-xs mb-3">Pages</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs text-muted">Format des feuilles</p>
                <Chips label="Format des feuilles" options={GRID_OPTIONS} value={grid} onPick={setGrid} />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">Couleur des feuilles</p>
                <Chips label="Couleur des feuilles" options={PAGE_COLOR_OPTIONS} value={design.pageColor} onPick={(pageColor) => setD({ pageColor })} />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">Pochettes</p>
                <Chips label="Finition des pochettes" options={POCKET_FINISHES} value={design.pocketFinish} onPick={(pocketFinish) => setD({ pocketFinish })} />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">Numéros de page</p>
                <Chips label="Numéros de page" options={NUMBER_OPTIONS} value={design.pageNumbers ? "on" : "off"} onPick={(v) => setD({ pageNumbers: v === "on" })} />
              </div>
            </div>
          </section>

          <section className="panel p-5">
            <p className="label-xs mb-3">Anneaux</p>
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-1.5 text-xs text-muted">Finition</p>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Finition des anneaux">
                  {RING_FINISHES.map((r) => {
                    const active = design.ringFinish === r.code;
                    return (
                      <button
                        key={r.code}
                        type="button"
                        onClick={() => setD({ ringFinish: r.code })}
                        aria-pressed={active}
                        className={`inline-flex h-8 shrink-0 items-center gap-2 rounded-lg border px-3 text-[12px] font-medium transition ${
                          active
                            ? "border-accent/50 bg-accent-soft text-accent-strong"
                            : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
                        }`}
                      >
                        <span
                          aria-hidden
                          className="h-4 w-4 rounded-full border-[3px] bg-surface"
                          style={{ borderColor: r.hex }}
                        />
                        {r.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">Nombre d&apos;anneaux</p>
                <Chips
                  label="Nombre d'anneaux"
                  options={RING_COUNTS.map((n) => ({ code: String(n), label: String(n) }))}
                  value={String(design.ringCount)}
                  onPick={(v) => setD({ ringCount: Number(v) as BinderDesign["ringCount"] })}
                />
              </div>
            </div>
          </section>
            </>
          )}
        </div>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
