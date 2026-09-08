"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ImagePlus, Search, Trash2 } from "lucide-react";
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
import type { CoverTexture } from "@/lib/binder-design";
import {
  deleteCoverImage,
  saveBinderCover,
  uploadCoverImage,
} from "@/app/classeurs/cover-actions";
import { BinderCover } from "@/components/binder-cover";
import { CardImage } from "@/components/card-image";
import { Toast } from "@/components/toast";

// Éditeur de couverture : aperçu en direct à gauche, panneau à droite.
// On clique une zone (sur l'aperçu ou dans la grille) puis on la remplit.

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
}: {
  colors: readonly string[];
  value: string | null;
  onPick: (hex: string | null) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
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
      <label className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-edge bg-[conic-gradient(red,yellow,lime,cyan,blue,magenta,red)]" title="Autre couleur">
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
  value,
  onPick,
}: {
  cards: EditorCard[];
  value: string | null;
  onPick: (id: string) => void;
}) {
  if (cards.length === 0) {
    return (
      <p className="text-xs text-faint">Range d&apos;abord des cartes dans le classeur.</p>
    );
  }
  return (
    <div className="grid max-h-52 grid-cols-5 gap-2 overflow-y-auto pr-1">
      {cards.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onPick(c.id)}
          title={c.name}
          aria-pressed={value === c.id}
          className={`card-tile aspect-[63/88] transition ${
            value === c.id ? "outline outline-2 outline-offset-2 outline-accent" : "opacity-80 hover:opacity-100"
          }`}
        >
          <CardImage base={c.image_url || null} alt={c.name} />
        </button>
      ))}
    </div>
  );
}

export function CoverEditor({
  binderId,
  name,
  colorHex,
  texture,
  initial,
  initialUrls,
  cards,
  sets,
}: {
  binderId: string;
  name: string;
  colorHex: string | null;
  texture: CoverTexture;
  initial: CoverLayout;
  initialUrls: Record<string, string>;
  cards: EditorCard[];
  sets: EditorSet[];
}) {
  const router = useRouter();
  const [layout, setLayout] = useState<CoverLayout>(initial);
  const [urls, setUrls] = useState<Record<string, string>>(initialUrls);
  const [zone, setZone] = useState<ZoneKey>("mc");
  const [logoQ, setLogoQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error";
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Cible de l'image en cours de choix : le fond ou la zone sélectionnée */
  const uploadTarget = useRef<"bg" | ZoneKey>("bg");

  const cardUrl = (id: string) => cards.find((c) => c.id === id)?.image_url ?? null;
  const render = renderCover(layout, (p) => urls[p] ?? null, cardUrl);
  const el = layout.zones[zone] ?? null;
  const kind: ElementKind = el?.type ?? "none";

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
  /** Change le type d'élément de la zone en gardant des valeurs raisonnables */
  function setKind(k: ElementKind) {
    if (k === "none") return setZoneEl(zone, null);
    if (k === kind) return;
    if (k === "text") {
      setZoneEl(zone, {
        type: "text",
        text: name,
        size: "md",
        weight: "bold",
        color: "#ffffff",
        font: "display",
      });
    } else if (k === "logo") {
      const s = sets[0];
      if (!s) return setToast({ message: "Catalogue d'extensions indisponible", tone: "error" });
      setZoneEl(zone, {
        type: "logo",
        setId: s.id,
        setName: s.name,
        url: (s.logo ?? s.symbol)!,
        size: "md",
      });
    } else if (k === "card") {
      const c = cards[0];
      if (!c) return setToast({ message: "Range d'abord des cartes dans le classeur", tone: "error" });
      setZoneEl(zone, { type: "card", itemId: c.id, size: "md" });
    } else {
      uploadTarget.current = zone;
      fileInput.current?.click();
    }
  }

  /** Compression puis envoi : même chaîne que les photos de cartes */
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
        source = new File([blob], file.name.replace(/\.hei[cf]$/i, ".jpg"), {
          type: "image/jpeg",
        });
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

  /** Une image retirée de la mise en page est supprimée du stockage si plus référencée */
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
    const { error } = await saveBinderCover(binderId, layout);
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
            <h1 className="display truncate text-2xl font-bold tracking-tight">
              Couverture de « {name} »
            </h1>
            <p className="text-xs text-muted">
              Clique une zone de l&apos;aperçu, puis choisis ce qu&apos;elle contient.
            </p>
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
        {/* Aperçu : la couverture, et par-dessus les neuf zones cliquables */}
        <div className="panel flex items-start justify-center p-6 lg:sticky lg:top-6 lg:self-start">
          <div className="relative w-full max-w-sm">
            <BinderCover
              style="custom"
              covers={[]}
              name={name}
              colorHex={colorHex}
              texture={texture}
              layout={render}
            />
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
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <section className="panel p-5">
            <p className="label-xs mb-3">Fond</p>
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
                <ColorPicker
                  label="Couleur de fond"
                  colors={BG_COLORS}
                  value={layout.bg.color}
                  onPick={(hex) => setBg({ color: hex })}
                />
              </div>
              {layout.bg.kind === "image" && (
                <div className="flex items-center gap-3">
                  {layout.bg.image && urls[layout.bg.image] && (
                    <div className="h-14 w-14 overflow-hidden rounded-md border border-edge">
                      <CardImage base={urls[layout.bg.image]} alt="" direct />
                    </div>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      uploadTarget.current = "bg";
                      fileInput.current?.click();
                    }}
                    className="btn btn-ghost !px-2.5 text-[13px]"
                  >
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
                <CardPicker cards={cards} value={layout.bg.card} onPick={(id) => setBg({ card: id })} />
              )}
              {layout.bg.kind !== "color" && (
                <label className="flex items-center gap-3 text-xs text-muted">
                  Voile sombre
                  <input
                    type="range"
                    min={0}
                    max={85}
                    value={layout.bg.dim}
                    onChange={(e) => setBg({ dim: Number(e.target.value) })}
                    className="flex-1 accent-[var(--accent)]"
                  />
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
                      z === zone
                        ? "border-accent bg-accent-soft"
                        : "border-edge hover:border-edge-strong"
                    }`}
                  >
                    {layout.zones[z] && (
                      <span className="h-1.5 w-1.5 rounded-full bg-foreground/70" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
            </div>
            <Chips label="Contenu de la zone" options={ELEMENT_KINDS} value={kind} onPick={setKind} />

            {el?.type === "text" && (
              <div className="mt-4 flex flex-col gap-3">
                <input
                  type="text"
                  value={el.text}
                  maxLength={TEXT_MAX}
                  onChange={(e) => setZoneEl(zone, { ...el, text: e.target.value })}
                  placeholder="Ton texte…"
                  className="field text-[13px]"
                  aria-label="Texte"
                />
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
                    <Chips
                      label="Graisse"
                      options={[{ code: "bold", label: "Gras" }, { code: "normal", label: "Normal" }] as const}
                      value={el.weight}
                      onPick={(weight) => setZoneEl(zone, { ...el, weight })}
                    />
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
                  <input
                    type="text"
                    value={logoQ}
                    onChange={(e) => setLogoQ(e.target.value)}
                    placeholder="Nom de l'extension…"
                    className="field !pl-9 text-[13px]"
                    aria-label="Rechercher une extension"
                  />
                </div>
                <div className="grid max-h-56 grid-cols-3 gap-2 overflow-y-auto pr-1">
                  {logoResults.map((s) => {
                    const active = s.id === el.setId;
                    const thumb = s.logo ?? s.symbol;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setZoneEl(zone, { ...el, setId: s.id, setName: s.name, url: (s.logo ?? s.symbol)! })
                        }
                        title={`${s.name} · ${s.serie}`}
                        aria-pressed={active}
                        className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition ${
                          active ? "border-accent/50 bg-accent-soft" : "border-edge hover:border-edge-strong"
                        }`}
                      >
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
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      uploadTarget.current = zone;
                      fileInput.current?.click();
                    }}
                    className="btn btn-ghost !px-2.5 text-[13px]"
                  >
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
                    <Chips
                      label="Forme"
                      options={[{ code: "square", label: "Carrée" }, { code: "round", label: "Ronde" }] as const}
                      value={el.round ? "round" : "square"}
                      onPick={(v) => setZoneEl(zone, { ...el, round: v === "round" })}
                    />
                  </div>
                </div>
              </div>
            )}

            {el?.type === "card" && (
              <div className="mt-4 flex flex-col gap-3">
                <CardPicker cards={cards} value={el.itemId} onPick={(itemId) => setZoneEl(zone, { ...el, itemId })} />
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
        </div>
      </div>

      {toast && <Toast message={toast.message} tone={toast.tone} onDone={() => setToast(null)} />}
    </div>
  );
}
