"use client";

import { useEffect, useState } from "react";
import { FileText, X } from "lucide-react";
import { GRADE_LABELS } from "@/lib/grading";
import {
  defectMeta,
  pointsToSvg,
  withPoints,
  type Annotation,
} from "@/lib/grading-defects";
import { Logo } from "@/components/logo";

export type GradingReportData = {
  grade: number;
  centering: number;
  corners: number;
  edges: number;
  surface: number;
  createdAt: string | null;
  ratios: { lr?: [number, number]; tb?: [number, number] } | null;
  annotations: Annotation[];
  rectoUrl: string | null;
  versoUrl: string | null;
  cardName: string;
  setName: string;
  localId: string;
};

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

function AnnotatedFace({
  url,
  face,
  annotations,
  legend,
}: {
  url: string;
  face: "r" | "v";
  annotations: Annotation[];
  legend: string;
}) {
  const here = withPoints(annotations).filter((a) => a.face === face);
  return (
    <div>
      <p className="label-xs mb-1.5">{legend}</p>
      <div className="relative overflow-hidden rounded-xl border border-edge">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={legend} className="w-full" />
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
        </svg>
      </div>
    </div>
  );
}

// Modale contrôlée : réutilisée par le bouton (fiche) et le boîtier (vitrine)
export function GradingReportModal({
  data,
  open,
  onClose,
}: {
  data: GradingReportData;
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Rapport de pré-gradation"
    >
      <div
        className="panel rise-in flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden !p-0"
        onClick={(e) => e.stopPropagation()}
      >
            {/* En-tête */}
            <div className="flex items-center gap-3 border-b border-edge px-5 py-3.5">
              <Logo variant="mark" size={22} />
              <div className="min-w-0 flex-1">
                <p className="display truncate text-base font-semibold">
                  {data.cardName}
                </p>
                <p className="truncate text-xs text-muted">
                  {data.setName} <span className="num">· {data.localId}</span>
                </p>
              </div>
              <div className="shrink-0 text-center">
                <p className="num text-2xl font-black leading-none">{data.grade}</p>
                <p className="text-[9px] font-semibold uppercase tracking-wider text-muted">
                  {GRADE_LABELS[data.grade] ?? ""}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Fermer"
                className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-muted transition hover:bg-raised hover:text-foreground"
              >
                <X size={15} aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {/* Notes */}
              <div className="mb-6 grid gap-3 sm:grid-cols-2">
                <Gauge label="Centrage" value={data.centering} />
                <Gauge label="Coins" value={data.corners} />
                <Gauge label="Bords" value={data.edges} />
                <Gauge label="Surface" value={data.surface} />
              </div>

              {/* Centrage mesuré */}
              {data.ratios?.lr && data.ratios?.tb && (
                <div className="mb-6 flex flex-wrap gap-x-8 gap-y-2">
                  <div>
                    <p className="label-xs">Centrage G/D</p>
                    <p className="num text-sm font-bold">
                      {data.ratios.lr[0]}/{data.ratios.lr[1]}
                    </p>
                  </div>
                  <div>
                    <p className="label-xs">Centrage H/B</p>
                    <p className="num text-sm font-bold">
                      {data.ratios.tb[0]}/{data.ratios.tb[1]}
                    </p>
                  </div>
                </div>
              )}

              {/* Cartes annotées */}
              {(data.rectoUrl || data.versoUrl) && (
                <div className="mb-6 grid gap-4 sm:grid-cols-2">
                  {data.rectoUrl && (
                    <AnnotatedFace
                      url={data.rectoUrl}
                      face="r"
                      annotations={data.annotations}
                      legend="Recto"
                    />
                  )}
                  {data.versoUrl && (
                    <AnnotatedFace
                      url={data.versoUrl}
                      face="v"
                      annotations={data.annotations}
                      legend="Verso"
                    />
                  )}
                </div>
              )}

              {/* Défauts relevés */}
              <p className="label-xs mb-2">Défauts relevés</p>
              {data.annotations.length === 0 ? (
                <p className="text-sm text-muted">Aucun défaut notable entouré.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {data.annotations.map((a, i) => {
                    const m = defectMeta(a.kind);
                    return (
                      <li
                        key={i}
                        className="flex items-center gap-2.5 rounded-lg border border-edge px-3 py-1.5 text-sm"
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: m.color }}
                          aria-hidden
                        />
                        {m.label}
                        <span className="ml-auto text-xs text-faint">
                          {a.face === "v" ? "verso" : "recto"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}

              <p className="mt-6 text-center text-xs text-faint">
                Pré-gradation indicative — ne remplace pas une gradation
                professionnelle.
                {data.createdAt
                  ? ` Évaluée le ${new Date(data.createdAt).toLocaleDateString("fr-FR")}.`
                  : ""}
              </p>
            </div>
      </div>
    </div>
  );
}

// Bouton « Rapport » (fiche carte)
export function GradingReportButton({ data }: { data: GradingReportData }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-ghost">
        <FileText size={15} aria-hidden />
        Rapport
      </button>
      <GradingReportModal data={data} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
