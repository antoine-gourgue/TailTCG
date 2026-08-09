// Types de défauts entourables lors de la pré-gradation
export const DEFECT_KINDS = [
  { key: "scratch", label: "Rayure", color: "#e4572e" },
  { key: "whitening", label: "Blanchiment", color: "#f5a623" },
  { key: "dent", label: "Indentation", color: "#9b5de5" },
  { key: "print", label: "Défaut d'impression", color: "#2d7dd2" },
  { key: "crease", label: "Pli", color: "#d7263d" },
  { key: "other", label: "Autre", color: "#7a8290" },
] as const;

export type DefectKind = (typeof DEFECT_KINDS)[number]["key"];

export type Pt = { x: number; y: number };

export type Annotation = {
  face: "r" | "v";
  kind: DefectKind;
  // Tracé libre : points normalisés (0..1) relatifs à l'image redressée
  points: Pt[];
};

/** Chaîne "x,y x,y …" en pourcentage pour un <polyline> SVG */
export function pointsToSvg(points: Pt[] | undefined | null): string {
  if (!points) return "";
  return points.map((p) => `${p.x * 100},${p.y * 100}`).join(" ");
}

/** Ne garde que les annotations au format tracé libre (points) */
export function withPoints(annotations: Annotation[] | undefined | null): Annotation[] {
  return (annotations ?? []).filter(
    (a) => Array.isArray(a.points) && a.points.length > 1
  );
}

export function defectMeta(kind: string) {
  return DEFECT_KINDS.find((d) => d.key === kind) ?? DEFECT_KINDS[5];
}
