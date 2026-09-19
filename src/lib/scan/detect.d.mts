export declare const CARD_W: number;
export declare const CARD_H: number;
/** Réglages de détection modifiables par les bancs (scripts/scan-*-bench.mjs) */
export declare const TUNE: {
  houghStepDeg: number;
  houghOnRaw: boolean;
  familyDist: number;
  traceGap: number;
  hiddenSide: "always" | "fallback" | "off";
  hiddenClean: number;
  hiddenPenalty: number;
  hiddenRatioGuess: boolean;
  hiddenReach: number;
};
export type Pt = [number, number];
export type QuadCandidate = { corners: Pt[]; area: number; ratio: number; support: number; minSide: number; rim: number; through: number; contains?: boolean; fragment?: boolean; hidden?: boolean; score: number };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DetectDebug = { closed?: number; hough?: number; lines?: unknown[]; edges?: any; blur?: any; evaluate?: (q: Pt[]) => unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function detectCardQuads(cv: any, src: any, k?: number, debug?: DetectDebug): QuadCandidate[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function detectCardQuad(cv: any, src: any, debug?: DetectDebug): QuadCandidate | null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function trackCardQuad(cv: any, src: any, prev: Pt[], k?: number, margin?: number): QuadCandidate[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export declare function warpCard(cv: any, src: any, corners: Pt[]): any;
