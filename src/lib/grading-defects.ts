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

export type Annotation = {
  face: "r" | "v";
  kind: DefectKind;
  // Rectangle normalisé (0..1) relatif à l'image redressée
  x: number;
  y: number;
  w: number;
  h: number;
};

export function defectMeta(kind: string) {
  return DEFECT_KINDS.find((d) => d.key === kind) ?? DEFECT_KINDS[5];
}
