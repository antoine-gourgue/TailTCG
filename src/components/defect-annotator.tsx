"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import {
  DEFECT_KINDS,
  defectMeta,
  type Annotation,
  type DefectKind,
} from "@/lib/grading-defects";

/**
 * Entoure les défauts sur une carte redressée : glisser pour tracer un
 * rectangle, il prend le type sélectionné. Coordonnées normalisées 0..1.
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
  const [draft, setDraft] = useState<Annotation | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const here = annotations.filter((a) => a.face === face);

  function pos(e: React.PointerEvent) {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function onDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const p = pos(e);
    start.current = p;
    setDraft({ face, kind, x: p.x, y: p.y, w: 0, h: 0 });
  }

  function onMove(e: React.PointerEvent) {
    if (!start.current) return;
    const p = pos(e);
    const s = start.current;
    setDraft({
      face,
      kind,
      x: Math.min(s.x, p.x),
      y: Math.min(s.y, p.y),
      w: Math.abs(p.x - s.x),
      h: Math.abs(p.y - s.y),
    });
  }

  function onUp() {
    if (draft && draft.w > 0.02 && draft.h > 0.02) {
      onChange([...annotations, draft]);
    }
    start.current = null;
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
        {[...here, ...(draft ? [draft] : [])].map((a, i) => {
          const m = defectMeta(a.kind);
          return (
            <span
              key={i}
              className="pointer-events-none absolute rounded-md border-2"
              style={{
                left: `${a.x * 100}%`,
                top: `${a.y * 100}%`,
                width: `${a.w * 100}%`,
                height: `${a.h * 100}%`,
                borderColor: m.color,
                boxShadow: `0 0 0 9999px ${m.color}0f inset`,
              }}
            />
          );
        })}
      </div>

      {here.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
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
        Glisse sur la carte pour entourer un défaut. Vide = aucun défaut
        notable.
      </p>
    </div>
  );
}
