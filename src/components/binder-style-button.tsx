"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Palette,
  X,
  Ban,
  NotebookTabs,
  LayoutGrid,
  Sparkles,
  Layers,
  Tag,
  Brush,
  ArrowRight,
} from "lucide-react";
import type { CoverRender } from "@/lib/binder-cover";
import { BINDER_COLORS, binderColorHex } from "@/lib/binder-colors";
import { BINDER_STYLES, binderStyle, binderStyleCovers } from "@/lib/binder-styles";
import { PAGE_GRIDS, pageGrid } from "@/lib/binder-pages";
import {
  COVER_TEXTURES,
  PAGE_COLORS,
  POCKET_FINISHES,
  RING_COUNTS,
  RING_FINISHES,
  type BinderDesign,
} from "@/lib/binder-design";
import { updateBinderStyle } from "@/app/classeurs/actions";
import { BinderCover } from "@/components/binder-cover";
import { CardImage } from "@/components/card-image";
import { Toast } from "@/components/toast";

export type CoverCandidate = { id: string; card_name: string; image_url: string };

/**
 * Personnalisation du classeur : couverture (style, couleur, matière,
 * cartes), pages (format, feuilles, numéros), anneaux et pochettes —
 * avec un aperçu de la couverture qui suit les choix.
 */
const STYLE_ICONS = {
  binder: NotebookTabs,
  mosaic: LayoutGrid,
  showcase: Sparkles,
  fan: Layers,
  label: Tag,
  custom: Brush,
} as const;

/** Rangée de choix exclusifs, en pastilles */
function Chips<T extends string | number>({
  options,
  value,
  onPick,
  label,
}: {
  options: readonly { code: T; label: string; title?: string }[];
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
            key={String(o.code)}
            type="button"
            onClick={() => onPick(o.code)}
            aria-pressed={active}
            title={o.title}
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

const GRID_OPTIONS = PAGE_GRIDS.map((g) => ({
  code: g.code,
  label: `${g.cols}×${g.rows}`,
  title: g.label,
}));
const PAGE_COLOR_OPTIONS = PAGE_COLORS.map((p) => ({
  code: p.code,
  label: p.label,
  title: p.description,
}));
const NUMBER_OPTIONS = [
  { code: "on", label: "Affichés" },
  { code: "off", label: "Masqués" },
] as const;
const RING_COUNT_OPTIONS = RING_COUNTS.map((n) => ({
  code: n,
  label: `${n}`,
  title: `${n} anneaux`,
}));

export function BinderStyleButton({
  binderId,
  name,
  color,
  coverIds,
  items,
  styleCode,
  pageGridCode,
  design,
  coverRender,
}: {
  binderId: string;
  name: string;
  color: string | null;
  coverIds: string[];
  items: CoverCandidate[];
  styleCode: string | null;
  pageGridCode: string | null;
  design: BinderDesign;
  /** Couverture sur mesure résolue, pour l'aperçu du style « Sur mesure » */
  coverRender: CoverRender | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selColor, setSelColor] = useState<string | null>(color);
  const [selStyle, setSelStyle] = useState(binderStyle(styleCode));
  const [selIds, setSelIds] = useState<string[]>(coverIds);
  const [selGrid, setSelGrid] = useState<string>(pageGrid(pageGridCode).code);
  const [selDesign, setSelDesign] = useState<BinderDesign>(design);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const maxCovers = binderStyleCovers(selStyle);
  const styleDef = BINDER_STYLES.find((s) => s.code === selStyle);
  const setD = (patch: Partial<BinderDesign>) =>
    setSelDesign((d) => ({ ...d, ...patch }));

  // Aperçu : les cartes choisies, sinon les premières avec image
  const chosen = selIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is CoverCandidate => i != null && !!i.image_url);
  const previewCovers = (chosen.length > 0 ? chosen : items.filter((i) => i.image_url))
    .slice(0, Math.max(maxCovers, 1))
    .map((i) => ({ image_url: i.image_url }));

  function openModal() {
    setSelColor(color);
    setSelStyle(binderStyle(styleCode));
    setSelIds(coverIds);
    setSelGrid(pageGrid(pageGridCode).code);
    setSelDesign(design);
    setOpen(true);
  }

  function pickStyle(code: (typeof BINDER_STYLES)[number]["code"]) {
    setSelStyle(code);
    const max = binderStyleCovers(code);
    setSelIds((prev) => prev.slice(0, max));
  }

  function toggleCard(id: string) {
    setSelIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxCovers) return prev;
      return [...prev, id];
    });
  }

  async function save() {
    setSaving(true);
    const { error } = await updateBinderStyle(
      binderId,
      selColor,
      selIds,
      selStyle,
      selGrid,
      selDesign
    );
    setSaving(false);
    setOpen(false);
    setToast(
      error
        ? { message: "Enregistrement impossible", tone: "error" }
        : { message: "Classeur personnalisé" }
    );
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Personnaliser"
        aria-label="Personnaliser le classeur"
        className="btn btn-ghost !px-2.5"
      >
        <Palette size={15} aria-hidden />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => !saving && setOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Personnaliser le classeur"
        >
          <div
            className="panel rise-in relative flex max-h-[92vh] w-full max-w-xl flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fermer"
              className="absolute -right-3 -top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-edge bg-raised text-muted shadow-lg transition hover:text-foreground"
            >
              <X size={15} aria-hidden />
            </button>

            <div className="px-5 pt-5">
              <p className="display text-base font-semibold">
                Personnaliser le classeur
              </p>
              <p className="mt-0.5 text-sm text-muted">
                L&apos;aperçu suit tes choix ; rien n&apos;est enregistré avant
                « Enregistrer ».
              </p>
              <div className="mt-4 flex justify-center rounded-xl border border-edge bg-raised/40 p-4">
                <div className="group w-32 sm:w-36">
                  <BinderCover
                    style={selStyle}
                    covers={previewCovers}
                    name={name}
                    colorHex={binderColorHex(selColor)}
                    texture={selDesign.coverTexture}
                    layout={coverRender}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-5 py-4">
              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="label-xs">Couverture</p>
                  <Link
                    href={`/classeurs/${binderId}/couverture`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent-strong transition hover:underline"
                  >
                    Éditeur de couverture
                    <ArrowRight size={12} aria-hidden />
                  </Link>
                </div>
                <div className="mb-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
                  {BINDER_STYLES.map((s) => {
                    const Icon = STYLE_ICONS[s.code];
                    const active = selStyle === s.code;
                    return (
                      <button
                        key={s.code}
                        type="button"
                        onClick={() => pickStyle(s.code)}
                        aria-pressed={active}
                        title={s.description}
                        className={`flex flex-col items-center gap-1.5 rounded-xl border px-1 py-2.5 text-[11px] transition ${
                          active
                            ? "border-accent/50 bg-accent-soft font-semibold text-accent-strong"
                            : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
                        }`}
                      >
                        <Icon size={16} strokeWidth={1.8} aria-hidden />
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <p className="mb-3 min-h-4 text-xs text-faint">{styleDef?.description}</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Couleur</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelColor(null)}
                        title="Neutre"
                        aria-label="Tranche neutre"
                        aria-pressed={selColor == null}
                        className={`flex h-8 w-8 items-center justify-center rounded-full border bg-raised text-muted transition ${
                          selColor == null
                            ? "border-accent ring-2 ring-accent/40"
                            : "border-edge hover:border-edge-strong"
                        }`}
                      >
                        <Ban size={13} aria-hidden />
                      </button>
                      {BINDER_COLORS.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => setSelColor(c.code)}
                          title={c.label}
                          aria-label={`Tranche ${c.label.toLowerCase()}`}
                          aria-pressed={selColor === c.code}
                          className={`h-8 w-8 rounded-full border transition ${
                            selColor === c.code
                              ? "border-foreground ring-2 ring-accent/40"
                              : "border-black/20 hover:scale-110"
                          }`}
                          style={{ backgroundColor: c.hex }}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Matière</p>
                    <Chips
                      label="Matière de la couverture"
                      options={COVER_TEXTURES}
                      value={selDesign.coverTexture}
                      onPick={(coverTexture) => setD({ coverTexture })}
                    />
                  </div>
                </div>
              </section>

              <section>
                <p className="label-xs mb-2">Pages</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Format des feuilles</p>
                    <Chips
                      label="Format des feuilles"
                      options={GRID_OPTIONS}
                      value={selGrid}
                      onPick={setSelGrid}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Couleur des feuilles</p>
                    <Chips
                      label="Couleur des feuilles"
                      options={PAGE_COLOR_OPTIONS}
                      value={selDesign.pageColor}
                      onPick={(pageColor) => setD({ pageColor })}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Pochettes</p>
                    <Chips
                      label="Finition des pochettes"
                      options={POCKET_FINISHES}
                      value={selDesign.pocketFinish}
                      onPick={(pocketFinish) => setD({ pocketFinish })}
                    />
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Numéros de page</p>
                    <Chips
                      label="Numéros de page"
                      options={NUMBER_OPTIONS}
                      value={selDesign.pageNumbers ? "on" : "off"}
                      onPick={(v) => setD({ pageNumbers: v === "on" })}
                    />
                  </div>
                </div>
              </section>

              <section>
                <p className="label-xs mb-2">Anneaux</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Finition</p>
                    <div className="flex items-center gap-2" role="group" aria-label="Finition des anneaux">
                      {RING_FINISHES.map((r) => {
                        const active = selDesign.ringFinish === r.code;
                        return (
                          <button
                            key={r.code}
                            type="button"
                            onClick={() => setD({ ringFinish: r.code })}
                            title={r.label}
                            aria-label={`Anneaux ${r.label.toLowerCase()}`}
                            aria-pressed={active}
                            className={`flex h-8 items-center gap-2 rounded-lg border px-2.5 text-[12px] font-medium transition ${
                              active
                                ? "border-accent/50 bg-accent-soft text-accent-strong"
                                : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
                            }`}
                          >
                            <span
                              aria-hidden
                              className="h-3.5 w-5 rounded-full border-[3px]"
                              style={{ borderColor: r.hex }}
                            />
                            {r.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs text-muted">Nombre</p>
                    <Chips
                      label="Nombre d'anneaux"
                      options={RING_COUNT_OPTIONS}
                      value={selDesign.ringCount}
                      onPick={(ringCount) => setD({ ringCount })}
                    />
                  </div>
                </div>
              </section>

              {maxCovers > 0 && (
                <section>
                  <div className="mb-2 flex items-baseline justify-between">
                    <p className="label-xs">
                      Carte{maxCovers > 1 ? "s" : ""} de couverture
                    </p>
                    <span className="num text-xs text-faint">
                      {selIds.length}/{maxCovers}
                    </span>
                  </div>
                  <p className="mb-3 text-xs text-muted">
                    {maxCovers > 1
                      ? "L'ordre de sélection définit leur place. Aucune sélection = les premières cartes du classeur."
                      : "Aucune sélection = la première carte du classeur."}
                  </p>
                  {items.length === 0 ? (
                    <p className="text-xs text-faint">
                      Range d&apos;abord des cartes dans le classeur.
                    </p>
                  ) : (
                    <div className="grid max-h-56 grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-5">
                      {items.map((it) => {
                        const pos = selIds.indexOf(it.id);
                        return (
                          <button
                            key={it.id}
                            type="button"
                            onClick={() => toggleCard(it.id)}
                            aria-pressed={pos !== -1}
                            title={it.card_name}
                            className="group/cover relative"
                          >
                            <div
                              className={`card-tile aspect-[63/88] transition ${
                                pos !== -1
                                  ? "outline outline-2 outline-offset-2 outline-accent"
                                  : "opacity-80 group-hover/cover:opacity-100"
                              }`}
                            >
                              <CardImage base={it.image_url || null} alt={it.card_name} />
                            </div>
                            {pos !== -1 && (
                              <span className="num absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-accent-ink shadow">
                                {pos + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-edge px-5 py-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="btn btn-ghost"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn btn-primary"
              >
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <Toast
          message={toast.message}
          tone={toast.tone}
          onDone={() => setToast(null)}
        />
      )}
    </>
  );
}
