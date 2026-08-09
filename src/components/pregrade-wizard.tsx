"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ruler,
  X,
  ChevronLeft,
  ChevronRight,
  Camera,
  Sparkles,
} from "lucide-react";
import { saveGrading } from "@/app/items/actions";
import { GRADE_LABELS } from "@/lib/grading";
import { loadImage, warpCardToCanvas, type Pt } from "@/lib/perspective";
import type { Annotation } from "@/lib/grading-defects";
import { DefectAnnotator } from "@/components/defect-annotator";
import type { GalleryPhoto } from "@/components/photo-gallery";
import { Toast } from "@/components/toast";

/* ————— Barèmes ————— */

// Centrage : pire côté (en %) → note, inspiré du barème PSA recto
function centeringGrade(worstPct: number): number {
  if (worstPct <= 55) return 10;
  if (worstPct <= 60) return 9;
  if (worstPct <= 65) return 8;
  if (worstPct <= 70) return 7;
  if (worstPct <= 75) return 6;
  if (worstPct <= 80) return 5;
  if (worstPct <= 85) return 4;
  if (worstPct <= 90) return 3;
  return 2;
}

// Le barème verso est plus tolérant (PSA : 75/25 pour un 10)
function centeringGradeBack(worstPct: number): number {
  if (worstPct <= 75) return 10;
  if (worstPct <= 80) return 9;
  if (worstPct <= 85) return 8;
  if (worstPct <= 90) return 6;
  return 4;
}

const CORNER_CHOICES = [
  { value: 10, label: "Net" },
  { value: 7, label: "Léger blanchiment" },
  { value: 4, label: "Écrasé / blanchi" },
] as const;

const EDGE_DEFECTS = [
  { key: "whitening-light", label: "Blanchiment léger des tranches", weight: 2 },
  { key: "whitening-heavy", label: "Blanchiment marqué", weight: 4 },
  { key: "nick", label: "Accroc / entaille", weight: 3 },
  { key: "wear", label: "Usure visible des bords", weight: 2 },
] as const;

const SURFACE_DEFECTS = [
  { key: "scratch-light", label: "Rayure légère (visible à la lumière)", weight: 2 },
  { key: "scratch-heavy", label: "Rayures multiples ou profondes", weight: 4 },
  { key: "dent", label: "Indentation / point d'impact", weight: 3 },
  { key: "print", label: "Défaut d'impression (ligne, tache d'encre)", weight: 1 },
  { key: "haze", label: "Voile, trace de doigt, saleté incrustée", weight: 2 },
  { key: "crease", label: "Pli ou cassure", weight: 6 },
] as const;

/* ————— Lignes-guides du centrage ————— */

type Guides = {
  oL: number;
  oR: number;
  oT: number;
  oB: number;
  iL: number;
  iR: number;
  iT: number;
  iB: number;
};

const DEFAULT_GUIDES: Guides = {
  oL: 0.04,
  oR: 0.96,
  oT: 0.03,
  oB: 0.97,
  iL: 0.13,
  iR: 0.87,
  iT: 0.15,
  iB: 0.82,
};

// Après redressement, la carte occupe le calque à 3 % près
const RECTIFIED_GUIDES: Guides = {
  ...DEFAULT_GUIDES,
  oL: 0.032,
  oR: 0.968,
  oT: 0.032,
  oB: 0.968,
};

type Quad = [Pt, Pt, Pt, Pt];

const DEFAULT_QUAD: Quad = [
  { x: 0.12, y: 0.08 },
  { x: 0.88, y: 0.08 },
  { x: 0.88, y: 0.92 },
  { x: 0.12, y: 0.92 },
];

function ratioPair(a: number, b: number): [number, number] {
  const total = a + b;
  if (total <= 0) return [50, 50];
  const left = Math.round((a / total) * 100);
  return [left, 100 - left];
}

/* ————— Composant ————— */

export function PregradeButton({
  itemId,
  photos,
}: {
  itemId: string;
  photos: GalleryPhoto[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        <Ruler size={15} aria-hidden />
        Pré-grader
      </button>
      {open && (
        <PregradeWizard
          itemId={itemId}
          photos={photos}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function PregradeWizard({
  itemId,
  photos,
  onClose,
}: {
  itemId: string;
  photos: GalleryPhoto[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [rectoId, setRectoId] = useState<string | null>(photos[0]?.id ?? null);
  const [versoId, setVersoId] = useState<string | null>(null);
  const [face, setFace] = useState<"r" | "v">("r");
  const [quad, setQuad] = useState<Quad>(DEFAULT_QUAD);
  const [quadV, setQuadV] = useState<Quad>(DEFAULT_QUAD);
  const [rectified, setRectified] = useState<string | null>(null);
  const [rectifiedV, setRectifiedV] = useState<string | null>(null);
  const [rectifying, setRectifying] = useState(false);
  const [guides, setGuides] = useState<Guides>(DEFAULT_GUIDES);
  const [guidesV, setGuidesV] = useState<Guides>(DEFAULT_GUIDES);
  const [corners, setCorners] = useState<(number | null)[]>([null, null, null, null]);
  const [cornersV, setCornersV] = useState<(number | null)[]>([null, null, null, null]);
  const [edgeDefects, setEdgeDefects] = useState<Set<string>>(new Set());
  const [surfaceDefects, setSurfaceDefects] = useState<Set<string>>(new Set());
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const recto = photos.find((p) => p.id === rectoId) ?? photos[0] ?? null;
  const verso = photos.find((p) => p.id === versoId) ?? null;

  /* Notes */
  const [lPct] = ratioPair(guides.iL - guides.oL, guides.oR - guides.iR);
  const [tPct] = ratioPair(guides.iT - guides.oT, guides.oB - guides.iB);
  const worstLR = Math.max(lPct, 100 - lPct);
  const worstTB = Math.max(tPct, 100 - tPct);
  const centeringNoteR = centeringGrade(Math.max(worstLR, worstTB));

  const [lPctV] = ratioPair(guidesV.iL - guidesV.oL, guidesV.oR - guidesV.iR);
  const [tPctV] = ratioPair(guidesV.iT - guidesV.oT, guidesV.oB - guidesV.iB);
  const centeringNoteV = verso
    ? centeringGradeBack(
        Math.max(
          Math.max(lPctV, 100 - lPctV),
          Math.max(tPctV, 100 - tPctV)
        )
      )
    : null;
  const centeringNote =
    centeringNoteV != null
      ? Math.min(centeringNoteR, centeringNoteV)
      : centeringNoteR;

  // Les 8 coins (4 recto + 4 verso si présent) comptent dans la note
  const cornerValues = [
    ...corners.filter((c): c is number => c != null),
    ...(verso ? cornersV.filter((c): c is number => c != null) : []),
  ];
  const cornersComplete =
    corners.every((c) => c != null) &&
    (!verso || cornersV.every((c) => c != null));
  const cornersNote =
    cornersComplete && cornerValues.length > 0
      ? Math.round(
          (Math.min(...cornerValues) +
            cornerValues.reduce((a, b) => a + b, 0) / cornerValues.length) /
            2
        )
      : null;

  const edgesNote = Math.max(
    2,
    10 - EDGE_DEFECTS.filter((d) => edgeDefects.has(d.key)).reduce((a, d) => a + d.weight, 0)
  );
  const surfaceNote = Math.max(
    2,
    10 -
      SURFACE_DEFECTS.filter((d) => surfaceDefects.has(d.key)).reduce(
        (a, d) => a + d.weight,
        0
      )
  );

  const allNotes =
    cornersNote != null
      ? [centeringNote, cornersNote, edgesNote, surfaceNote]
      : null;
  const globalNote = allNotes
    ? Math.min(
        Math.round(allNotes.reduce((a, b) => a + b, 0) / allNotes.length),
        Math.min(...allNotes) + 1
      )
    : null;

  const STEPS = [
    "Photos",
    "Cadrage",
    "Centrage",
    "Coins",
    "Défauts",
    "Bords & surface",
    "Verdict",
  ];
  const canNext =
    step === 0 ? recto != null : step === 3 ? cornersComplete : true;
  const workingUrl = rectified ?? recto?.url ?? null;
  const workingUrlV = verso ? rectifiedV ?? verso.url : null;

  async function rectifyOne(url: string, q: Quad): Promise<string> {
    const img = await loadImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = Math.round((900 * 88) / 63);
    warpCardToCanvas(img, q, canvas, { grid: 20 });
    return canvas.toDataURL("image/jpeg", 0.92);
  }

  // Étape cadrage → suivant : redresse recto (et verso) dans le calque
  async function goNext() {
    if (step === 1 && recto) {
      setRectifying(true);
      try {
        setRectified(await rectifyOne(recto.url, quad));
        setGuides(RECTIFIED_GUIDES);
      } catch {
        setToast("Redressement impossible — photo brute utilisée");
        setRectified(null);
      }
      if (verso) {
        try {
          setRectifiedV(await rectifyOne(verso.url, quadV));
          setGuidesV(RECTIFIED_GUIDES);
        } catch {
          setRectifiedV(null);
        }
      }
      setRectifying(false);
      setFace("r");
    }
    setStep((s) => s + 1);
  }

  async function save() {
    if (globalNote == null || cornersNote == null) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("item_id", itemId);
    fd.set("centering", String(centeringNote));
    fd.set("corners", String(cornersNote));
    fd.set("edges", String(edgesNote));
    fd.set("surface", String(surfaceNote));
    fd.set("grade", String(globalNote));
    fd.set(
      "ratios",
      JSON.stringify({ lr: [lPct, 100 - lPct], tb: [tPct, 100 - tPct] })
    );
    fd.set(
      "details",
      JSON.stringify({
        corners,
        cornersVerso: verso ? cornersV : null,
        edgeDefects: [...edgeDefects],
        surfaceDefects: [...surfaceDefects],
        annotations,
        verso: verso
          ? { lr: [lPctV, 100 - lPctV], tb: [tPctV, 100 - tPctV] }
          : null,
      })
    );
    if (rectified) {
      const blob = await (await fetch(rectified)).blob();
      fd.set("rectified", new File([blob], "rectified.jpg", { type: "image/jpeg" }));
    }
    if (rectifiedV) {
      const blob = await (await fetch(rectifiedV)).blob();
      fd.set(
        "rectified_verso",
        new File([blob], "rectified-verso.jpg", { type: "image/jpeg" })
      );
    }
    const { error } = await saveGrading(fd);
    setSaving(false);
    if (error) {
      setToast("Enregistrement impossible");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pré-gradation"
    >
      <div
        className="panel rise-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden !p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 border-b border-edge px-5 py-3.5">
          <Ruler size={16} className="shrink-0 text-accent-strong" aria-hidden />
          <p className="display text-base font-semibold">Pré-gradation</p>
          <p className="num ml-auto text-xs text-faint">
            {step + 1}/{STEPS.length} · {STEPS[step]}
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-raised hover:text-foreground"
          >
            <X size={15} aria-hidden />
          </button>
        </div>

        {/* Contenu */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 0 && (
            <StepPhotos
              photos={photos}
              rectoId={rectoId}
              versoId={versoId}
              onPickRecto={(id) => {
                setRectoId(id);
                setQuad(DEFAULT_QUAD);
                setRectified(null);
                setGuides(DEFAULT_GUIDES);
                if (versoId === id) setVersoId(null);
              }}
              onPickVerso={(id) => {
                setVersoId((v) => (v === id ? null : id));
                setQuadV(DEFAULT_QUAD);
                setRectifiedV(null);
                setGuidesV(DEFAULT_GUIDES);
              }}
            />
          )}
          {step === 1 && recto && (
            <>
              <FaceTabs face={face} onFace={setFace} hasVerso={verso != null} />
              {face === "r" || !verso ? (
                <StepFrame url={recto.url} quad={quad} onChange={setQuad} />
              ) : (
                <StepFrame url={verso.url} quad={quadV} onChange={setQuadV} />
              )}
            </>
          )}
          {step === 2 && workingUrl && (
            <>
              <FaceTabs face={face} onFace={setFace} hasVerso={workingUrlV != null} />
              {face === "r" || !workingUrlV ? (
                <StepCentering
                  url={workingUrl}
                  guides={guides}
                  onChange={setGuides}
                  lPct={lPct}
                  tPct={tPct}
                  note={centeringNoteR}
                />
              ) : (
                <StepCentering
                  url={workingUrlV}
                  guides={guidesV}
                  onChange={setGuidesV}
                  lPct={lPctV}
                  tPct={tPctV}
                  note={centeringNoteV ?? 10}
                />
              )}
              {workingUrlV != null && (
                <p className="mt-3 text-center text-xs text-muted">
                  Note centrage retenue (pire des deux faces) :{" "}
                  <span className="num font-bold text-accent-strong">
                    {centeringNote}/10
                  </span>
                </p>
              )}
            </>
          )}
          {step === 3 && workingUrl && (
            <>
              <FaceTabs face={face} onFace={setFace} hasVerso={workingUrlV != null} />
              {face === "v" && workingUrlV ? (
                <StepCorners
                  url={workingUrlV}
                  corners={cornersV}
                  onChange={setCornersV}
                />
              ) : (
                <StepCorners
                  url={workingUrl}
                  corners={corners}
                  onChange={setCorners}
                />
              )}
              {workingUrlV != null && (
                <p className="mt-3 text-center text-xs text-muted">
                  {cornersComplete
                    ? "Recto et verso évalués ✓"
                    : "Évalue les 4 coins du recto et du verso pour continuer."}
                </p>
              )}
            </>
          )}
          {step === 4 && workingUrl && (
            <>
              <p className="mb-1 text-sm font-medium">
                Repère et entoure les défauts visibles.
              </p>
              <p className="mb-3 text-xs text-muted">
                Incline la carte sous une lumière rasante. Chaque marque
                apparaîtra dans le rapport de la carte.
              </p>
              <FaceTabs face={face} onFace={setFace} hasVerso={workingUrlV != null} />
              <DefectAnnotator
                url={face === "v" && workingUrlV ? workingUrlV : workingUrl}
                face={face === "v" && workingUrlV ? "v" : "r"}
                annotations={annotations}
                onChange={setAnnotations}
              />
            </>
          )}
          {step === 5 && (
            <StepChecklists
              photos={photos}
              edgeDefects={edgeDefects}
              surfaceDefects={surfaceDefects}
              onEdge={setEdgeDefects}
              onSurface={setSurfaceDefects}
            />
          )}
          {step === 6 && globalNote != null && (
            <StepVerdict
              centering={centeringNote}
              corners={cornersNote!}
              edges={edgesNote}
              surface={surfaceNote}
              global={globalNote}
            />
          )}
        </div>

        {/* Pied */}
        <div className="flex items-center justify-between border-t border-edge px-5 py-3">
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="btn btn-ghost"
          >
            <ChevronLeft size={15} aria-hidden />
            {step === 0 ? "Annuler" : "Retour"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canNext || rectifying}
              onClick={goNext}
              className="btn btn-primary disabled:opacity-50"
            >
              {rectifying ? "Redressement…" : "Suivant"}
              <ChevronRight size={15} aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={save}
              className="btn btn-primary disabled:opacity-50"
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
      {toast && <Toast message={toast} tone="error" onDone={() => setToast(null)} />}
    </div>
  );
}

/* ————— Étape 0 : choix des photos ————— */

function FaceTabs({
  face,
  onFace,
  hasVerso,
}: {
  face: "r" | "v";
  onFace: (f: "r" | "v") => void;
  hasVerso: boolean;
}) {
  if (!hasVerso) return null;
  return (
    <div className="mb-3 flex justify-center">
      <div className="flex overflow-hidden rounded-lg border border-edge">
        {(["r", "v"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => onFace(f)}
            aria-pressed={face === f}
            className={`px-4 py-1.5 text-[13px] transition ${
              face === f
                ? "bg-accent-soft font-medium text-accent-strong"
                : "text-muted hover:text-foreground"
            } ${f === "v" ? "border-l border-edge" : ""}`}
          >
            {f === "r" ? "Recto" : "Verso"}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepPhotos({
  photos,
  rectoId,
  versoId,
  onPickRecto,
  onPickVerso,
}: {
  photos: GalleryPhoto[];
  rectoId: string | null;
  versoId: string | null;
  onPickRecto: (id: string) => void;
  onPickVerso: (id: string) => void;
}) {
  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <Camera size={40} strokeWidth={1.3} className="text-faint" aria-hidden />
        <p className="display text-lg font-semibold">Ajoute d&apos;abord une photo</p>
        <p className="max-w-sm text-sm text-muted">
          La pré-gradation travaille sur tes photos. Prends le recto (et
          idéalement le verso) : carte à plat, lumière du jour sans reflet,
          cadrage serré et bien perpendiculaire.
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 text-sm font-medium">
        Désigne le recto — et le verso si tu l&apos;as photographié.
      </p>
      <p className="mb-4 text-xs text-muted">
        Avec le verso, le centrage est jugé sur les deux faces, comme chez
        les vrais gradeurs. Idéalement : à plat, lumière diffuse, prise bien
        en face.
      </p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((p) => {
          const isR = p.id === rectoId;
          const isV = p.id === versoId;
          return (
            <div key={p.id}>
              <div
                className={`overflow-hidden rounded-xl border-2 transition ${
                  isR ? "border-accent" : isV ? "border-gain" : "border-transparent opacity-80"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt={p.label ?? ""}
                  className="aspect-[3/4] w-full object-cover"
                />
              </div>
              <div className="mt-1.5 flex gap-1">
                <button
                  type="button"
                  onClick={() => onPickRecto(p.id)}
                  aria-pressed={isR}
                  className={`flex-1 rounded-full border px-2 py-1 text-[11px] transition ${
                    isR
                      ? "border-accent/50 bg-accent-soft font-semibold text-accent-strong"
                      : "border-edge text-muted hover:text-foreground"
                  }`}
                >
                  Recto
                </button>
                <button
                  type="button"
                  onClick={() => onPickVerso(p.id)}
                  aria-pressed={isV}
                  disabled={isR}
                  className={`flex-1 rounded-full border px-2 py-1 text-[11px] transition disabled:opacity-30 ${
                    isV
                      ? "border-gain/50 bg-gain/15 font-semibold text-gain"
                      : "border-edge text-muted hover:text-foreground"
                  }`}
                >
                  Verso
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ————— Étape 1 : cadrage dans le calque carte ————— */

function StepFrame({
  url,
  quad,
  onChange,
}: {
  url: string;
  quad: Quad;
  onChange: (q: Quad) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const dragIdx = useRef<number | null>(null);
  const [imgReady, setImgReady] = useState(false);

  useEffect(() => {
    let on = true;
    loadImage(url)
      .then((img) => {
        if (on) {
          imgRef.current = img;
          setImgReady(true);
        }
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [url]);

  useEffect(() => {
    const canvas = previewRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !imgReady) return;
    try {
      warpCardToCanvas(img, quad, canvas, { grid: 8 });
    } catch {}
  }, [quad, imgReady]);

  function onMove(e: React.PointerEvent) {
    const idx = dragIdx.current;
    if (idx == null || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const next = [...quad] as Quad;
    next[idx] = {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
    onChange(next);
  }

  return (
    <div>
      <p className="mb-1 text-sm font-medium">
        Pose les 4 poignées sur les coins de ta carte.
      </p>
      <p className="mb-3 text-xs text-muted">
        L&apos;app redresse la photo dans un calque au format carte (63×88) —
        l&apos;aperçu à droite se met à jour en direct : ajuste jusqu&apos;à ce
        que la carte le remplisse parfaitement.
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-center">
        <div
          ref={boxRef}
          onPointerMove={onMove}
          onPointerUp={() => (dragIdx.current = null)}
          className="relative w-fit max-w-full touch-none select-none rounded-xl border border-edge"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Photo" className="max-h-[44vh] w-auto" draggable={false} />
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            <polygon
              points={quad.map((p) => `${p.x * 100},${p.y * 100}`).join(" ")}
              fill="var(--accent)"
              fillOpacity="0.12"
              stroke="var(--accent)"
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {quad.map((p, i) => (
            <div
              key={i}
              onPointerDown={(e) => {
                dragIdx.current = i;
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
              }}
              className="absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 border-white bg-accent/90 shadow-md"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            />
          ))}
        </div>
        <div className="shrink-0 text-center">
          <p className="label-xs mb-2">Aperçu du calque</p>
          <canvas
            ref={previewRef}
            width={170}
            height={Math.round((170 * 88) / 63)}
            className="rounded-xl border border-edge-strong shadow-lg"
          />
        </div>
      </div>
    </div>
  );
}

/* ————— Étape 2 : centrage ————— */

function StepCentering({
  url,
  guides,
  onChange,
  lPct,
  tPct,
  note,
}: {
  url: string;
  guides: Guides;
  onChange: (g: Guides) => void;
  lPct: number;
  tPct: number;
  note: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragKey = useRef<keyof Guides | null>(null);

  function fromEvent(e: React.PointerEvent): { x: number; y: number } {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function onMove(e: React.PointerEvent) {
    const key = dragKey.current;
    if (!key) return;
    const { x, y } = fromEvent(e);
    const vertical = key === "oL" || key === "oR" || key === "iL" || key === "iR";
    onChange({ ...guides, [key]: vertical ? x : y });
  }

  const lines: { key: keyof Guides; vertical: boolean; outer: boolean }[] = [
    { key: "oL", vertical: true, outer: true },
    { key: "oR", vertical: true, outer: true },
    { key: "oT", vertical: false, outer: true },
    { key: "oB", vertical: false, outer: true },
    { key: "iL", vertical: true, outer: false },
    { key: "iR", vertical: true, outer: false },
    { key: "iT", vertical: false, outer: false },
    { key: "iB", vertical: false, outer: false },
  ];

  return (
    <div>
      <p className="mb-1 text-sm font-medium">
        Place les lignes <span className="text-accent-strong">rouges</span> sur les
        bords de la carte, les <span className="text-gain">vertes</span> sur le
        cadre de l&apos;illustration.
      </p>
      <p className="mb-3 text-xs text-muted">
        Les ratios se mesurent en direct — c&apos;est la note la plus objective
        de toute l&apos;évaluation.
      </p>
      <div
        ref={boxRef}
        onPointerMove={onMove}
        onPointerUp={() => (dragKey.current = null)}
        className="relative mx-auto w-fit max-w-full touch-none select-none rounded-xl border border-edge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Recto" className="max-h-[46vh] w-auto" draggable={false} />
        {lines.map(({ key, vertical, outer }) => (
          <div
            key={key}
            onPointerDown={(e) => {
              dragKey.current = key;
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            className={`absolute ${
              vertical ? "top-0 h-full w-4 cursor-ew-resize" : "left-0 w-full h-4 cursor-ns-resize"
            }`}
            style={
              vertical
                ? { left: `calc(${guides[key] * 100}% - 8px)` }
                : { top: `calc(${guides[key] * 100}% - 8px)` }
            }
          >
            <div
              className={`${vertical ? "mx-auto h-full w-0.5" : "my-auto mt-[7px] h-0.5 w-full"} ${
                outer ? "bg-accent" : "bg-gain"
              }`}
            />
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
        <div className="text-center">
          <p className="label-xs">Gauche / Droite</p>
          <p className="num text-lg font-bold">
            {lPct}/{100 - lPct}
          </p>
        </div>
        <div className="text-center">
          <p className="label-xs">Haut / Bas</p>
          <p className="num text-lg font-bold">
            {tPct}/{100 - tPct}
          </p>
        </div>
        <div className="text-center">
          <p className="label-xs">Note centrage</p>
          <p className="num text-lg font-bold text-accent-strong">{note}/10</p>
        </div>
      </div>
    </div>
  );
}

/* ————— Étape 2 : coins (zooms navigables) ————— */

const CORNER_POS = [
  { label: "Haut gauche", fx: 0, fy: 0 },
  { label: "Haut droit", fx: 1, fy: 0 },
  { label: "Bas gauche", fx: 0, fy: 1 },
  { label: "Bas droit", fx: 1, fy: 1 },
];

/** Zoom navigable : glisser pour se déplacer, molette pour zoomer.
 * La position est stockée en fraction du débattement réel (0 = bord
 * gauche/haut de l'image, 1 = bord droit/bas), calculé avec les vraies
 * proportions de l'image — les coins bas tombent pile sur le bas. */
function CornerViewer({
  url,
  label,
  fx,
  fy,
}: {
  url: string;
  label: string;
  fx: number;
  fy: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(5);
  const [ar, setAr] = useState<number | null>(null); // hauteur/largeur de l'image
  const [pan, setPan] = useState({ px: fx, py: fy });
  const drag = useRef<{ cx: number; cy: number; px: number; py: number } | null>(
    null
  );

  // Vignette au ratio fixe 4:3 → débattements calculables sans mesure
  const CONT_AR = 4 / 3;
  function extras(s: number) {
    const wPct = s * 100;
    const hPct = ar ? s * CONT_AR * ar * 100 : s * 100;
    return { exW: Math.max(0, wPct - 100), exH: Math.max(0, hPct - 100), wPct };
  }

  const { exW, exH, wPct } = extras(scale);

  return (
    <div
      ref={boxRef}
      onPointerDown={(e) => {
        drag.current = { cx: e.clientX, cy: e.clientY, px: pan.px, py: pan.py };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!drag.current || !boxRef.current) return;
        const r = boxRef.current.getBoundingClientRect();
        const { exW: w, exH: h } = extras(scale);
        const dx = w > 0 ? ((e.clientX - drag.current.cx) / r.width) * 100 / w : 0;
        const dy = h > 0 ? ((e.clientY - drag.current.cy) / r.height) * 100 / h : 0;
        setPan({
          px: Math.min(1, Math.max(0, drag.current.px - dx)),
          py: Math.min(1, Math.max(0, drag.current.py - dy)),
        });
      }}
      onPointerUp={() => (drag.current = null)}
      onWheel={(e) => {
        setScale((s) => Math.min(8, Math.max(2, s - Math.sign(e.deltaY) * 0.5)));
      }}
      className="relative mb-3 aspect-[4/3] w-full cursor-grab touch-none select-none overflow-hidden rounded-lg bg-raised active:cursor-grabbing"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={label}
        draggable={false}
        onLoad={(e) =>
          setAr(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)
        }
        className="absolute max-w-none"
        style={{
          width: `${wPct}%`,
          left: `${-pan.px * exW}%`,
          top: `${-pan.py * exH}%`,
        }}
      />
      <span className="num absolute bottom-1 right-1.5 rounded bg-black/50 px-1 text-[10px] text-white">
        ×{scale.toFixed(1).replace(/\.0$/, "")}
      </span>
    </div>
  );
}

function StepCorners({
  url,
  corners,
  onChange,
}: {
  url: string;
  corners: (number | null)[];
  onChange: (c: (number | null)[]) => void;
}) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">
        Chaque coin, agrandi ×5 — juge ce que tu vois.
      </p>
      <p className="mb-4 text-xs text-muted">
        Glisse l&apos;image pour recadrer sur le coin, molette pour zoomer.
        Un coin « net » est parfaitement pointu, sans trace blanche.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {CORNER_POS.map((c, i) => (
          <div key={c.label} className="rounded-xl border border-edge p-3">
            <p className="label-xs mb-2">{c.label}</p>
            <CornerViewer url={url} label={c.label} fx={c.fx} fy={c.fy} />
            <div className="flex flex-wrap gap-1.5">
              {CORNER_CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  onClick={() => {
                    const next = [...corners];
                    next[i] = choice.value;
                    onChange(next);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs transition ${
                    corners[i] === choice.value
                      ? "border-accent/50 bg-accent-soft font-medium text-accent-strong"
                      : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
                  }`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ————— Étape 3 : bords & surface ————— */

function Checklist({
  title,
  hint,
  defects,
  checked,
  onToggle,
}: {
  title: string;
  hint: string;
  defects: readonly { key: string; label: string; weight: number }[];
  checked: Set<string>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="rounded-xl border border-edge p-4">
      <p className="text-sm font-medium">{title}</p>
      <p className="mb-3 text-xs text-muted">{hint}</p>
      <div className="flex flex-col gap-1.5">
        {defects.map((d) => (
          <label
            key={d.key}
            className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
              checked.has(d.key)
                ? "border-accent/50 bg-accent-soft text-accent-strong"
                : "border-edge text-muted hover:border-edge-strong hover:text-foreground"
            }`}
          >
            <input
              type="checkbox"
              checked={checked.has(d.key)}
              onChange={() => onToggle(d.key)}
              className="accent-[var(--accent)]"
            />
            {d.label}
          </label>
        ))}
      </div>
    </div>
  );
}

function StepChecklists({
  photos,
  edgeDefects,
  surfaceDefects,
  onEdge,
  onSurface,
}: {
  photos: GalleryPhoto[];
  edgeDefects: Set<string>;
  surfaceDefects: Set<string>;
  onEdge: (s: Set<string>) => void;
  onSurface: (s: Set<string>) => void;
}) {
  function toggle(set: Set<string>, key: string, cb: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    cb(next);
  }
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        Examine la carte en main (et tes photos, dont le verso) sous une
        lumière rasante, puis coche uniquement ce que tu constates.
      </p>
      {photos.length > 1 && (
        <div className="scrollbar-none flex gap-2 overflow-x-auto">
          {photos.map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p.id}
              src={p.url}
              alt={p.label ?? ""}
              className="h-24 w-auto rounded-lg border border-edge"
            />
          ))}
        </div>
      )}
      <Checklist
        title="Bords"
        hint="Les quatre tranches, recto et verso."
        defects={EDGE_DEFECTS}
        checked={edgeDefects}
        onToggle={(k) => toggle(edgeDefects, k, onEdge)}
      />
      <Checklist
        title="Surface"
        hint="Incline la carte sous la lumière pour révéler rayures et indentations."
        defects={SURFACE_DEFECTS}
        checked={surfaceDefects}
        onToggle={(k) => toggle(surfaceDefects, k, onSurface)}
      />
    </div>
  );
}

/* ————— Étape 4 : verdict ————— */

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="label-xs">{label}</span>
        <span className="num text-sm font-bold">{value}/10</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-raised">
        <div
          className={`h-full rounded-full ${
            value >= 8 ? "bg-gain" : value >= 6 ? "bg-accent" : "bg-loss"
          }`}
          style={{ width: `${value * 10}%` }}
        />
      </div>
    </div>
  );
}

function StepVerdict({
  centering,
  corners,
  edges,
  surface,
  global,
}: {
  centering: number;
  corners: number;
  edges: number;
  surface: number;
  global: number;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-2">
      <div className="flex flex-col items-center gap-1">
        <Sparkles size={20} className="text-accent-strong" aria-hidden />
        <p className="label-xs">Pré-grade estimé</p>
        <p className="display num text-5xl font-bold leading-none">{global}</p>
        <p className="text-sm text-muted">{GRADE_LABELS[global] ?? ""}</p>
      </div>
      <div className="grid w-full max-w-sm gap-3">
        <Gauge label="Centrage" value={centering} />
        <Gauge label="Coins" value={corners} />
        <Gauge label="Bords" value={edges} />
        <Gauge label="Surface" value={surface} />
      </div>
      <p className="max-w-sm text-center text-xs text-faint">
        Estimation indicative, plafonnée par le pire critère — elle ne
        remplace pas une gradation professionnelle.
      </p>
    </div>
  );
}
