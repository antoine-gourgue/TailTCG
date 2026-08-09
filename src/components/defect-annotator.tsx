"use client";

import { useRef, useState } from "react";
import { Trash2, Undo2 } from "lucide-react";
import {
  DEFECT_KINDS,
  defectMeta,
  pointsToSvg,
  type Annotation,
  type DefectKind,
  type Pt,
} from "@/lib/grading-defects";

/**
 * Dessin libre pour cerner les défauts sur une carte redressée : trace
 * à main levée, le trait prend le type sélectionné. Points normalisés 0..1.
 */
export function DefectAnnotator({
  url,
  face,
  annotations,
  onChange,
}: {
  url: string;
  face: "r" | "v";
  annotations: Annotation[];
  onChange: (next: Annotation[]) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<DefectKind>("scratch");
  const [draft, setDraft] = useState<Pt[] | null>(null);
  const drawing = useRef(false);

  const here = annotations.filter((a) => a.face === face);

  function pos(e: React.PointerEvent): Pt {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drawing.current = true;
    setDraft([pos(e)]);
  }

  function onMove(e: React.PointerEvent) {
    if (!drawing.current) return;
    setDraft((d) => (d ? [...d, pos(e)] : [pos(e)]));
  }

  function onUp() {
    drawing.current = false;
    if (draft && draft.length > 2) {
      onChange([...annotations, { face, kind, points: draft }]);
    }
    setDraft(null);
  }

  function removeAt(idxInFace: number) {
    let seen = -1;
    onChange(
      annotations.filter((a) => {
        if (a.face !== face) return true;
        seen += 1;
        return seen !== idxInFace;
      })
    );
  }

  function undoLast() {
    for (let i = annotations.length - 1; i >= 0; i--) {
      if (annotations[i].face === face) {
        onChange(annotations.filter((_, j) => j !== i));
        return;
      }
    }
  }

  const draftColor = defectMeta(kind).color;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {DEFECT_KINDS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setKind(d.key)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              kind === d.key
                ? "border-foreground font-medium"
                : "border-edge text-muted hover:text-foreground"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: d.color }}
              aria-hidden
            />
            {d.label}
          </button>
        ))}
      </div>

      <div
        ref={boxRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="relative mx-auto w-fit max-w-full cursor-crosshair touch-none select-none overflow-hidden rounded-xl border border-edge"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="Carte" className="max-h-[46vh] w-auto" draggable={false} />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          {here.map((a, i) => (
            <polyline
              key={i}
              points={pointsToSvg(a.points)}
              fill="none"
              stroke={defectMeta(a.kind).color}
              strokeWidth={0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {draft && draft.length > 1 && (
            <polyline
              points={pointsToSvg(draft)}
              fill="none"
              stroke={draftColor}
              strokeWidth={0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {here.length > 0 && (
          <button
            type="button"
            onClick={undoLast}
            className="btn btn-ghost !py-1.5 text-[13px]"
          >
            <Undo2 size={13} aria-hidden />
            Annuler le dernier
          </button>
        )}
      </div>

      {here.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {here.map((a, i) => {
            const m = defectMeta(a.kind);
            return (
              <li
                key={i}
                className="flex items-center gap-2 rounded-lg border border-edge px-3 py-1.5 text-sm"
              >
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: m.color }}
                  aria-hidden
                />
                {m.label}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label="Retirer"
                  className="ml-auto text-faint transition hover:text-loss"
                >
                  <Trash2 size={14} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-xs text-faint">
        Dessine autour d&apos;un défaut pour l&apos;entourer. Vide = aucun
        défaut notable.
      </p>
    </div>
  );
}
